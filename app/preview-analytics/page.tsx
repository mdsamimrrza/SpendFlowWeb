"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { AnalyticsStatement } from "@/components/analytics/AnalyticsStatement";
import type { ComponentProps } from "react";

/**
 * Static design preview of the signed-in Analytics statement (mock data, no
 * auth, no network) — renders the real AnalyticsPage with injected rows so
 * the deep-detail sections (movement strip, explainers, top outflows, chrono)
 * can be screenshotted without an account.
 */
const CATS = {
  food: { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00", type: "expense" },
  groceries: { id: "c2", name: "Groceries", icon: "🛒", color: "#2E7D32", type: "expense" },
  transport: { id: "c3", name: "Transport", icon: "🚌", color: "#0277BD", type: "expense" },
  shopping: { id: "c4", name: "Shopping", icon: "🛍️", color: "#BA68C8", type: "expense" },
  bills: { id: "c5", name: "Bills & Utilities", icon: "💡", color: "#FBC02D", type: "expense" },
  rent: { id: "c6", name: "Rent", icon: "🏠", color: "#8D6E63", type: "expense" },
  salary: { id: "c7", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
  // Extra expense categories — 10 funded categories with spend exercise the
  // breakdown's top-8 "Show all" expander.
  health: { id: "c8", name: "Health", icon: "💊", color: "#E53935", type: "expense" },
  education: { id: "c9", name: "Education", icon: "🎓", color: "#5E35B1", type: "expense" },
  travel: { id: "c10", name: "Travel", icon: "✈️", color: "#00838F", type: "expense" },
  pets: { id: "c11", name: "Pets", icon: "🐾", color: "#6D4C41", type: "expense" },
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

const rows = [
  // ── current cycle (Sep 1–30, statement day Sep 14) ──
  row("2026-09-14", "09:12", 850, "Cash", "Morning coffee", CATS.food),
  row("2026-09-13", "18:40", 12500, "Card", "Weekly groceries", CATS.groceries),
  row("2026-09-12", "13:20", 2400, "UPI", "Lunch with team", CATS.food),
  row("2026-09-11", "19:05", 8600, "Card", "New sneakers", CATS.shopping),
  row("2026-09-10", "08:45", 320, "Cash", "Bus fare", CATS.transport),
  row("2026-09-09", "12:30", 1500, "UPI", "Electricity top-up", CATS.bills),
  row("2026-09-08", "20:15", 4200, "Card", "Dinner out", CATS.food),
  row("2026-09-07", "08:20", 250, "Cash", "Tea & biscuit", CATS.food),
  row("2026-09-07", "13:45", 480, "UPI", "Stationery", CATS.shopping),
  row("2026-09-06", "11:00", 9800, "Cash", "Vegetables & staples", CATS.groceries),
  row("2026-09-06", "19:30", 120, "Cash", "Parking fee", CATS.transport),
  row("2026-09-05", "17:30", 15000, "Other", "September rent", CATS.rent),
  row("2026-09-05", "09:10", 650, "UPI", "Phone recharge", CATS.bills),
  row("2026-09-04", "12:40", 300, "Cash", "Street food", CATS.food),
  row("2026-09-04", "18:05", 900, "Card", "Ride home", CATS.transport),
  row("2026-09-03", "14:10", 1750, "UPI", "Household supplies", CATS.shopping),
  row("2026-09-03", "20:30", 150, "Cash", "Newspaper & milk", CATS.groceries),
  row("2026-09-02", "11:25", 420, "UPI", "Laundry", CATS.bills),
  row("2026-09-02", "17:50", 700, "Card", "Music subscription", CATS.shopping),
  row("2026-09-05", "21:00", 6400, "Card", "Weekend shopping", CATS.shopping),
  row("2026-09-01", "10:30", 1200, "Cash", "Taxi to office", CATS.transport),
  row("2026-09-01", "08:15", 260, "Cash", "Breakfast", CATS.food),
  row("2026-09-01", "15:35", 380, "UPI", "Mobile data top-up", CATS.bills),
  row("2026-09-01", "19:20", 540, "Card", "Evening snacks", CATS.food),
  row("2026-09-01", "21:10", 210, "Cash", "Auto fare", CATS.transport),
  row("2026-09-02", "09:45", 620, "UPI", "Office lunch", CATS.food),
  row("2026-09-10", "16:20", 1200, "Cash", "Pharmacy", CATS.health),
  row("2026-09-09", "10:05", 2200, "Card", "Online course", CATS.education),
  row("2026-09-07", "14:50", 3400, "Card", "Weekend trip bus", CATS.travel),
  row("2026-09-04", "11:15", 800, "Cash", "Pet food", CATS.pets),
  row("2026-09-01", "10:00", 79700, "Other", "September salary", CATS.salary, "income"),
  // ── previous cycle (Aug) — the movement strip compares like-for-like ──
  row("2026-08-30", "19:00", 7800, "Card", "Family dinner", CATS.food),
  row("2026-08-28", "11:30", 9100, "Cash", "Groceries", CATS.groceries),
  row("2026-08-25", "14:00", 1600, "UPI", "Phone recharge", CATS.bills),
  row("2026-08-20", "18:20", 5200, "Card", "Clothes", CATS.shopping),
  row("2026-08-15", "09:40", 640, "Cash", "Metro card", CATS.transport),
  row("2026-08-12", "12:50", 2300, "UPI", "Internet bill", CATS.bills),
  row("2026-08-05", "17:30", 15000, "Other", "August rent", CATS.rent),
  row("2026-08-01", "10:00", 95000, "Other", "August salary", CATS.salary, "income"),
];

const inject: NonNullable<ComponentProps<typeof AnalyticsStatement>["inject"]> = {
  rows: rows as NonNullable<ComponentProps<typeof AnalyticsStatement>["inject"]>["rows"],
  profile: {
    display_name: "Sam",
    email: "sam@spendflow.app",
    preferred_currency: "NPR",
    cycle_start_day: 1,
    cycle_end_day: null,
  },
  budget: 70400,
  // Category monthly caps — chosen so the redesigned breakdown shows every
  // tone: over (danger), near (brass), safe (income).
  limits: {
    Rent: 16000,
    Groceries: 25000,
    "Food & Dining": 12000,
    Shopping: 20000,
    Transport: 4000,
    "Bills & Utilities": 2500,
  },
};

export default function PreviewAnalyticsPage() {
  return (
    <DashboardShell>
      <AnalyticsStatement inject={inject} />
    </DashboardShell>
  );
}
