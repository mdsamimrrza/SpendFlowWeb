"use client";

/**
 * Static design-preview route for the redesigned Recurring page — the real
 * page component rendered inside the real DashboardShell with an injected
 * mock register (no auth, no network). Payment actions are inert without a
 * user; all visuals render from the seam. Not linked from navigation.
 */
import { DashboardShell } from "@/components/layout/DashboardShell";
import { RecurringRegister } from "@/components/recurring/RecurringRegister";
import type { RecurringRuleRow, RuleOccurrence } from "@/services/recurring";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

const RATE = 0.0065901;

const rules = [
  {
    id: "r1",
    category_id: "c1",
    amount: 15000,
    currency: "NPR",
    description: "House rent",
    payment_method: "Bank Transfer",
    frequency: "monthly",
    interval_days: null,
    mode: "pay_on_due",
    plan_start_date: "2026-01-01",
    next_due_date: shift(2),
    is_active: true,
    exchange_rate_to_usd: RATE,
    base_currency: "NPR",
    categories: { id: "c1", name: "Rent", icon: "🏠", color: "#8D6E63" },
  },
  {
    id: "r2",
    category_id: "c2",
    amount: 1200,
    currency: "NPR",
    description: "Netflix subscription",
    payment_method: "Card",
    frequency: "monthly",
    interval_days: null,
    mode: "pay_on_due",
    plan_start_date: "2026-02-01",
    next_due_date: shift(0),
    is_active: true,
    exchange_rate_to_usd: RATE,
    base_currency: "NPR",
    categories: { id: "c2", name: "Entertainment", icon: "🎬", color: "#BA68C8" },
  },
  {
    id: "r3",
    category_id: "c3",
    amount: 2200,
    currency: "NPR",
    description: "Internet & cable",
    payment_method: "eSewa",
    frequency: "monthly",
    interval_days: null,
    mode: "auto_charge",
    plan_start_date: "2026-01-05",
    next_due_date: shift(6),
    is_active: true,
    exchange_rate_to_usd: RATE,
    base_currency: "NPR",
    categories: { id: "c3", name: "Bills & Utilities", icon: "🧾", color: "#FBC02D" },
  },
  {
    id: "r4",
    category_id: "c4",
    amount: 850,
    currency: "NPR",
    description: "Bike fuel",
    payment_method: "Cash",
    frequency: "weekly",
    interval_days: null,
    mode: "pay_on_due",
    plan_start_date: "2026-03-02",
    next_due_date: shift(3),
    is_active: true,
    exchange_rate_to_usd: RATE,
    base_currency: "NPR",
    categories: { id: "c4", name: "Transport", icon: "🚌", color: "#0277BD" },
  },
  {
    id: "r5",
    category_id: "c5",
    amount: 4500,
    currency: "NPR",
    description: "Electricity bill",
    payment_method: "Khalti",
    frequency: "monthly",
    interval_days: null,
    mode: "pay_on_due",
    plan_start_date: "2026-01-10",
    next_due_date: shift(-2),
    is_active: true,
    exchange_rate_to_usd: RATE,
    base_currency: "NPR",
    categories: { id: "c5", name: "Bills & Utilities", icon: "🧾", color: "#FBC02D" },
  },
  {
    id: "r6",
    category_id: "c6",
    amount: 800,
    currency: "NPR",
    description: "Gym membership",
    payment_method: "Card",
    frequency: "monthly",
    interval_days: null,
    mode: "pay_on_due",
    plan_start_date: "2026-04-01",
    next_due_date: shift(15),
    is_active: false,
    exchange_rate_to_usd: RATE,
    base_currency: "NPR",
    categories: { id: "c6", name: "Health", icon: "🏋️", color: "#2E7D32" },
  },
] as unknown as RecurringRuleRow[];

/** A plan already denominated in the preview's display currency — it must
 *  render without a conversion caption, proving both paths at once. */
const usdRule = {
  id: "r7",
  category_id: "c7",
  amount: 15.99,
  currency: "USD",
  description: "iCloud storage",
  payment_method: "Card",
  frequency: "monthly",
  interval_days: null,
  mode: "pay_on_due",
  plan_start_date: "2026-06-01",
  next_due_date: shift(9),
  is_active: true,
  exchange_rate_to_usd: 1,
  base_currency: "USD",
  categories: { id: "c7", name: "Subscriptions", icon: "", color: "#0EA5E9" },
} as unknown as RecurringRuleRow;

const occurrences = [
  { id: "o1", recurring_rule_id: "r1", recurring_due_date: shift(-28), date: shift(-28), amount: 15000, currency: "NPR", exchange_rate_to_usd: RATE },
  { id: "o2", recurring_rule_id: "r1", recurring_due_date: shift(-58), date: shift(-57), amount: 15000, currency: "NPR", exchange_rate_to_usd: RATE },
  { id: "o3", recurring_rule_id: "r3", recurring_due_date: shift(-24), date: shift(-24), amount: 2200, currency: "NPR", exchange_rate_to_usd: RATE },
  { id: "o4", recurring_rule_id: "r3", recurring_due_date: shift(-54), date: shift(-52), amount: 2200, currency: "NPR", exchange_rate_to_usd: RATE },
  { id: "o5", recurring_rule_id: "r4", recurring_due_date: shift(-4), date: shift(-4), amount: 850, currency: "NPR", exchange_rate_to_usd: RATE },
  { id: "o6", recurring_rule_id: "r4", recurring_due_date: shift(-11), date: shift(-10), amount: 850, currency: "NPR", exchange_rate_to_usd: RATE },
  { id: "o7", recurring_rule_id: "r5", recurring_due_date: shift(-32), date: shift(-30), amount: 4500, currency: "NPR", exchange_rate_to_usd: RATE },
] as unknown as RuleOccurrence[];

export default function PreviewRecurringPage() {
  return (
    <DashboardShell>
      {/* displayCurrency "USD" mirrors the account that surfaced the FX bug:
          NPR plans must price into USD with their own figure as the caption,
          while the USD plan needs no conversion at all. */}
      <RecurringRegister inject={{ rules: [...rules, usdRule], occurrences, displayCurrency: "USD" }} />
    </DashboardShell>
  );
}
