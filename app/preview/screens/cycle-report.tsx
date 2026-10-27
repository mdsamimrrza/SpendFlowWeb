"use client";

/**
 * Static design-preview route for the Cycle Report – the real
 * CycleReportStatement inside the real AppShell with an injected mock
 * dataset over a fixed 28-day cycle (deterministic, no auth, no network).
 * Not linked from navigation.
 */
import { AppShell } from "@/components/shell/AppShell";
import { CycleReportStatement } from "@/components/profit-loss/CycleReportStatement";
import type { ExpenseRow } from "@/services/expenses";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RATE = 0.0065901; // offline NPR/USD peg fallback (matches other previews)

const CATS = [
  { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00" },
  { id: "c2", name: "Groceries", icon: "🛒", color: "#2E7D32" },
  { id: "c3", name: "Transport", icon: "🚌", color: "#0277BD" },
  { id: "c4", name: "Shopping", icon: "🛍️", color: "#BA68C8" },
  { id: "c5", name: "Bills & Utilities", icon: "🧾", color: "#FBC02D" },
  { id: "c6", name: "Entertainment", icon: "🎬", color: "#C62828" },
];
const METHODS = ["Cash", "Card", "eSewa", "Khalti", "Bank Transfer"];
const ACCOUNTS = [
  { id: "b1", name: "Nabil Bank", icon: "bank", account_type: "bank" },
  { id: "b2", name: "eSewa Wallet", icon: "wallet", account_type: "wallet" },
];
const DESC: Record<string, string[]> = {
  c1: ["Morning coffee", "Lunch at cafe", "Dinner out", "Street snacks"],
  c2: ["Weekly groceries", "Vegetables & fruit", "Milk & bread"],
  c3: ["Taxi ride", "Fuel top-up", "Rideshare"],
  c4: ["T-shirt", "Phone case", "Sneakers"],
  c5: ["Internet bill", "Electricity", "Mobile recharge"],
  c6: ["Movie night", "Game pass", "Concert ticket"],
};

/* Deterministic pseudo-random so shots stay stable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 14), 0)) >>> 0;
    return t / 4294967296;
  };
}
const rnd = mulberry32(11);

function buildRows(): ExpenseRow[] {
  const out: ExpenseRow[] = [];
  const today = new Date();
  let n = 0;
  // Salary lands two days into the cycle.
  out.push({
    id: "inc1",
    user_id: "u1",
    type: "income",
    amount: 55000,
    currency: "NPR",
    exchange_rate_to_usd: RATE,
    date: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 26)),
    time: "10:00",
    payment_method: "Bank Transfer",
    description: "Monthly salary",
    notes: null,
    category_id: "c-sal",
    bank_accounts: ACCOUNTS[0],
    categories: { id: "c-sal", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
  } as unknown as ExpenseRow);
  out.push({
    id: "inc2",
    user_id: "u1",
    type: "income",
    amount: 8200,
    currency: "NPR",
    exchange_rate_to_usd: RATE,
    date: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 12)),
    time: "18:30",
    payment_method: "eSewa",
    description: "Freelance gig",
    notes: null,
    category_id: "c-free",
    bank_accounts: ACCOUNTS[1],
    categories: { id: "c-free", name: "Freelance", icon: "💻", color: "#0277BD", type: "income" },
  } as unknown as ExpenseRow);
  for (let back = 27; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(today.getDate() - back);
    const count = rnd() > 0.75 ? 0 : 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < count; i++) {
      const cat = CATS[Math.floor(rnd() * CATS.length)];
      const names = DESC[cat.id];
      out.push({
        id: `e${++n}`,
        user_id: "u1",
        type: "expense",
        amount: Math.round((60 + rnd() * 2400) / 10) * 10,
        currency: "NPR",
        exchange_rate_to_usd: RATE,
        date: iso(d),
        time: `${String(7 + Math.floor(rnd() * 14)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`,
        payment_method: METHODS[Math.floor(rnd() * METHODS.length)],
        description: names[Math.floor(rnd() * names.length)],
        notes: null,
        category_id: cat.id,
        bank_accounts: ACCOUNTS[Math.floor(rnd() * ACCOUNTS.length)],
        categories: { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, type: "expense" },
      } as unknown as ExpenseRow);
    }
  }
  return out;
}

const ROWS = buildRows();
const TO = iso(new Date());
const FROM = iso(new Date(new Date().setDate(new Date().getDate() - 27)));

export default function PreviewCycleReportPage() {
  return (
    <AppShell>
      <CycleReportStatement
        loading={false}
        rows={ROWS}
        from={FROM}
        to={TO}
        currency="NPR"
        budget={40000}
        onBack={() => {}}
      />
    </AppShell>
  );
}
