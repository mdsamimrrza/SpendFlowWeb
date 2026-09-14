/**
 * Settings-history reads — the append-only `user_settings_history` trail
 * (mobile services/settingsHistory.ts counterpart). Writes stay with the
 * pages that make budget/cycle changes; this service only reads.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export interface SettingsHistoryRow {
  id: string;
  effective_from: string;
  monthly_budget: number | null;
  cycle_start_day: number;
  cycle_end_day: number | null;
  budget_currency: string | null;
  created_at: string;
}

export async function listSettingsHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 50,
): Promise<SettingsHistoryRow[]> {
  const { data, error } = await supabase
    .from("user_settings_history")
    .select(
      "id, effective_from, monthly_budget, cycle_start_day, cycle_end_day, budget_currency, created_at",
    )
    .eq("user_id", userId)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SettingsHistoryRow[];
}

/**
 * Budget that was in force for a calendar month (YYYY-MM): the newest history
 * row effective on/before month end. Null = no budget on record then — we
 * never back-fill a figure the user hadn't set yet.
 */
export function budgetInForceForMonth(
  history: SettingsHistoryRow[],
  monthKey: string,
): SettingsHistoryRow | null {
  // history arrives effective_from-desc; first match is the in-force row.
  const monthEnd = `${monthKey}-31`; // string compare works on zero-padded ISO dates
  for (const h of history) {
    if (h.effective_from <= monthEnd) return h;
  }
  return null;
}
