/**
 * Threshold alerts — mobile services/notifications.ts parity for web:
 * cycle-budget milestones (25/50/75/90/100%) and category budget thresholds
 * (90/100%) fire an in-app toast and persist a `notifications` row, deduped
 * per (user, month, key) in localStorage — the web equivalent of the
 * @spendflow_alert_sent_* suppression keys. "Reset alert history" clears it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";

export const ALERT_THRESHOLDS = [25, 50, 75, 90, 100] as const;
const CATEGORY_THRESHOLDS = [90, 100] as const;

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function wasSent(userId: string, key: string): boolean {
  try {
    return localStorage.getItem(`sf_alert_sent_${monthKey()}_${userId.slice(0, 8)}_${key}`) === "1";
  } catch {
    return false;
  }
}

function markSent(userId: string, key: string): void {
  try {
    localStorage.setItem(`sf_alert_sent_${monthKey()}_${userId.slice(0, 8)}_${key}`, "1");
  } catch {
    // private mode — alerts will repeat per session, acceptable
  }
}

export function resetAlertHistory(userId: string): number {
  let cleared = 0;
  try {
    const prefix = `sf_alert_sent_${monthKey()}_${userId.slice(0, 8)}_`;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) {
        localStorage.removeItem(k);
        cleared += 1;
      }
    }
  } catch {
    // ignore
  }
  return cleared;
}

async function persistNotification(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body,
      data: data as Json,
    });
  } catch {
    // best-effort parity with mobile — the toast already fired
  }
}

export interface BudgetAlertInput {
  supabase: SupabaseClient<Database>;
  userId: string;
  budget: number; // display currency
  spent: number; // display currency
  fire: (message: string, kind?: "success" | "error" | "info") => void;
}

/** Cycle-budget milestones — deduped per user/month/threshold. */
export async function checkBudgetAlerts(input: BudgetAlertInput): Promise<void> {
  const { supabase, userId, budget, spent, fire } = input;
  if (!(budget > 0)) return;
  const pct = (spent / budget) * 100;
  for (const t of ALERT_THRESHOLDS) {
    if (pct < t) continue;
    const key = `budget_${t}`;
    if (wasSent(userId, key)) continue;
    markSent(userId, key);
    const title = `Budget ${t}% used`;
    const body =
      t === 100
        ? "Cycle budget fully consumed."
        : `Spending has reached ${t}% of your cycle budget.`;
    fire(`${title} — ${body}`, t >= 90 ? "error" : "info");
    await persistNotification(supabase, userId, "budget_threshold", title, body, {
      threshold: t,
      spent,
      budget,
    });
  }
}

export interface CategoryAlertInput {
  supabase: SupabaseClient<Database>;
  userId: string;
  /** Categories carrying a monthly limit, with cycle spend in display currency. */
  categories: { name: string; limit: number; spent: number }[];
  fire: (message: string, kind?: "success" | "error" | "info") => void;
}

/** Category thresholds (90/100%) — deduped per user/month/category. */
export async function checkCategoryAlerts(input: CategoryAlertInput): Promise<void> {
  const { supabase, userId, categories, fire } = input;
  for (const c of categories) {
    if (!(c.limit > 0)) continue;
    const pct = (c.spent / c.limit) * 100;
    for (const t of CATEGORY_THRESHOLDS) {
      if (pct < t) continue;
      const key = `category_${c.name}_${t}`;
      if (wasSent(userId, key)) continue;
      markSent(userId, key);
      const title = `${c.name} at ${t}%`;
      const body =
        t === 100
          ? "Category limit fully consumed this cycle."
          : `Spending is at ${t}% of this category's monthly limit.`;
      fire(`${title} — ${body}`, "info");
      await persistNotification(supabase, userId, "category_threshold", title, body, {
        category: c.name,
        threshold: t,
        limit: c.limit,
        spent: c.spent,
      });
    }
  }
}
