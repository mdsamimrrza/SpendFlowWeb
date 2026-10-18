"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { AccountsStrip } from "@/components/dash/AccountsStrip";
import { Upcoming } from "@/components/dash/Upcoming";
import { BillsDue } from "@/components/dash/BillsDue";
import { Feed } from "@/components/dash/Feed";
import { MixCard } from "@/components/dash/MixCard";
import {
  cardPillClass,
  DashCard,
  DeltaChip,
  RangeChip,
  StatCard,
} from "@/components/dash/primitives";
import { BalanceCard } from "@/components/dash/BalanceCard";
import { CashFlowCard } from "@/components/dash/CashFlowCard";
import { HeatGrid } from "@/components/graphs/HeatGrid";
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import type { FlowPoint } from "@/components/graphs/FlowChart";
import type { ExpenseRow } from "@/services/expenses";
import type { RecurringRuleRow } from "@/services/recurring";
import type { BankAccountRow } from "@/services/bankAccounts";

/**
 * Static design preview of the de-boxed "Sage Ledger" home dashboard (mock
 * data, no auth, no network) – hero safe-to-spend number, ruled sections
 * instead of cards, cash-flow chart with the 1D/1W/1M/Cycle/1Y/Custom
 * filters. Composes the real AppShell + overview components with injected
 * data so the layout can be screenshotted without an account.
 */
const fmt = (n: number) =>
  `NPR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
const axisFmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

const now_ = new Date();
const cycleLabel = "Oct 1 – Oct 31";
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const pace = {
  daysTotal: 30,
  daysElapsed: 14,
  spentPct: 0.061,
};

/* ── Deterministic mocks ── */
const CATS = [
  { name: "Food & Dining", color: "#EF6C00" },
  { name: "Groceries", color: "#2E7D32" },
  { name: "Transport", color: "#0277BD" },
  { name: "Shopping", color: "#BA68C8" },
  { name: "Bills & Utilities", color: "#FBC02D" },
];
const METHODS = ["Cash", "Card", "eSewa", "Khalti", "Bank Transfer"];

/* Two entries a day across the last 14 days + a salary a week back. */
const mockRows: ExpenseRow[] = (() => {
  const out: ExpenseRow[] = [];
  let n = 0;
  out.push({
    id: "s1",
    type: "income",
    amount: 617000,
    currency: "NPR",
    date: iso(new Date(now_.getFullYear(), now_.getMonth(), now_.getDate() - 7)),
    time: "10:00",
    payment_method: "Bank Transfer",
    description: "Monthly salary",
    categories: { id: "cs", name: "Salary", icon: "briefcase", color: "#2E7D32", type: "expense" },
    bank_accounts: { id: "b1", name: "Nabil Bank", icon: "bank", account_type: "bank" },
  } as unknown as ExpenseRow);
  for (let back = 13; back >= 0; back--) {
    const d = new Date(now_);
    d.setDate(now_.getDate() - back);
    for (let i = 0; i < 2; i++) {
      const cat = CATS[(back + i) % CATS.length];
      out.push({
        id: `r${n++}`,
        type: "expense",
        amount: Math.round(200 + ((back * 7 + i * 13) % 29) * 120),
        currency: "NPR",
        date: iso(d),
        time: `${String(8 + ((back + i) % 12)).padStart(2, "0")}:${String(i * 30).padStart(2, "0")}`,
        payment_method: METHODS[(back + i) % METHODS.length],
        description: `${cat.name} run`,
        categories: { id: `c${cat.name}`, name: cat.name, color: cat.color, type: "expense" },
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
const byCat = new Map<string, { value: number; color: string }>();
for (const r of mockRows) {
  if (r.type !== "expense" || !r.categories) continue;
  const s = byCat.get(r.categories.name) ?? { value: 0, color: r.categories.color };
  s.value += r.amount;
  byCat.set(r.categories.name, s);
}
const slices = Array.from(byCat.entries())
  .map(([label, s]) => ({ label, value: s.value, color: s.color }))
  .sort((a, b) => b.value - a.value);
const spent = mockRows.reduce((s, r) => s + (r.type === "income" ? 0 : r.amount), 0);
const income = mockRows.reduce((s, r) => s + (r.type === "income" ? r.amount : 0), 0);
const spendByDay: Record<string, number> = {};
for (const [k, v] of byDay) spendByDay[k] = v;

/* Overdue bill + upcoming payments (relative to today). */
function relDate(days: number) {
  const d = new Date(now_);
  d.setDate(now_.getDate() + days);
  return iso(d);
}
const mockDue = [
  {
    id: "due1",
    is_active: true,
    next_due_date: relDate(-2),
    amount: 15000,
    currency: "NPR",
    description: "Internet bill",
    categories: { name: "Bills & Utilities", color: "#FBC02D" },
  },
] as unknown as RecurringRuleRow[];
const mockUpcoming = [
  { id: "u1", is_active: true, next_due_date: relDate(4), amount: 120000, currency: "NPR", description: "Room rent", categories: { name: "Rent", color: "#5E7E5B" } },
  { id: "u2", is_active: true, next_due_date: relDate(8), amount: 499, currency: "NPR", description: "Netflix", categories: { name: "Subscriptions", color: "#B3593E" } },
  { id: "u3", is_active: true, next_due_date: relDate(15), amount: 25000, currency: "NPR", description: "Gym membership", categories: { name: "Health", color: "#5B7D9C" } },
] as unknown as RecurringRuleRow[];

const mockAccounts = [
  { id: "a1", name: "Nabil Bank", account_type: "bank", currency: "NPR", current_balance: 186400, initial_balance: 186400, color: "#10B981", account_number_last4: "4821", is_default: true },
  { id: "a2", name: "eSewa", account_type: "wallet", currency: "NPR", current_balance: 12480, initial_balance: 12480, color: "#38BDF8", account_number_last4: null, is_default: false },
  { id: "a3", name: "Cash wallet", account_type: "cash", currency: "NPR", current_balance: 16000, initial_balance: 16000, color: "#F59E0B", account_number_last4: null, is_default: false },
  { id: "a4", name: "Khalti", account_type: "wallet", currency: "NPR", current_balance: 8200, initial_balance: 8200, color: "#8B5CF6", account_number_last4: null, is_default: false },
  { id: "a5", name: "Wise USD", account_type: "bank", currency: "USD", current_balance: 420, initial_balance: 420, color: "#22D3EE", account_number_last4: "7734", is_default: false },
  { id: "a6", name: "Michai savings", account_type: "savings", currency: "NPR", current_balance: 25000, initial_balance: 25000, color: "#A3E635", account_number_last4: null, is_default: false },
] as unknown as BankAccountRow[];
const mockBalances = new Map(
  mockAccounts.map((a) => [a.id, (a as unknown as { current_balance: number }).current_balance]),
);
const mockTotal = 248500;

/* ── Cash-flow chart mocks: 1D / 1W / 1M / Cycle / 1Y / Custom ── */
const cycleFlow: FlowPoint[] = (() => {
  const incBy = new Map<string, number>();
  const expBy = new Map<string, number>();
  for (const r of mockRows) {
    if (r.type === "income") incBy.set(r.date, (incBy.get(r.date) ?? 0) + r.amount);
    else expBy.set(r.date, (expBy.get(r.date) ?? 0) + r.amount);
  }
  const out: FlowPoint[] = [];
  for (let d = new Date(now_.getFullYear(), now_.getMonth(), 1); iso(d) <= iso(now_); d.setDate(d.getDate() + 1)) {
    const key = iso(d);
    out.push({ label: String(d.getDate()), income: incBy.get(key) ?? 0, expense: expBy.get(key) ?? 0 });
  }
  return out;
})();

/* 1D – today by hour (deterministic mock: morning tea, lunch, taxi). */
const hourFlow: FlowPoint[] = (() => {
  const spendAt: Record<number, number> = { 7: 180, 9: 420, 10: 1250, 12: 860, 15: 260 };
  const lastH = Math.max(1, now_.getHours());
  const out: FlowPoint[] = [];
  for (let h = 0; h <= lastH; h++) {
    const hourLabel = new Intl.DateTimeFormat("en", { hour: "numeric", hour12: true })
      .format(new Date(now_.getFullYear(), now_.getMonth(), now_.getDate(), h))
      .replace(/\s/g, "")
      .toLowerCase();
    out.push({ label: hourLabel, income: h === 9 ? 5000 : 0, expense: spendAt[h] ?? 0 });
  }
  return out;
})();

/* 1W / 1M / custom – synthetic daily buckets. */
const dailyFlow = (days: number, labels: (d: Date, i: number) => string): FlowPoint[] => {
  const out: FlowPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now_.getFullYear(), now_.getMonth(), now_.getDate() - i);
    out.push({
      label: labels(d, days - 1 - i),
      income: i === 3 ? 48500 : i === 10 ? 6200 : 0,
      expense: Math.round(400 + 320 * Math.abs(Math.sin(i * 2.7)) + (i % 7 === 5 ? 1900 : 0)),
    });
  }
  return out;
};
const weekFlow = dailyFlow(7, (d) => new Intl.DateTimeFormat("en", { weekday: "short" }).format(d));
const monthBackFlow = dailyFlow(
  Math.round((now_.getTime() - new Date(now_.getFullYear(), now_.getMonth() - 1, 1).getTime()) / 86400000) + 1,
  (d, i) =>
    d.getDate() === 1 || i === 0 ? `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}` : String(d.getDate()),
);
const customFlow = dailyFlow(14, (d, i) =>
  d.getDate() === 1 || i === 0 ? `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}` : String(d.getDate()),
);

/* 1-year buckets: current month real, older months synthetic. */
function monthFlow(months: number): FlowPoint[] {
  const out: FlowPoint[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(now_.getFullYear(), now_.getMonth() - back, 1);
    const label = d.toLocaleString("en", { month: "short" });
    if (back === 0) {
      out.push({
        label,
        income: cycleFlow.reduce((s, p) => s + p.income, 0),
        expense: cycleFlow.reduce((s, p) => s + p.expense, 0),
      });
    } else {
      out.push({
        label,
        income: Math.round(44000 + ((back * 37) % 9) * 900),
        expense: Math.round(29000 + ((back * 53) % 7) * 800),
      });
    }
  }
  return out;
}

export default function PreviewDashPage() {
  // Rail calendar month (mirrors the real page's local view state).
  const [calYm, setCalYm] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [range, setRange] = useState<"1d" | "1w" | "1m" | "cycle" | "1y" | "custom">("cycle");
  const canNextMonth =
    calYm.y * 12 + calYm.m < new Date().getFullYear() * 12 + new Date().getMonth();

  const points =
    range === "1d"
      ? hourFlow
      : range === "1w"
        ? weekFlow
        : range === "1m"
          ? monthBackFlow
          : range === "custom"
            ? customFlow
            : range === "cycle"
              ? cycleFlow
              : monthFlow(12);
  const flowIn = points.reduce((s, p) => s + p.income, 0);
  const flowOut = points.reduce((s, p) => s + p.expense, 0);
  const activeBuckets = points.filter((p) => p.income > 0 || p.expense > 0).length;
  const fmtDay = (d: Date) =>
    new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d);
  const flowWindow =
    range === "1d"
      ? fmtDay(now_)
      : range === "cycle"
        ? cycleLabel
        : range === "1y"
          ? `${points[0]?.label} – ${points[points.length - 1]?.label}`
          : range === "custom"
            ? "Feb 1 – Feb 14"
            : range === "1m"
              ? `${fmtDay(new Date(now_.getFullYear(), now_.getMonth() - 1, 1))} – ${fmtDay(now_)}`
              : `${fmtDay(new Date(now_.getFullYear(), now_.getMonth(), now_.getDate() - 6))} – ${fmtDay(now_)}`;
  const flowDelta = {
    text: range === "1d" ? "-12%" : "+114%",
    positive: range !== "1d",
    label:
      range === "1d"
        ? "vs yesterday"
        : range === "1w"
          ? "vs prev week"
          : range === "1m"
            ? "vs prev month"
            : range === "cycle"
              ? "vs prev cycle"
              : range === "custom"
                ? "vs prev period"
                : "vs prev year",
  };
  const flowInsight =
    range === "1d"
      ? `Avg ${fmt(flowOut / Math.max(1, now_.getHours() + 1))} an hour`
      : `Avg ${fmt(flowOut / points.length)} a day · ${activeBuckets} active days`;
  const todayTotal = byDay.get(iso(new Date())) ?? 850;
  const budget = 900000;
  const net = income - spent;
  const netText = `${net >= 0 ? "+" : "-"}${fmt(Math.abs(net))}`;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1100px]">
        <header className="rise flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-faint">
              {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}
            </p>
            <h1 className="mt-0.5 truncate text-[22px] font-bold tracking-tight text-text sm:text-2xl">
              Good morning, Sam
            </h1>
          </div>
        </header>

        {/* Hero – the cycle statement card */}
        <div className="rise mt-6" style={{ animationDelay: "40ms" }}>
          <BalanceCard
            cycleLabel={cycleLabel}
            net={netText}
            netDelta={
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
                +12,400
                <span className="font-medium text-white/70">vs prev cycle</span>
              </span>
            }
            income={fmt(income).replace(/^[^\d]*/, "")}
            expense={fmt(spent).replace(/^[^\d]*/, "")}
            safe={fmt(Math.max(0, budget - spent)).replace(/^[^\d]*/, "")}
            safeCaption={`${Math.round(pace.spentPct * 100)}% of ${fmt(budget)}`}
            budget={{
              amount: fmt(budget),
              pct: pace.spentPct,
              left: fmt(Math.max(0, budget - spent)),
            }}
          />
        </div>

        <div className="mt-4">
          <TodayRateLine
            live={{ income, expense: spent }}
            frozen={{ income: income - 1200, expense: spent + 800 }}
            fmt={fmt}
          />
        </div>

        <div className="mt-4">
          <BillsDue injected={{ rules: mockDue, overdueDays: [2] }} />
        </div>

        {/* Cash flow + spending calendar */}
        <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
          <DashCard
            title="Cash flow"
            className="flex flex-col lg:col-span-2"
            bodyClassName="flex min-h-0 flex-1 flex-col"
            action={
              <div role="group" aria-label="Cash flow" className="flex items-center rounded-full border border-border bg-surface p-0.5">
                <RangeChip active={range === "1d"} label="1D" onClick={() => setRange("1d")} />
                <RangeChip active={range === "1w"} label="1W" onClick={() => setRange("1w")} />
                <RangeChip active={range === "1m"} label="1M" onClick={() => setRange("1m")} />
                <RangeChip active={range === "cycle"} label="Cycle" onClick={() => setRange("cycle")} />
                <RangeChip active={range === "1y"} label="1Y" onClick={() => setRange("1y")} />
                <button
                  type="button"
                  aria-pressed={range === "custom"}
                  aria-label="Custom range"
                  onClick={() => setRange("custom")}
                  className={`flex h-7 items-center rounded-full px-2 transition-colors ${
                    range === "custom"
                      ? "bg-[var(--sf-primary-light)] text-primary-strong"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  <CalendarDays size={13} aria-hidden />
                </button>
              </div>
            }
          >
            <CashFlowCard
              key={range}
              design="ratio"
              points={points}
              totals={{ income: flowIn, expense: flowOut }}
              delta={flowDelta}
              windowLabel={flowWindow}
              insight={flowInsight}
              format={fmt}
              tickFormat={axisFmt}
              labels={{ income: "Income", expense: "Expense", empty: "No entries in this range yet" }}
            />
          </DashCard>

          <DashCard title="Spending calendar">
            <HeatGrid
              year={calYm.y}
              month={calYm.m}
              spend={spendByDay}
              formatted={fmt}
              locale="en"
              onPrevMonth={() =>
                setCalYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
              }
              onNextMonth={() =>
                setCalYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
              }
              canNextMonth={canNextMonth}
              onDayTap={() => {}}
              totalLabel="Month total"
            />
          </DashCard>
        </div>

        {/* Recent | Upcoming / Accounts | Mix (mix under upcoming) - the 2x2 block */}
        <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-2">
          <DashCard
            title="Recent activity"
            className="lg:col-start-1 lg:row-start-1 lg:row-span-3"
            action={<span className={cardPillClass}>View all</span>}
          >
            <Feed
              rows={mockRows}
              amountFor={(r) => fmt(r.amount)}
              dayNetFor={(grp) => {
                const net = grp.reduce((s, r) => s + (r.type === "income" ? r.amount : -r.amount), 0);
                return {
                  text: `${net >= 0 ? "+" : "−"}${fmt(Math.abs(net)).replace(/^[^\d]*/, "")}`,
                  positive: net >= 0,
                };
              }}
              locale="en"
              onOpen={() => {}}
              max={6}
              labels={{ today: "Today", yesterday: "Yesterday" }}
            />
          </DashCard>

          <DashCard
            title="Upcoming"
            className="self-start lg:col-start-2 lg:row-start-1"
            action={<span className={cardPillClass}>View all</span>}
          >
            <Upcoming injected={{ rules: mockUpcoming }} />
          </DashCard>

          <DashCard
            title="Spending mix"
            className="self-start lg:col-start-2 lg:row-start-3"
            bodyClassName="flex h-full flex-col justify-center"
            action={<span className={cardPillClass}>Analytics</span>}
          >
            <MixCard slices={slices} format={fmt} otherLabel="Other" />
          </DashCard>

          <div className="self-start lg:col-start-2 lg:row-start-2">
            <AccountsStrip
              injected={{ accounts: mockAccounts, balances: mockBalances, total: mockTotal }}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
