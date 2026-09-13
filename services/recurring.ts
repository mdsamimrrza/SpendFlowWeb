/**
 * Recurring rules service — mobile services/recurring.ts parity:
 * list/create/update/delete rules, monthly normalization
 * (daily×30, weekly×4.33), and the idempotent due-expenses generation engine
 * (upsert ON CONFLICT (recurring_rule_id, date), forward-only next_due_date).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RecurringRule } from "@/types/database.types";
import { toISODate } from "@/utils/format";
import { getRateSnapshot } from "./exchange";

export type RecurringRuleRow = RecurringRule & {
  categories: { id: string; name: string; icon: string; color: string } | null;
};

export function monthlyNormalized(rule: RecurringRuleRow): number {
  if (rule.frequency === "daily") return rule.amount * 30;
  if (rule.frequency === "weekly") return rule.amount * 4.33;
  return rule.amount; // monthly / custom treated as monthly
}

const SELECT_COLUMNS =
  "id, user_id, category_id, amount, currency, description, payment_method, frequency, next_due_date, is_active, created_at, updated_at, categories:category_id (id, name, icon, color)";

export async function listRecurringRules(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecurringRuleRow[]> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .order("next_due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecurringRuleRow[];
}

export interface RecurringRuleInput {
  categoryId: string;
  amount: number;
  currency: string;
  description?: string | null;
  paymentMethod: "Cash" | "Card" | "UPI" | "Other";
  frequency: "daily" | "weekly" | "monthly";
  nextDueDate: string;
  isActive?: boolean;
}

export async function createRecurringRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RecurringRuleInput,
): Promise<RecurringRule> {
  const snapshot = await getRateSnapshot(supabase, input.currency, input.nextDueDate);
  const { data, error } = await supabase
    .from("recurring_rules")
    .insert({
      user_id: userId,
      category_id: input.categoryId,
      amount: input.amount,
      currency: input.currency,
      description: input.description ?? null,
      payment_method: input.paymentMethod,
      frequency: input.frequency,
      next_due_date: input.nextDueDate,
      is_active: input.isActive ?? true,
      exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
      base_currency: snapshot.base_currency,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RecurringRule;
}

export async function updateRecurringRule(
  supabase: SupabaseClient<Database>,
  id: string,
  update: Partial<RecurringRuleInput>,
): Promise<RecurringRule> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .update({
      ...(update.categoryId != null ? { category_id: update.categoryId } : {}),
      ...(update.amount != null ? { amount: update.amount } : {}),
      ...(update.currency != null ? { currency: update.currency } : {}),
      ...(update.description !== undefined ? { description: update.description } : {}),
      ...(update.paymentMethod != null ? { payment_method: update.paymentMethod } : {}),
      ...(update.frequency != null ? { frequency: update.frequency } : {}),
      ...(update.nextDueDate != null ? { next_due_date: update.nextDueDate } : {}),
      ...(update.isActive != null ? { is_active: update.isActive } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as RecurringRule;
}

/** Hard delete — expenses keep their rows (FK is ON DELETE SET NULL). */
export async function deleteRecurringRule(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
  if (error) throw error;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  // Clamps overflow (Jan 31 + 1mo → Feb 28) — acceptable for due dates.
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

function nextDue(iso: string, frequency: RecurringRule["frequency"]): string {
  if (frequency === "daily") return addDays(iso, 1);
  if (frequency === "weekly") return addDays(iso, 7);
  return addMonths(iso, 1);
}

/**
 * Generate due expenses (mobile parity): for every active rule whose
 * next_due_date has arrived, upsert expense rows keyed by
 * (recurring_rule_id, date) — re-running never duplicates — then advance
 * next_due_date forward-only until it is in the future.
 */
export async function generateDueRecurringExpenses(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const today = toISODate(new Date());
  const { data: rules, error } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .lte("next_due_date", today);
  if (error) throw error;
  if (!rules?.length) return 0;

  let created = 0;
  for (const rule of rules as RecurringRule[]) {
    const rows: Database["public"]["Tables"]["expenses"]["Insert"][] = [];
    let due = rule.next_due_date;
    // Safety cap (20 cycles) so a broken date can't loop forever.
    let guard = 0;
    while (due <= today && guard < 20) {
      const snapshot = await getRateSnapshot(supabase, rule.currency, due);
      rows.push({
        user_id: userId,
        category_id: rule.category_id,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description ?? "Recurring",
        date: due,
        payment_method: rule.payment_method,
        is_recurring: true,
        recurring_rule_id: rule.id,
        is_synced: true,
        exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
        base_currency: snapshot.base_currency,
        type: "expense",
      });
      due = nextDue(due, rule.frequency);
      guard += 1;
    }
    if (rows.length === 0) continue;
    const { error: upsertError } = await supabase
      .from("expenses")
      .upsert(rows, { onConflict: "recurring_rule_id,date" });
    if (upsertError) throw upsertError;
    created += rows.length;
    const { error: advanceError } = await supabase
      .from("recurring_rules")
      .update({ next_due_date: due })
      .eq("id", rule.id);
    if (advanceError) throw advanceError;
  }
  return created;
}
