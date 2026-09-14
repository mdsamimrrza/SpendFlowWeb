"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import BinStatement, { type BinInject } from "@/components/bin/BinStatement";
import type { BinItem } from "@/services/bin";

/**
 * Static design preview of the Bin (mock data, no auth, no network) — the
 * 60-day trash register with restore / delete-forever rows and countdown
 * tones, screenshottable without an account.
 */
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

const inject: BinInject = {
  items: [
    {
      kind: "expense",
      id: "b1",
      deleted_at: daysAgo(2),
      expense: {
        id: "b1",
        user_id: "mock",
        category_id: "c1",
        amount: 850,
        currency: "NPR",
        description: "Morning coffee",
        date: "2026-09-12",
        time: "09:12",
        payment_method: "Cash",
        notes: null,
        receipt_image_url: null,
        is_recurring: false,
        recurring_rule_id: null,
        recurring_due_date: null,
        bank_account_id: null,
        exchange_rate_to_usd: 0.0065901,
        base_currency: "NPR",
        type: "expense",
        created_at: daysAgo(3),
        updated_at: daysAgo(2),
        deleted_at: daysAgo(2),
        categories: { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00", type: "expense" },
      },
    },
    {
      kind: "recurring",
      id: "b2",
      deleted_at: daysAgo(9),
      rule: {
        id: "b2",
        user_id: "mock",
        category_id: "c5",
        amount: 1500,
        currency: "NPR",
        description: "Internet bill",
        payment_method: "Card",
        frequency: "monthly",
        interval_days: null,
        mode: "auto_charge",
        plan_start_date: "2026-01-05",
        next_due_date: "2026-10-05",
        is_active: true,
        exchange_rate_to_usd: 0.0065901,
        base_currency: "NPR",
        created_at: daysAgo(200),
        updated_at: daysAgo(9),
        deleted_at: daysAgo(9),
        categories: { id: "c5", name: "Bills & Utilities", icon: "💡", color: "#FBC02D" },
      },
    },
    {
      kind: "expense",
      id: "b3",
      deleted_at: daysAgo(41),
      expense: {
        id: "b3",
        user_id: "mock",
        category_id: "c4",
        amount: 8600,
        currency: "NPR",
        description: "New sneakers",
        date: "2026-08-04",
        time: "19:05",
        payment_method: "Card",
        notes: null,
        receipt_image_url: null,
        is_recurring: false,
        recurring_rule_id: null,
        recurring_due_date: null,
        bank_account_id: null,
        exchange_rate_to_usd: 0.0065901,
        base_currency: "NPR",
        type: "expense",
        created_at: daysAgo(42),
        updated_at: daysAgo(41),
        deleted_at: daysAgo(41),
        categories: { id: "c4", name: "Shopping", icon: "🛍️", color: "#BA68C8", type: "expense" },
      },
    },
    {
      kind: "expense",
      id: "b4",
      deleted_at: daysAgo(55),
      expense: {
        id: "b4",
        user_id: "mock",
        category_id: "c7",
        amount: 12000,
        currency: "NPR",
        description: "Freelance project",
        date: "2026-07-20",
        time: null,
        payment_method: "Other",
        notes: null,
        receipt_image_url: null,
        is_recurring: false,
        recurring_rule_id: null,
        recurring_due_date: null,
        bank_account_id: null,
        exchange_rate_to_usd: 0.0065901,
        base_currency: "NPR",
        type: "income",
        created_at: daysAgo(56),
        updated_at: daysAgo(55),
        deleted_at: daysAgo(55),
        categories: { id: "c7", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
      },
    },
  ] as BinItem[],
};

export default function PreviewBinPage() {
  return (
    <DashboardShell>
      <BinStatement inject={inject} />
    </DashboardShell>
  );
}
