"use client";

/**
 * Static design-preview route for the redesigned History page — the real
 * register rendered inside the real DashboardShell with an injected mock
 * dataset (client-side mirror of the server filters; no auth, no network).
 * Not linked from navigation.
 */
import { DashboardShell } from "@/components/layout/DashboardShell";
import { HistoryRegister } from "@/components/history/HistoryRegister";
import type { ExpenseRow } from "@/services/expenses";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RATE = 0.0065901; // offline NPR/USD peg fallback (matches preview-analytics)

const CATS = [
  { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00" },
  { id: "c2", name: "Groceries", icon: "🛒", color: "#2E7D32" },
  { id: "c3", name: "Transport", icon: "🚌", color: "#0277BD" },
  { id: "c4", name: "Shopping", icon: "🛍️", color: "#BA68C8" },
  { id: "c5", name: "Bills & Utilities", icon: "🧾", color: "#FBC02D" },
];
const METHODS = ["Cash", "Card", "eSewa", "Khalti", "Bank Transfer"];
const ACCOUNTS = [
  { id: "b1", name: "Nabil Bank", icon: "bank", account_type: "bank" },
  { id: "b2", name: "eSewa Wallet", icon: "wallet", account_type: "wallet" },
];
const DESC = {
  "c1": ["Morning coffee", "Lunch at cafe", "Dinner out", "Street snacks", "Biryay night"],
  "c2": ["Weekly groceries", "Vegetables & fruit", "Milk & bread", "Kitchen supplies"],
  "c3": ["Taxi ride", "Bus pass", "Fuel top-up", "Rideshare"],
  "c4": ["T-shirt", "Phone case", "Sneakers", "Books"],
  "c5": ["Internet bill", "Electricity", "Mobile recharge", "Water bill"],
} as Record<string, string[]>;

/* Deterministic pseudo-random so shots stay stable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(7);

function buildRows(): ExpenseRow[] {
  const out: ExpenseRow[] = [];
  const today = new Date();
  let n = 0;
  // Salary income at the start of the window.
  out.push({
    id: "inc1",
    user_id: "u1",
    type: "income",
    amount: 55000,
    currency: "NPR",
    exchange_rate_to_usd: RATE,
    date: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)),
    time: "10:00",
    payment_method: "Bank Transfer",
    description: "Monthly salary",
    notes: null,
    category_id: "c-sal",
    bank_accounts: ACCOUNTS[0],
    categories: { id: "c-sal", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
  } as unknown as ExpenseRow);
  for (let back = 13; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(today.getDate() - back);
    const count = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const cat = CATS[Math.floor(rnd() * CATS.length)];
      const names = DESC[cat.id];
      out.push({
        id: `r${n++}`,
        user_id: "u1",
        type: "expense",
        amount: Math.round(200 + rnd() * 4200),
        currency: "NPR",
        exchange_rate_to_usd: RATE,
        date: iso(d),
        time: `${String(8 + Math.floor(rnd() * 12)).padStart(2, "0")}:${String(Math.floor(rnd() * 6) * 10).padStart(2, "0")}`,
        payment_method: METHODS[Math.floor(rnd() * METHODS.length)],
        description: names[Math.floor(rnd() * names.length)],
        notes: rnd() > 0.8 ? "With memo" : null,
        category_id: cat.id,
        bank_accounts: rnd() > 0.5 ? ACCOUNTS[Math.floor(rnd() * ACCOUNTS.length)] : null,
        categories: { ...cat, type: "expense" },
      } as unknown as ExpenseRow);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

const rows = buildRows();

export default function PreviewHistoryPage() {
  return (
    <DashboardShell>
      <HistoryRegister inject={{ rows }} />
    </DashboardShell>
  );
}
