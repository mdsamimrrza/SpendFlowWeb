"use client";

import { AppShell } from "@/components/shell/AppShell";
import { AnalyticsStatement } from "@/components/analytics/AnalyticsStatement";
import type { ComponentProps } from "react";

/**
 * Static design preview of the signed-in Analytics page (mock data, no
 * auth, no network) - renders the real AnalyticsStatement with injected rows
 * so the comparison-ledger composition (cash-flow hero with delta chips and
 * the daily outflow bars, category movement chart, monthly bars, largest
 * expenses, health band) can be screenshotted without an account. Mock
 * coverage spans the last 6 calendar months so the month-over-month
 * comparisons and the daily bars are populated.
 */
const CATS = {
  food: { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00", type: "expense" },
  groceries: { id: "c2", name: "Groceries", icon: "🛒", color: "#2E7D32", type: "expense" },
  transport: { id: "c3", name: "Transport", icon: "🚌", color: "#0277BD", type: "expense" },
  shopping: { id: "c4", name: "Shopping", icon: "🛍️", color: "#BA68C8", type: "expense" },
  bills: { id: "c5", name: "Bills & Utilities", icon: "💡", color: "#FBC02D", type: "expense" },
  rent: { id: "c6", name: "Rent", icon: "🏠", color: "#8D6E63", type: "expense" },
  salary: { id: "c7", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
  health: { id: "c8", name: "Health", icon: "💊", color: "#E53935", type: "expense" },
  education: { id: "c9", name: "Education", icon: "🎓", color: "#5E35B1", type: "expense" },
  travel: { id: "c10", name: "Travel", icon: "✈️", color: "#00838F", type: "expense" },
};

type Cat = (typeof CATS)[keyof typeof CATS];

let seq = 0;
function row(
  date: string,
  time: string,
  amount: number,
  method: "Cash" | "Card" | "UPI" | "Other",
  description: string,
  category: Cat,
  type: "expense" | "income" = "expense",
) {
  seq += 1;
  return {
    id: `m${seq}`,
    user_id: "mock",
    category_id: category.id,
    amount,
    currency: "NPR",
    description,
    date,
    time,
    payment_method: method,
    notes: null,
    receipt_image_url: null,
    is_recurring: false,
    recurring_rule_id: null,
    recurring_due_date: null,
    bank_account_id: null,
    exchange_rate_to_usd: 0.0065901, // matches the offline NPR fallback (94.84 INR/USD ÷ 1.6 peg) so USD-basis and display-basis figures reconcile
    base_currency: "NPR",
    type,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
    categories: category,
    bank_accounts: null,
  };
}

// Six months (May-Oct 2026): salary + rent + a repeatable spend texture with
// per-month drift, so every chart in the reports composition has real shape
// at any period.
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const rows: ReturnType<typeof row>[] = [];
MONTHS.forEach((m, mi) => {
  const isCurrent = m === "2026-10";
  rows.push(row(`${m}-01`, "10:00", 79700 + mi * 400, "Other", "Monthly salary", CATS.salary, "income"));
  rows.push(row(`${m}-05`, "17:30", 15000, "Other", "Monthly rent", CATS.rent));
  rows.push(row(`${m}-02`, "09:45", 620, "UPI", "Office lunch", CATS.food));
  rows.push(row(`${m}-03`, "13:20", 2400 + mi * 150, "UPI", "Lunch with team", CATS.food));
  rows.push(row(`${m}-04`, "11:15", 800, "Cash", "Pet supplies", CATS.groceries));
  rows.push(row(`${m}-06`, "11:00", 9800 - mi * 350, "Cash", "Vegetables & staples", CATS.groceries));
  rows.push(row(`${m}-07`, "08:20", 250, "Cash", "Tea & biscuit", CATS.food));
  rows.push(row(`${m}-08`, "20:15", 4200 + mi * 280, "Card", "Dinner out", CATS.food));
  rows.push(row(`${m}-09`, "12:30", 1500, "UPI", "Electricity top-up", CATS.bills));
  rows.push(row(`${m}-10`, "16:20", 1200, "Cash", "Pharmacy", CATS.health));
  rows.push(row(`${m}-11`, "19:05", 8600 + (mi % 3) * 1100, "Card", "New sneakers", CATS.shopping));
  rows.push(row(`${m}-12`, "14:10", 1750, "UPI", "Household supplies", CATS.shopping));
  rows.push(row(`${m}-13`, "10:05", 2200, "Card", "Online course", CATS.education));
  rows.push(row(`${m}-14`, "09:12", 850, "Cash", "Morning coffee", CATS.food));
  rows.push(row(`${m}-15`, "10:05", 3400 + (mi % 2) * 1600, "Card", "Weekend trip bus", CATS.travel));
  rows.push(row(`${m}-16`, "08:45", 320, "Cash", "Bus fare", CATS.transport));
  rows.push(row(`${m}-17`, "18:40", 12500 - mi * 450, "Card", "Weekly groceries", CATS.groceries));
  rows.push(row(`${m}-18`, "13:45", 480, "UPI", "Stationery", CATS.shopping));
  rows.push(row(`${m}-19`, "19:30", 120, "Cash", "Parking fee", CATS.transport));
  rows.push(row(`${m}-20`, "12:40", 300, "Cash", "Street food", CATS.food));
  if (!isCurrent) {
    // Past months carry a couple of late-month entries too; the current
    // month stops at "today" (the 20th) so the cycle reads as in-progress.
    rows.push(row(`${m}-24`, "18:05", 900, "Card", "Ride home", CATS.transport));
    rows.push(row(`${m}-26`, "17:50", 700, "Card", "Music subscription", CATS.shopping));
  }
});

// The current month stops at real "today" so the calendar never shades
// future days as spend.
const todayIso = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const visibleRows = rows.filter((r) => r.date <= todayIso || !r.date.startsWith("2026-10"));

const inject: NonNullable<ComponentProps<typeof AnalyticsStatement>["inject"]> = {
  rows: visibleRows as NonNullable<ComponentProps<typeof AnalyticsStatement>["inject"]>["rows"],
  profile: {
    display_name: "Sam",
    email: "sam@spendflow.app",
    preferred_currency: "NPR",
    cycle_start_day: 1,
    cycle_end_day: null,
  },
  budget: 70400,
};

export default function PreviewAnalyticsPage() {
  return (
    <AppShell>
      <AnalyticsStatement inject={inject} />
    </AppShell>
  );
}
