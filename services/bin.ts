/**
 * Bin (Google-Photos-style trash) — mobile services/bin.ts parity.
 *
 * Deleting an expense or a recurring plan sets `deleted_at` instead of removing
 * the row; the item then lives here for BIN_RETENTION_DAYS days, showing its own
 * countdown, until either the user restores it / deletes it forever, or the
 * nightly `purge_expired_bin_items()` cron sweep (owned by the mobile repo)
 * removes the row from the database for good.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Expense, RecurringRule } from "@/types/database.types";
import { deleteReceipt, RECEIPT_BUCKET } from "./receipts";

const DAY_MS = 86_400_000;

/** Days a deleted expense / recurring plan stays restorable in the Bin. */
export const BIN_RETENTION_DAYS = 60;

/** One restorable row inside the Bin (categories join kept for display). */
export type BinItem =
  | {
      kind: "expense";
      id: string;
      deleted_at: string;
      expense: Expense & {
        categories: { id: string; name: string; icon: string; color: string; type: string } | null;
      };
    }
  | {
      kind: "recurring";
      id: string;
      deleted_at: string;
      rule: RecurringRule & {
        categories: { id: string; name: string; icon: string; color: string } | null;
      };
    };

/** ISO cutoff: rows soft-deleted BEFORE this instant have exhausted the 60 days. */
function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - BIN_RETENTION_DAYS * DAY_MS).toISOString();
}

/** Whole days left before the automatic purge (60 right after deletion → 1). */
export function binDaysLeft(deletedAt: string, now: Date = new Date()): number {
  const remainingMs = deletedAt
    ? BIN_RETENTION_DAYS * DAY_MS - (now.getTime() - new Date(deletedAt).getTime())
    : 0;
  return Math.min(BIN_RETENTION_DAYS, Math.max(1, Math.ceil(remainingMs / DAY_MS)));
}

/**
 * Every restorable item: binned expenses + binned recurring plans, newest
 * deletion first. Rows that already passed the window are hidden — the cron
 * purge deletes them server-side, and we must never offer "Restore" for a row
 * whose data is about to vanish mid-tap.
 */
export async function listBinItems(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BinItem[]> {
  const cutoff = retentionCutoff();

  const [expenseResult, ruleResult] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, categories:category_id (id, name, icon, color, type)")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", cutoff)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("recurring_rules")
      .select("*, categories:category_id (id, name, icon, color)")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", cutoff)
      .order("deleted_at", { ascending: false }),
  ]);

  if (expenseResult.error) throw expenseResult.error;
  if (ruleResult.error) throw ruleResult.error;

  const items: BinItem[] = [
    ...(expenseResult.data ?? []).map((expense) => ({
      kind: "expense" as const,
      id: expense.id,
      deleted_at: (expense.deleted_at ?? expense.updated_at) as string,
      expense: expense as unknown as Extract<BinItem, { kind: "expense" }>["expense"],
    })),
    ...(ruleResult.data ?? []).map((rule) => ({
      kind: "recurring" as const,
      id: rule.id,
      deleted_at: (rule.deleted_at ?? rule.updated_at) as string,
      rule: rule as unknown as Extract<BinItem, { kind: "recurring" }>["rule"],
    })),
  ];

  return items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

/** Back to normal: clears the trash flag. Callers refresh their own lists. */
export async function restoreBinItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  item: BinItem,
): Promise<void> {
  const table = item.kind === "expense" ? "expenses" : "recurring_rules";
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq("id", item.id)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * "Delete forever" — removes the row now, skipping the remaining countdown,
 * plus its private receipt file. Ownership is RLS-scoped; the user_id filter is
 * defense in depth.
 */
export async function deleteBinItemForever(
  supabase: SupabaseClient<Database>,
  userId: string,
  item: BinItem,
): Promise<void> {
  const table = item.kind === "expense" ? "expenses" : "recurring_rules";
  if (item.kind === "expense") {
    // Best-effort first: a storage hiccup must not leave the row undeleted.
    // Bind to the row owner's folder so a crafted receipt_image_url pointing
    // at another {uid}/ can never be removed with this caller's JWT.
    await deleteReceipt(supabase, userId, item.expense.receipt_image_url).catch(() => undefined);
  }
  const { error } = await supabase.from(table).delete().eq("id", item.id).eq("user_id", userId);
  if (error) throw error;
}

/** Deletes every binned row (and its receipt file). Returns the number removed. */
export async function emptyBin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const items = await listBinItems(supabase, userId);
  let removed = 0;
  for (const item of items) {
    await deleteBinItemForever(supabase, userId, item);
    removed += 1;
  }
  return removed;
}

/**
 * The nightly cron purge also un-roots receipt FILES it can no longer reach
 * from SQL; the migration queues their paths and this claim drains them
 * through the normal owner-scoped storage delete. Fire-and-forget on Bin load.
 */
export async function drainBinReceiptOrphans(
  supabase: SupabaseClient<Database>,
  userId?: string | null,
): Promise<void> {
  if (!userId) return;
  try {
    const { data, error } = await supabase.rpc("claim_bin_receipt_orphans");
    if (error || !data?.length) return;
    // The claim is scoped by the deployed SECURITY DEFINER function, but the
    // paths it returns are external-program input to a delete sink: drop
    // anything not rooted in the caller's own {uid}/ folder (NV-1 binding).
    const prefix = `${userId}/`;
    const paths = (data as string[]).filter(
      (p) => typeof p === "string" && p.startsWith(prefix) && !p.includes(".."),
    );
    if (paths.length > 0) {
      await supabase.storage.from(RECEIPT_BUCKET).remove(paths).catch(() => undefined);
    }
  } catch {
    // Storage hygiene is best-effort; queued paths stay for the next visit.
  }
}
