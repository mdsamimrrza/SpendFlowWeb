/**
 * Expenses service — mirrors mobile services/expenses.ts: explicit column
 * list, category join, live-row filter, FX snapshot on write, soft delete.
 * Web keeps a light localStorage read-cache (page 0) like mobile's cache-paint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Expense } from "@/types/database.types";
import { getRateSnapshot } from "./exchange";

export type ExpenseRow = Expense & {
  categories: { id: string; name: string; icon: string; color: string; type: string } | null;
};

export interface ExpenseFilters {
  search?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  type?: "expense" | "income";
}

export interface ExpenseSort {
  field: "date" | "amount";
  direction: "asc" | "desc";
}

export const PAGE_SIZE = 15;

const SELECT_COLUMNS =
  "id, user_id, category_id, amount, currency, description, date, time, payment_method, notes, receipt_image_url, is_recurring, recurring_rule_id, bank_account_id, exchange_rate_to_usd, base_currency, type, created_at, updated_at, categories:category_id (id, name, icon, color, type)";

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
    // Sanitized ilike over description/notes (mobile parity — same escape).
    const term = filters.search.trim().replace(/[%_,()]/g, " ").trim();
    if (term) query = query.ilike("description", `%${term}%`);
  }
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.type) query = query.eq("type", filters.type);

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
  id: string,
): Promise<ExpenseRow | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  const { data, error } = await supabase
    .from("expenses")
    .select(SELECT_COLUMNS)
    .eq("id", id)
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
}

export async function createExpense(
  supabase: SupabaseClient<Database>,
  input: CreateExpenseInput,
): Promise<Expense> {
  // Amount/date validation (mobile parity: DB CHECKs back these up).
  if (!(input.amount > 0) || input.amount > 1_000_000_000_000) {
    throw new Error("Amount must be greater than zero");
  }
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 1);
  const maxISO = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, "0")}-${String(maxDate.getDate()).padStart(2, "0")}`;
  if (input.date < "2000-01-01" || input.date > maxISO) {
    throw new Error("Date is outside the allowed range");
  }
  const snapshot = await getRateSnapshot(supabase, input.currency, input.date);
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
  id: string,
  update: Omit<CreateExpenseInput, "userId">,
): Promise<Expense> {
  const snapshot = await getRateSnapshot(supabase, update.currency, update.date);
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
      exchange_rate_to_usd: snapshot.exchange_rate_to_usd,
      base_currency: snapshot.base_currency,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function softDeleteExpense(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
