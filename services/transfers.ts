/**
 * Transfers service — mobile services/transfers.ts parity: the FX rate is
 * LOCKED on the row at creation (exchange_rate, converted_amount; the DB CHECK
 * enforces converted ≈ amount × rate within 0.05). Soft delete.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Transfer } from "@/types/database.types";
import { getRate } from "./exchange";

export type TransferRow = Transfer & {
  from_account: { id: string; name: string; currency: string } | null;
  to_account: { id: string; name: string; currency: string } | null;
};

const SELECT_COLUMNS =
  "id, user_id, from_account_id, to_account_id, amount, from_currency, to_currency, exchange_rate, converted_amount, fee, date, time, notes, created_at, updated_at, deleted_at, from_account:from_account_id (id, name, currency), to_account:to_account_id (id, name, currency)";

export async function listTransfers(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 200,
): Promise<TransferRow[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TransferRow[];
}

export interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fee?: number;
  date: string;
  time?: string | null;
  notes?: string | null;
}

export async function createTransfer(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateTransferInput,
): Promise<Transfer> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw new Error("Enter a valid amount greater than zero.");
  }
  if (input.fee != null && (!Number.isFinite(input.fee) || input.fee < 0)) {
    throw new Error("Fee must be zero or greater.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Enter a valid date.");
  }
  const { data: accounts, error: accError } = await supabase
    .from("bank_accounts")
    .select("id, currency")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", [input.fromAccountId, input.toAccountId]);
  if (accError) throw accError;
  const from = accounts?.find((a) => a.id === input.fromAccountId);
  const to = accounts?.find((a) => a.id === input.toAccountId);
  if (!from || !to) throw new Error("Both accounts must exist");
  if (from.id === to.id) throw new Error("Source and destination must differ");

  const [fromRate, toRate] = await Promise.all([
    getRate(supabase, from.currency),
    getRate(supabase, to.currency),
  ]);
  // Rate locks at creation: units of `to` per 1 unit of `from`
  // = (USD/unit_from) ÷ (USD/unit_to). DB CHECK: converted ≈ amount × rate.
  const exchangeRate = fromRate / toRate;
  const convertedAmount = Number((input.amount * exchangeRate).toFixed(2));

  const { data, error } = await supabase
    .from("transfers")
    .insert({
      user_id: userId,
      from_account_id: input.fromAccountId,
      to_account_id: input.toAccountId,
      amount,
      from_currency: from.currency,
      to_currency: to.currency,
      exchange_rate: exchangeRate,
      converted_amount: convertedAmount,
      fee: input.fee ?? 0,
      date: input.date,
      time: input.time ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Transfer;
}

export async function deleteTransfer(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("transfers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
}
