"use client";

import Link from "next/link";
import { Coffee, Plus, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { MoneyPulseHero } from "@/components/dashboard/MoneyPulseHero";
import { QuickStatTiles, type QuickStat } from "@/components/dashboard/QuickStatTiles";
import { SpendingMix } from "@/components/dashboard/SpendingMix";
import { DailyHeat } from "@/components/dashboard/DailyHeat";
import { RecentFeed } from "@/components/dashboard/RecentFeed";
import { FlowChartCard } from "@/components/charts/FlowChartCard";
import { Panel, SectionTitle } from "@/components/ui/Card";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { DashboardShell } from "@/components/layout/DashboardShell";
import type { ExpenseRow } from "@/services/expenses";

/**
 * Static design preview of the redesigned home dashboard (mock data, no auth,
 * no network) — composes the real DashboardShell + the overview tiers
 * (MoneyPulseHero, quick stats, flow chart + ranked spending mix, daily
 * rhythm heat grid, recent rows) so the layout can be screenshotted without
 * an account.
 */
const fmt = (n: number) => `NPR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;

const pace = {
  daysTotal: 30,
  daysElapsed: 14,
  spentPct: 0.63,
  expectedPct: 0.467,
  projected: 121500,
  onPace: false,
};

/* Deterministic pseudo-random generator so shots stay stable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);

const CATS = [
  { name: "Food & Dining", icon: "🍔", color: "#EF6C00" },
  { name: "Groceries", icon: "🛒", color: "#2E7D32" },
  { name: "Transport", icon: "🚌", color: "#0277BD" },
  { name: "Shopping", icon: "🛍️", color: "#BA68C8" },
  { name: "Bills & Utilities", icon: "🧾", color: "#FBC02D" },
];
const METHODS = ["Cash", "Card", "eSewa", "Khalti", "Bank Transfer"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ~34 entries across the last 14 days + a salary on day 14 back. */
const mockRows: ExpenseRow[] = (() => {
  const out: ExpenseRow[] = [];
  const today = new Date();
  let n = 0;
  out.push({
    id: "s1",
    type: "income",
    amount: 95000,
    currency: "NPR",
    date: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)),
    time: "10:00",
    payment_method: "Bank Transfer",
    description: "September salary",
    categories: { id: "cs", name: "Salary", icon: "💼", color: "#2E7D32", type: "expense" },
    bank_accounts: { id: "b1", name: "Nabil Bank", icon: "bank", account_type: "bank" },
  } as unknown as ExpenseRow);
  for (let back = 13; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(today.getDate() - back);
    const count = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const cat = CATS[Math.floor(rnd() * CATS.length)];
      out.push({
        id: `r${n++}`,
        type: "expense",
        amount: Math.round(200 + rnd() * 4200),
        currency: "NPR",
        date: iso(d),
        time: `${String(8 + Math.floor(rnd() * 12)).padStart(2, "0")}:${String(Math.floor(rnd() * 6) * 10).padStart(2, "0")}`,
        payment_method: METHODS[Math.floor(rnd() * METHODS.length)],
        description: `${cat.name} run`,
        categories: { id: `c${cat.name}`, ...cat, type: "expense" },
      } as unknown as ExpenseRow);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
})();

const byDay = new Map<string, number>();
for (const r of mockRows) {
  if (r.type !== "expense") continue;
  byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
}
const byCat = new Map<string, { value: number; color: string; icon: string }>();
for (const r of mockRows) {
  if (r.type !== "expense" || !r.categories) continue;
  const s = byCat.get(r.categories.name) ?? { value: 0, color: r.categories.color, icon: r.categories.icon };
  s.value += r.amount;
  byCat.set(r.categories.name, s);
}
const slices = Array.from(byCat.entries())
  .map(([label, s]) => ({ label, value: s.value, color: s.color, icon: s.icon }))
  .sort((a, b) => b.value - a.value);
const spent = mockRows.reduce((s, r) => s + (r.type === "income" ? 0 : r.amount), 0);
const income = mockRows.reduce((s, r) => s + (r.type === "income" ? r.amount : 0), 0);

const dailyDays: { iso: string; value: number }[] = [];
for (let back = 13; back >= 0; back--) {
  const d = new Date(today0());
  d.setDate(d.getDate() - back);
  dailyDays.push({ iso: iso(d), value: byDay.get(iso(d)) ?? 0 });
}
function today0() {
  return new Date();
}

const quickStats: QuickStat[] = [
  { key: "today", label: "Today", value: fmt(byDay.get(iso(new Date())) ?? 850), sub: "spent today", icon: <Coffee size={15} />, tone: "primary" },
  { key: "avg", label: "Avg per day", value: fmt(Math.round(spent / 14)), sub: "14 days in", icon: <TrendingUp size={15} />, tone: "danger" },
  { key: "top", label: "Top category", value: slices[0]?.label ?? "—", sub: fmt(slices[0]?.value ?? 0), icon: <Sparkles size={15} />, tone: "brass" },
  { key: "savings", label: "Savings rate", value: `${Math.max(0, Math.round(((income - spent) / income) * 100))}%`, sub: "kept of income", icon: <Wallet size={15} />, tone: "income" },
];

export default function PreviewDashPage() {
  return (
    <DashboardShell>
      <main className="mx-auto w-full max-w-[1200px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-faint">
              {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-extrabold tracking-tight text-text sm:text-[28px]">
              Good morning, Sam
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 shadow-soft sm:flex">
              <CurrencyFlag currency="NPR" size={16} />
              <span className="caps whitespace-nowrap">Sep 1 – Sep 30</span>
            </span>
            <Link
              href="/expense/new"
              aria-label="Add transaction"
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-strong px-3.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-pop transition hover:brightness-110 active:scale-[0.97] sm:px-5"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">Add</span>
            </Link>
          </div>
        </header>

        <div className="mt-1">
          <MoneyPulseHero
            net={income - spent}
            income={income}
            expense={spent}
            todayTotal={byDay.get(iso(new Date())) ?? 850}
            budget={90000}
            pace={pace}
            formatted={fmt}
            cycleLabel="Sep 1 – Sep 30"
            delta={{ text: "+12,400", positive: true }}
            entries={mockRows.length}
          />
        </div>

        <div className="mt-4">
          <QuickStatTiles tiles={quickStats} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 md:col-span-2">
            <FlowChartCard label="Cash flow" rows={mockRows} />
          </div>
          <Panel label="Spending mix" className="min-w-0">
            <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
              <SpendingMix
                slices={slices}
                formatValue={fmt}
                otherLabel="Other"
                cycleTotalLabel="Cycle outflow"
              />
            </div>
          </Panel>

          <Panel label="Daily rhythm" className="min-w-0 self-start md:col-span-1 lg:col-span-1">
            <div className="flex h-full flex-col p-4 sm:p-5">
              <DailyHeat
                days={dailyDays}
                locale="en"
                formatValue={fmt}
                todayISO={iso(new Date())}
                labels={{ less: "less", more: "more", busiest: "Busiest day" }}
              />
            </div>
          </Panel>

          <section className="min-w-0 md:col-span-2 lg:col-span-2">
            <SectionTitle action={<Link href="/history" className="caps !text-primary hover:underline">View All</Link>}>
              Recent Activity
            </SectionTitle>
            <RecentFeed
              rows={mockRows}
              amountFor={(r) => fmt(r.amount)}
              displayCurrency="NPR"
              locale="en"
              max={8}
              labels={{ today: "Today", yesterday: "Yesterday" }}
            />
          </section>
        </div>
      </main>
    </DashboardShell>
  );
}
