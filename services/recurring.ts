/**
 * Recurring plans service — mobile services/recurring.ts parity
 * (docs/recurring-plan.md + migration 20260915000000_recurring_payment_model.sql):
 * schedule-locked chains, `custom` frequency via `interval_days`, billing
 * `mode` (auto_charge posts itself; pay_on_due books money only on an
 * explicit tap), and the shared occurrence writes keyed by the
 * (recurring_rule_id, recurring_due_date) slot index — phone, web and the
 * generator can never double-book the same installment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RecurringRule } from "@/types/database.types";
import { toISODate, todayISO } from "@/utils/format";
import { getRateSnapshot } from "./exchange";

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "custom";
export type RecurringMode = "auto_charge" | "pay_on_due";

export type RecurringRuleRow = RecurringRule & {
  categories: { id: string; name: string; icon: string; color: string } | null;
};

/** Effective billing mode (rows predating the model default to auto_charge). */
export function ruleMode(rule: Pick<RecurringRule, "mode">): RecurringMode {
  return (rule.mode ?? "auto_charge") as RecurringMode;
}

/**
 * Monthly commitment normalization (mobile Recurring tab math):
 * daily×30, weekly×4.33, custom amortized by its interval.
 */
export function monthlyNormalized(
  rule: Pick<RecurringRule, "amount" | "frequency" | "interval_days">,
): number {
  const amt = Number(rule.amount) || 0;
  if (rule.frequency === "daily") return amt * 30;
  if (rule.frequency === "weekly") return amt * 4.33;
  if (rule.frequency === "custom") {
    return (amt * 30) / Math.max(1, rule.interval_days ?? 30);
  }
  return amt;
}

const SELECT_COLUMNS =
  "id, user_id, category_id, amount, currency, description, payment_method, frequency, interval_days, mode, plan_start_date, next_due_date, is_active, exchange_rate_to_usd, base_currency, created_at, updated_at, deleted_at, categories:category_id (id, name, icon, color)";

export async function listRecurringRules(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecurringRuleRow[]> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("next_due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecurringRuleRow[];
}

// ── Chain arithmetic ─────────────────────────────────────────────────────────

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** End-of-month clamp like date-fns addMonths (Jan 31 + 1mo → Feb 28). */
function addMonthsISO(iso: string, months: number): string {
  const [y, m, dd] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dd, lastDay));
  return toISODate(target);
}

function dayDiff(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) /
      86_400_000,
  );
}

/**
 * Advance an ISO date by one cycle. The chain is SCHEDULE-LOCKED: callers
 * always pass the current DUE slot, never a payment date — paying late notes
 * the delay but must not shift the plan. 'custom' uses interval_days
 * (falls back to 30 if unset).
 */
export function nextDueDate(
  dueDate: string,
  frequency: RecurringFrequency,
  intervalDays?: number | null,
): string {
  if (frequency === "daily") return addDaysISO(dueDate, 1);
  if (frequency === "weekly") return addDaysISO(dueDate, 7);
  if (frequency === "custom") return addDaysISO(dueDate, intervalDays ?? 30);
  return addMonthsISO(dueDate, 1);
}

/** Forward-only chain advance (.lt guard): a stale device can never move a
 * schedule backwards over one another device already advanced. */
async function advanceRuleChain(
  supabase: SupabaseClient<Database>,
  ruleId: string,
  userId: string,
  newDue: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .update({ next_due_date: newDue })
    .eq("id", ruleId)
    .eq("user_id", userId)
    .lt("next_due_date", newDue)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// ── Rule CRUD ────────────────────────────────────────────────────────────────

export interface RecurringRuleInput {
  categoryId: string;
  amount: number;
  currency: string;
  description?: string | null;
  paymentMethod: "Cash" | "Card" | "UPI" | "Other";
  frequency: RecurringFrequency;
  /** Only when frequency === 'custom' (1–365 days). */
  intervalDays?: number | null;
  /** Defaults to pay_on_due (a due card, never silent money). */
  mode?: RecurringMode;
  /** Chain anchor; due slots = anchor + N × cycle. Defaults to nextDueDate. */
  planStartDate?: string | null;
  nextDueDate: string;
  isActive?: boolean;
}

export async function createRecurringRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RecurringRuleInput,
): Promise<RecurringRule> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw new Error("Enter a valid amount greater than zero.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate)) {
    throw new Error("Enter a valid next due date.");
  }
  if (input.frequency === "custom") {
    const days = Number(input.intervalDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error("Custom cycle needs a repeat length of 1–365 days.");
    }
  }
  const snapshot = await getRateSnapshot(supabase, input.currency, input.nextDueDate);
  const { data, error } = await supabase
    .from("recurring_rules")
    .insert({
      user_id: userId,
      category_id: input.categoryId,
      amount,
      currency: input.currency,
      description: input.description?.trim().slice(0, 500) || null,
      payment_method: input.paymentMethod,
      frequency: input.frequency,
      interval_days: input.frequency === "custom" ? input.intervalDays ?? null : null,
      mode: input.mode ?? "pay_on_due",
      plan_start_date: input.planStartDate ?? input.nextDueDate,
      next_due_date: input.nextDueDate,
      is_active: input.isActive ?? true,
      exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
      base_currency: snapshot.base_currency,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as RecurringRule;
}

export async function updateRecurringRule(
  supabase: SupabaseClient<Database>,
  id: string,
  input: Partial<RecurringRuleInput>,
  userId: string,
): Promise<RecurringRule> {
  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
      throw new Error("Enter a valid amount greater than zero.");
    }
  }
  const patch: Database["public"]["Tables"]["recurring_rules"]["Update"] = {};
  if (input.categoryId != null) patch.category_id = input.categoryId;
  if (input.amount != null) patch.amount = Number(input.amount);
  if (input.currency != null) patch.currency = input.currency;
  if (input.description !== undefined) {
    patch.description = input.description?.trim().slice(0, 500) || null;
  }
  if (input.paymentMethod != null) patch.payment_method = input.paymentMethod;
  if (input.frequency != null) patch.frequency = input.frequency;
  if (input.frequency != null || input.intervalDays !== undefined) {
    if (input.intervalDays != null) {
      const days = Number(input.intervalDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("Custom cycle needs a repeat length of 1–365 days.");
      }
    }
    const freq = input.frequency;
    patch.interval_days =
      freq === "custom" ? input.intervalDays ?? null : freq ? null : input.intervalDays ?? null;
  }
  if (input.mode != null) patch.mode = input.mode;
  if (input.planStartDate !== undefined) {
    if (input.planStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.planStartDate)) {
      throw new Error("Enter a valid plan start date.");
    }
    patch.plan_start_date = input.planStartDate;
  }
  if (input.nextDueDate != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate)) {
      throw new Error("Enter a valid next due date.");
    }
    patch.next_due_date = input.nextDueDate;
  }
  if (input.isActive != null) patch.is_active = input.isActive;

  // Audit P2-4: owner scope is mandatory, not conditional — the predicate is
  // defense in depth over the RLS boundary and must never be silently omitted.
  const { data, error } = await supabase
    .from("recurring_rules")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as RecurringRule;
}

/**
 * Moves the rule to the Bin (soft delete). The row survives for the 60-day
 * retention window — restorable from /bin — and a nightly cron sweep
 * (purge_expired_bin_items, owned by the mobile repo) removes it for good.
 * While binned it is invisible to listRecurringRules, so it never auto-charges,
 * never shows a due card, and its schedule stays frozen for a clean restore.
 */
export async function deleteRecurringRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("recurring_rules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
}

/** Upcoming occurrence dates from a start (rule detail schedule preview). */
export function nextOccurrences(
  startISO: string,
  frequency: RecurringFrequency,
  count: number,
  intervalDays?: number | null,
): string[] {
  const out: string[] = [];
  let due = startISO;
  for (let i = 0; i < count; i++) {
    out.push(due);
    due = nextDueDate(due, frequency, intervalDays);
  }
  return out;
}

// ── Occurrences (booked installment rows) ────────────────────────────────────

/** One booked installment row, trimmed for the paid-state UI. */
export interface RuleOccurrence {
  id: string;
  recurring_rule_id: string;
  recurring_due_date: string | null;
  /** Actual payment date (the ledger date). */
  date: string;
  amount: number;
  currency: string;
  exchange_rate_to_usd: number | null;
}

/**
 * All booked occurrences for the given rules, newest slot first — one query
 * so paid states, DUE badges and the timeline are derived client-side.
 */
export async function listRuleOccurrences(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleIds: string[],
): Promise<RuleOccurrence[]> {
  if (ruleIds.length === 0) return [];
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, recurring_rule_id, recurring_due_date, date, amount, currency, exchange_rate_to_usd",
    )
    .eq("user_id", userId)
    .in("recurring_rule_id", ruleIds)
    .is("deleted_at", null)
    .order("recurring_due_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RuleOccurrence[];
}

function occurrenceRows(rows: RuleOccurrence[]) {
  // Back-compat: rows predating the slot model carry only `date`.
  return rows.filter((r) => r.recurring_due_date != null);
}

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Auto-posts every due occurrence of ACTIVE `auto_charge` rules.
 * `pay_on_due` rules are skipped on purpose: their due card waits for an
 * explicit markOccurrencePaid() tap, so no row exists until money actually left.
 * Idempotent via the unique (recurring_rule_id, recurring_due_date) slot index.
 */
export async function generateDueRecurringExpenses(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const rules = await listRecurringRules(supabase, userId);
  const today = todayISO();
  let generated = 0;

  for (const rule of rules.filter(
    (item) => item.is_active && ruleMode(item) === "auto_charge",
  )) {
    // 1. Collect every due slot before touching the network (global cap 100).
    const dueSlots: string[] = [];
    let cursor = rule.next_due_date;
    while (cursor <= today && generated + dueSlots.length < 100) {
      dueSlots.push(cursor);
      cursor = nextDueDate(cursor, rule.frequency, rule.interval_days);
    }
    if (dueSlots.length === 0) continue;

    // 2. Resolve the historical rate snapshot per unique slot date in parallel.
    const uniqueDates = [...new Set(dueSlots)];
    const snapshots = await Promise.all(
      uniqueDates.map((date) => getRateSnapshot(supabase, rule.currency, date)),
    );
    const rateByDate = new Map(uniqueDates.map((date, i) => [date, snapshots[i]]));

    // 3. One batched upsert with conflict-skip: a slot already booked by
    //    another device (or a Mark Paid tap) is skipped, the rest insert.
    const rows: Database["public"]["Tables"]["expenses"]["Insert"][] = dueSlots.map((date) => {
      const snapshot = rateByDate.get(date)!;
      return {
        user_id: userId,
        category_id: rule.category_id,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description ?? "Recurring",
        date,
        payment_method: rule.payment_method,
        type: "expense",
        is_recurring: true,
        recurring_rule_id: rule.id,
        recurring_due_date: date,
        is_synced: true,
        exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
        base_currency: snapshot.base_currency,
      };
    });
    const { error } = await supabase
      .from("expenses")
      .upsert(rows, { ignoreDuplicates: true, onConflict: "recurring_rule_id,recurring_due_date" });
    if (error) throw error;
    generated += dueSlots.length;

    // 4. Advance the schedule once per rule (forward-only).
    await advanceRuleChain(supabase, rule.id, userId, cursor);
  }

  return generated;
}

// ── Shared occurrence writes (one per payment surface) ───────────────────────

/**
 * Books the CURRENT slot of a rule as paid on `paidDate` (defaults to today)
 * — the single shared write behind every "paid" surface: the Recurring tab
 * Mark Paid button and the dashboard bills-due strip.
 *
 * Chain lock: the next due date is always `slot + one cycle` — paying late
 * records "late by N days" on the row but never shifts the plan. Idempotent
 * via the unique slot index (a double-tap or phone/web race books exactly one
 * installment).
 */
export async function markOccurrencePaid(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  paidDate?: string,
): Promise<{ rule: RecurringRuleRow; slot: string; lateDays: number }> {
  const { data: ruleRow, error: ruleError } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("id", ruleId)
    .eq("user_id", userId)
    .single();
  if (ruleError) throw ruleError;
  const rule = ruleRow as unknown as RecurringRuleRow;

  const slot = rule.next_due_date;
  const paymentDate = paidDate ?? todayISO();
  const lateDays = Math.max(0, dayDiff(slot, paymentDate));

  const snapshot = await getRateSnapshot(supabase, rule.currency, paymentDate);
  const { error: insertError } = await supabase
    .from("expenses")
    .upsert(
      {
        user_id: userId,
        category_id: rule.category_id,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description ?? "Recurring",
        date: paymentDate,
        payment_method: rule.payment_method,
        type: "expense",
        is_recurring: true,
        recurring_rule_id: rule.id,
        recurring_due_date: slot,
        is_synced: true,
        exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
        base_currency: snapshot.base_currency,
      },
      { ignoreDuplicates: true, onConflict: "recurring_rule_id,recurring_due_date" },
    );
  if (insertError) throw insertError;

  // Advance off the SLOT (chain arithmetic), never off the payment date.
  await advanceRuleChain(supabase, rule.id, userId, nextDueDate(slot, rule.frequency, rule.interval_days));

  const { data: updated, error: fetchError } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("id", rule.id)
    .single();
  if (fetchError) throw fetchError;
  return { rule: updated as unknown as RecurringRuleRow, slot, lateDays };
}

/**
 * Skips the current slot without booking money: the chain moves forward one
 * position and this installment simply never exists in the ledger.
 */
export async function skipCurrentOccurrence(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
): Promise<{ rule: RecurringRuleRow; skippedSlot: string }> {
  const { data: ruleRow, error } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("id", ruleId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  const rule = ruleRow as unknown as RecurringRuleRow;

  const slot = rule.next_due_date;
  await advanceRuleChain(supabase, rule.id, userId, nextDueDate(slot, rule.frequency, rule.interval_days));

  const { data: updated, error: fetchError } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("id", rule.id)
    .single();
  if (fetchError) throw fetchError;
  return { rule: updated as unknown as RecurringRuleRow, skippedSlot: slot };
}

/**
 * Reverses a just-booked payment: hard-deletes the occurrence row (a
 * soft-delete would keep holding the slot, so the chain position could never
 * be re-paid) and pulls next_due_date back to that slot. Only the most recent
 * booking is undoable.
 */
export async function undoLatestOccurrencePayment(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
): Promise<{ rule: RecurringRuleRow; undoneSlot: string } | null> {
  const { data: ruleRow, error: ruleError } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("id", ruleId)
    .eq("user_id", userId)
    .single();
  if (ruleError) throw ruleError;
  const rule = ruleRow as unknown as RecurringRuleRow;

  const { data: latest, error: findError } = await supabase
    .from("expenses")
    .select("id, recurring_due_date")
    .eq("recurring_rule_id", ruleId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("recurring_due_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  const slot = latest?.recurring_due_date as string | null | undefined;
  if (!latest || !slot) return null;

  // Undoable only if the chain sits exactly one cycle past this slot —
  // anything older is history and stays booked.
  if (rule.next_due_date !== nextDueDate(slot, rule.frequency, rule.interval_days)) {
    return null;
  }

  // Documented hard-delete exception (SCHEMA.md drift note 6) — owner-scoped.
  const { error: deleteError } = await supabase
    .from("expenses")
    .delete()
    .eq("id", latest.id)
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  const { data: updated, error: fetchError } = await supabase
    .from("recurring_rules")
    .update({ next_due_date: slot })
    .eq("id", rule.id)
    .eq("user_id", userId)
    .gt("next_due_date", slot)
    .select(SELECT_COLUMNS)
    .single();
  if (fetchError) throw fetchError;
  return { rule: updated as unknown as RecurringRuleRow, undoneSlot: slot };
}

/**
 * "Pay from plan" in the expense form: books the rule's open slot with the
 * VALUES THE USER ENTERED (they may have corrected the price) and then
 * re-anchors the chain from the payment date — "everything starts counting
 * from today". This is deliberately different from the Recurring tab's Mark
 * Paid, which keeps the schedule-locked advance. The rule's amount/currency
 * self-correct to what was actually paid.
 */
export interface PlanFormPaymentValues {
  amount: number;
  category_id: string;
  currency: string;
  description?: string | null;
  notes?: string | null;
  date: string;
  time?: string | null;
  payment_method: "Cash" | "Card" | "UPI" | "Other";
  bank_account_id?: string | null;
  receipt_image_url?: string | null;
}

export async function payPlanFromForm(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  values: PlanFormPaymentValues,
): Promise<{ slot: string; lateDays: number; nextDue: string }> {
  const { data: ruleRow, error: ruleError } = await supabase
    .from("recurring_rules")
    .select(SELECT_COLUMNS)
    .eq("id", ruleId)
    .eq("user_id", userId)
    .single();
  if (ruleError) throw ruleError;
  const rule = ruleRow as unknown as RecurringRuleRow;

  const slot = rule.next_due_date;
  const paidDate = values.date;
  const lateDays = Math.max(0, dayDiff(slot, paidDate));

  const snapshot = await getRateSnapshot(supabase, values.currency, paidDate);
  const { error: insertError } = await supabase.from("expenses").insert({
    user_id: userId,
    category_id: values.category_id,
    amount: values.amount,
    currency: values.currency,
    description: values.description?.trim() || rule.description || null,
    notes: values.notes?.trim() || null,
    time: values.time ?? null,
    receipt_image_url: values.receipt_image_url ?? null,
    bank_account_id: values.bank_account_id ?? null,
    date: paidDate,
    payment_method: values.payment_method,
    type: "expense",
    is_recurring: true,
    recurring_rule_id: rule.id,
    recurring_due_date: slot,
    is_synced: true,
    exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
    base_currency: snapshot.base_currency,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      throw new Error("This installment was already paid — the plan may have run on another device.");
    }
    throw insertError;
  }

  // Chain re-anchors from the payment date. The .eq(next_due, slot) guard
  // means we only move the schedule off the slot THIS call just booked — a
  // concurrent advance is then re-applied forward-only as a best effort.
  const nextDue = nextDueDate(paidDate, rule.frequency, rule.interval_days);
  const { data: advanced, error: advanceError } = await supabase
    .from("recurring_rules")
    .update({ next_due_date: nextDue, amount: values.amount, currency: values.currency })
    .eq("id", rule.id)
    .eq("user_id", userId)
    .eq("next_due_date", slot)
    .select("next_due_date")
    .maybeSingle();
  if (advanceError) throw advanceError;
  if (!advanced) {
    await advanceRuleChain(supabase, rule.id, userId, nextDue).catch(() => undefined);
  }

  return { slot, lateDays, nextDue };
}

/** Newest booked slot for a rule, if any (rows must carry a slot key). */
export function latestOccurrenceFor(
  occurrences: RuleOccurrence[],
  ruleId: string,
): RuleOccurrence | undefined {
  return occurrenceRows(occurrences).find((o) => o.recurring_rule_id === ruleId);
}

/** True when the CURRENT slot is unpaid and already reached/past due. */
export function ruleIsDue(
  rule: Pick<RecurringRule, "id" | "is_active" | "next_due_date">,
  occurrences: RuleOccurrence[],
): boolean {
  if (!rule.is_active) return false;
  if (rule.next_due_date > todayISO()) return false;
  const latest = latestOccurrenceFor(occurrences, rule.id);
  return !latest || latest.recurring_due_date !== rule.next_due_date;
}
