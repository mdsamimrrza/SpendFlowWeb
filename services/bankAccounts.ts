/**
 * Bank accounts service — mobile services/bankAccounts.ts parity:
 * list (soft-deleted hidden by RLS), CRUD, default seeding, and computed live
 * balances (initial + income − expenses ± transfers, converted at snapshots).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankAccount, Database } from "@/types/database.types";
import { getRate } from "./exchange";

export type BankAccountRow = BankAccount;

const SELECT_COLUMNS =
  "id, user_id, name, account_type, currency, initial_balance, current_balance, color, icon, account_number_last4, is_default, country, created_at, updated_at, deleted_at";

export async function listBankAccounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BankAccountRow[]> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BankAccountRow[];
}

export interface AccountBalance {
  accountId: string;
  balance: number;
}

/**
 * Live balances (mobile computeAccountBalances semantics): initial balance +
 * income − expenses (entries linked to the account, converted to the account
 * currency at each entry's stored snapshot, falling back to today's rate) −
 * outgoing transfers (amount + fee) + incoming transfers (converted amount).
 */
export async function computeAccountBalances(
  supabase: SupabaseClient<Database>,
  userId: string,
  accounts: BankAccountRow[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>(accounts.map((a) => [a.id, a.initial_balance]));
  if (accounts.length === 0) return balances;

  const rateCache = new Map<string, number>();
  const accountRate = async (currency: string) => {
    if (!rateCache.has(currency)) {
      rateCache.set(currency, await getRate(supabase, currency));
    }
    return rateCache.get(currency)!;
  };

  const [expensesRes, transfersRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("bank_account_id, amount, currency, exchange_rate_to_usd, type")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("bank_account_id", "is", null),
    supabase
      .from("transfers")
      .select("from_account_id, to_account_id, amount, fee, converted_amount")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  for (const row of expensesRes.data ?? []) {
    const accId = row.bank_account_id as string;
    const account = accounts.find((a) => a.id === accId);
    if (!account) continue;
    let v = Number(row.amount);
    if (row.currency !== account.currency) {
      // Snapshot-first (mobile parity): × (USD/unit_entry) ÷ (USD/unit_account).
      const fromRate = row.exchange_rate_to_usd ?? (await accountRate(row.currency));
      const toRate = await accountRate(account.currency);
      if (fromRate > 0) v = (v * fromRate) / toRate;
    }
    balances.set(accId, (balances.get(accId) ?? 0) + (row.type === "income" ? v : -v));
  }

  for (const row of transfersRes.data ?? []) {
    balances.set(
      row.from_account_id,
      (balances.get(row.from_account_id) ?? 0) - Number(row.amount) - Number(row.fee),
    );
    balances.set(
      row.to_account_id,
      (balances.get(row.to_account_id) ?? 0) + Number(row.converted_amount),
    );
  }

  return balances;
}

export interface AccountInput {
  name: string;
  accountType: "bank" | "wallet" | "cash" | "credit_card" | "savings" | "investment" | "other";
  currency: string;
  initialBalance: number;
  color?: string;
  icon?: string;
  last4?: string | null;
  isDefault?: boolean;
  country?: string | null;
}

export async function createBankAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AccountInput,
): Promise<BankAccountRow> {
  if (input.isDefault) {
    await supabase
      .from("bank_accounts")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
  }
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      user_id: userId,
      name: input.name,
      account_type: input.accountType,
      currency: input.currency,
      initial_balance: input.initialBalance,
      current_balance: input.initialBalance,
      color: input.color ?? "#10B981",
      icon: input.icon ?? "🏦",
      account_number_last4: input.last4 ?? null,
      is_default: input.isDefault ?? false,
      country: input.country ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data as BankAccountRow;
}

export async function updateBankAccount(
  supabase: SupabaseClient<Database>,
  id: string,
  update: Partial<AccountInput>,
): Promise<BankAccountRow> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .update({
      ...(update.name != null ? { name: update.name } : {}),
      ...(update.accountType != null ? { account_type: update.accountType } : {}),
      ...(update.currency != null ? { currency: update.currency } : {}),
      ...(update.initialBalance != null
        ? { initial_balance: update.initialBalance, current_balance: update.initialBalance }
        : {}),
      ...(update.last4 !== undefined ? { account_number_last4: update.last4 } : {}),
      ...(update.isDefault != null ? { is_default: update.isDefault } : {}),
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data as BankAccountRow;
}

/** Soft delete (parity); linked entries keep their rows (FK SET NULL). */
export async function deleteBankAccount(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("bank_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
