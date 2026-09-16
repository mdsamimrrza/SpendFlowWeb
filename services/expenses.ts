/**
 * Expenses service — mirrors mobile services/expenses.ts: explicit column
 * list, category join, live-row filter, FX snapshot on write, soft delete.
 * Web keeps a light localStorage read-cache (page 0) like mobile's cache-paint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Expense } from "@/types/database.types";
import type { PaymentMethod } from "@/constants/app";
import { getRateSnapshot } from "./exchange";

export type ExpenseRow = Expense & {
  categories: { id: string; name: string; icon: string; color: string; type: string } | null;
  bank_accounts: { id: string; name: string; icon: string; color: string; account_type: string } | null;
};

export interface ExpenseFilters {
  search?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  type?: "expense" | "income";
  /** Mobile parity — service supports what the History toolbar now exposes. */
  paymentMethod?: PaymentMethod;
  bankAccountId?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface ExpenseSort {
  field: "date" | "amount";
  direction: "asc" | "desc";
}

export const PAGE_SIZE = 15;

const SELECT_COLUMNS =
  "id, user_id, category_id, amount, currency, description, date, time, payment_method, notes, receipt_image_url, is_recurring, recurring_rule_id, recurring_due_date, bank_account_id, exchange_rate_to_usd, base_currency, type, created_at, updated_at, deleted_at, categories:category_id (id, name, icon, color, type), bank_accounts:bank_account_id (id, name, icon, color, account_type)";

function cacheKey(userId: string): string {
  return `sf_cache_expenses_${userId}`;
}

export function cacheExpenses(userId: string, rows: ExpenseRow[]): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(rows.slice(0, PAGE_SIZE)));
  } catch {
    // quota / private mode — cache is best-effort
  }
}

export function getCachedExpenses(userId: string): ExpenseRow[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as ExpenseRow[]) : [];
  } catch {
    return [];
  }
}

export async function listExpenses(
  supabase: SupabaseClient<Database>,
  userId: string,
  page: number,
  filters: ExpenseFilters = {},
  sort: ExpenseSort = { field: "date", direction: "desc" },
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: ExpenseRow[]; count: number }> {
  let query = supabase
    .from("expenses")
    .select(SELECT_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (filters.search && filters.search.trim()) {
    // Mobile parity: search must never reach PostgREST raw — backslash/quote
    // are stripped and the value is double-quoted so it stays a single ilike
    // literal inside the or() filter tree. Covers description AND notes.
    const pattern = `%${filters.search.trim().replace(/[\\"]/g, "")}%`;
    query = query.or(`description.ilike."${pattern}",notes.ilike."${pattern}"`);
  }
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  if (filters.bankAccountId) query = query.eq("bank_account_id", filters.bankAccountId);
  if (filters.minAmount != null) query = query.gte("amount", filters.minAmount);
  if (filters.maxAmount != null) query = query.lte("amount", filters.maxAmount);

  query = query
    .order(sort.field, { ascending: sort.direction === "asc" })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as ExpenseRow[], count: count ?? 0 };
}

export async function getExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<ExpenseRow | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  const { data, error } = await supabase
    .from("expenses")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as ExpenseRow) ?? null;
}

export interface CreateExpenseInput {
  userId: string;
  categoryId: string;
  amount: number;
  currency: string;
  type: "expense" | "income";
  description?: string | null;
  date: string;
  time?: string | null;
  paymentMethod?: "Cash" | "Card" | "UPI" | "Other";
  notes?: string | null;
  bankAccountId?: string | null;
  /**
   * Web-only: lock the FX snapshot at a fixing date other than the
   * transaction date (back-dated entries needing a past fixing).
   * Default (null) follows mobile exactly — snapshot at `date`.
   */
  snapshotDate?: string | null;
  /**
   * Provenance for the web entry form's recurrence section. The columns are
   * insert-only in the exposed schema (absent from Update), so the rule is
   * created BEFORE the row and carried in at insert (edit mode shows the
   * rule as read-only).
   */
  recurringRuleId?: string | null;
  isRecurring?: boolean;
}

/** Amount/date rules mirrored by the create and update paths (DB CHECKs back up).
 * Exported so the CSV import path validates with the SAME single-source rules —
 * never re-implement money validation at component level (AGENTS.md §8). */
export function assertAmountAndDate(amount: number, date: string): void {
  if (!Number.isFinite(amount) || !(amount > 0) || amount > 1_000_000_000_000) {
    throw new Error("Amount must be greater than zero");
  }
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 1);
  const maxISO = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, "0")}-${String(maxDate.getDate()).padStart(2, "0")}`;
  if (date < "2000-01-01" || date > maxISO) {
    throw new Error("Date is outside the allowed range");
  }
}

/** Audit NV-2: mirror the P2-5 rule-ownership pre-check for the remaining
 * reference columns the write path stamps. Owner-scoped RLS would otherwise
 * let a foreign category/account UUID ride into the caller's own row (FK
 * existence passes on the victim's row); the deployed validate_owned_references
 * trigger is the server-side twin of this check, not a substitute for it. */
async function assertOwnedReferences(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
  bankAccountId: string | null | undefined,
): Promise<void> {
  const UUID = /^[0-9a-fA-F-]{36}$/;
  if (!UUID.test(categoryId)) throw new Error("Invalid category");
  const { data: ownedCat } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownedCat) throw new Error("Invalid category");
  if (bankAccountId) {
    if (!UUID.test(bankAccountId)) throw new Error("Invalid account");
    const { data: ownedAccount } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("id", bankAccountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedAccount) throw new Error("Invalid account");
  }
}

export async function createExpense(
  supabase: SupabaseClient<Database>,
  input: CreateExpenseInput,
): Promise<Expense> {
  assertAmountAndDate(input.amount, input.date);
  await assertOwnedReferences(supabase, input.userId, input.categoryId, input.bankAccountId);
  // Audit P2-5: never stamp a rule id we cannot prove is the caller's — RLS
  // would let a foreign (rule, slot) pair insert into the attacker's own row
  // and silently squat the victim's dedup slot.
  if (input.recurringRuleId) {
    if (!/^[0-9a-fA-F-]{36}$/.test(input.recurringRuleId)) {
      throw new Error("Invalid recurring rule");
    }
    const { data: ownedRule } = await supabase
      .from("recurring_rules")
      .select("id")
      .eq("id", input.recurringRuleId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!ownedRule) throw new Error("Invalid recurring rule");
  }
  const snapshot = await getRateSnapshot(
    supabase,
    input.currency,
    input.snapshotDate || input.date,
  );
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: input.userId,
      category_id: input.categoryId,
      amount: input.amount,
      currency: input.currency,
      type: input.type,
      description: input.description ?? null,
      date: input.date,
      time: input.time ?? null,
      payment_method: input.paymentMethod ?? "Cash",
      notes: input.notes ?? null,
      bank_account_id: input.bankAccountId ?? null,
      is_recurring: input.isRecurring ?? false,
      recurring_rule_id: input.recurringRuleId ?? null,
      is_synced: true,
      exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
      base_currency: snapshot.base_currency,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function updateExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  update: Omit<CreateExpenseInput, "userId" | "isRecurring" | "recurringRuleId">,
): Promise<Expense> {
  assertAmountAndDate(update.amount, update.date);
  await assertOwnedReferences(supabase, userId, update.categoryId, update.bankAccountId);
  // Mobile updateExpense parity: the stored FX snapshot is FROZEN — it is
  // re-fetched only when the date or currency actually changed (or a manual
  // snapshot-date override is set). Editing an amount or note must not
  // silently re-rate the row at today's FX.
  const saved = await supabase
    .from("expenses")
    .select("date, currency, exchange_rate_to_usd")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (saved.error) throw saved.error;
  if (!saved.data) throw new Error("Entry not found");
  const rateChanged =
    saved.data.date !== update.date ||
    saved.data.currency !== update.currency ||
    saved.data.exchange_rate_to_usd == null;
  const override = update.snapshotDate != null && update.snapshotDate !== update.date;
  const snapshot =
    rateChanged || override
      ? await getRateSnapshot(supabase, update.currency, update.snapshotDate || update.date)
      : null;

  const { data, error } = await supabase
    .from("expenses")
    .update({
      category_id: update.categoryId,
      amount: update.amount,
      currency: update.currency,
      type: update.type,
      description: update.description ?? null,
      date: update.date,
      time: update.time ?? null,
      payment_method: update.paymentMethod ?? "Cash",
      notes: update.notes ?? null,
      bank_account_id: update.bankAccountId ?? null,
      ...(snapshot
        ? { exchange_rate_to_usd: snapshot.exchange_rate_to_usd, base_currency: snapshot.base_currency }
        : {}),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function softDeleteExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
}

/** Patch the receipt storage path after upload (mobile deferred-upload parity). */
export async function setExpenseReceipt(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  receiptPath: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({ receipt_image_url: receiptPath })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
