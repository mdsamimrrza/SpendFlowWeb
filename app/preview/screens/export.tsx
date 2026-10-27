"use client";

import { AppShell } from "@/components/shell/AppShell";
import { ExportStatement, type ExportInject } from "@/components/export/ExportStatement";

/**
 * Static design preview of the Export & import statement tool (mock data, no
 * auth, no network) – period pills, inflow/outflow split bar, net card and
 * the dropzone-style import chooser, screenshottable without an account.
 */
const CATS = {
  food: { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00", type: "expense" },
  groceries: { id: "c2", name: "Groceries", icon: "🛒", color: "#2E7D32", type: "expense" },
  transport: { id: "c3", name: "Transport", icon: "🚌", color: "#0277BD", type: "expense" },
  bills: { id: "c5", name: "Bills & Utilities", icon: "💡", color: "#FBC02D", type: "expense" },
  rent: { id: "c6", name: "Rent", icon: "🏠", color: "#8D6E63", type: "expense" },
  salary: { id: "c7", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
};

type Cat = (typeof CATS)[keyof typeof CATS];

let seq = 0;
function row(date: string, amount: number, description: string, category: Cat, type: "expense" | "income" = "expense") {
  seq += 1;
  return {
    id: `m${seq}`,
    user_id: "mock",
    category_id: category.id,
    amount,
    currency: "NPR",
    description,
    date,
    time: null,
    payment_method: "Cash" as const,
    notes: null,
    receipt_image_url: null,
    is_recurring: false,
    recurring_rule_id: null,
    recurring_due_date: null,
    bank_account_id: null,
    exchange_rate_to_usd: 0.0065901,
    base_currency: "NPR",
    type,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
    categories: category,
    bank_accounts: null,
  };
}

/* Today-relative dates so the default "This Month" (billing cycle) window
   always contains the mock statement — fixed dates silently aged out. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inject: ExportInject = {
  rows: [
    row(daysAgo(20), 95000, "Monthly salary", CATS.salary, "income"),
    row(daysAgo(18), 15000, "Monthly rent", CATS.rent),
    row(daysAgo(14), 12500, "Weekly groceries", CATS.groceries),
    row(daysAgo(11), 850, "Morning coffee", CATS.food),
    row(daysAgo(9), 1500, "Electricity top-up", CATS.bills),
    row(daysAgo(6), 320, "Bus fare", CATS.transport),
    row(daysAgo(4), 8050, "Vegetables & staples", CATS.groceries),
    row(daysAgo(1), 5600, "Dinner out", CATS.food),
  ] as ExportInject["rows"],
};

export default function PreviewExportPage() {
  return (
    <AppShell>
      <ExportStatement inject={inject} />
    </AppShell>
  );
}
