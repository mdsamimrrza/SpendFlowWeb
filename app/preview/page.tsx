"use client";

import { CashFlowHero } from "@/components/dashboard/CashFlowHero";
import { FlowSummaryBar } from "@/components/dashboard/FlowSummaryBar";
import { CategoryBars, type CategorySlice } from "@/components/charts/CategoryBars";
import { FlowChartCard } from "@/components/charts/FlowChartCard";
import { SectionTitle } from "@/components/ui/Card";
import { ExpenseRowItem } from "@/components/expense/ExpenseRowItem";
import type { ExpenseRow } from "@/services/expenses";

/**
 * Static design preview (mock data, no auth, no network) — used to iterate on
 * the dashboard's visual design without a signed-in account.
 */
const fmt = (n: number) => `NPR ${new Intl.NumberFormat("en-US").format(n)}`;

const pace = {
  daysTotal: 30,
  daysElapsed: 19,
  spentPct: 0.63,
  expectedPct: 0.633,
  projected: 91500,
  onPace: false,
};

const slices: CategorySlice[] = [
  { label: "Food & Dining", value: 18400, color: "#EF6C00" },
  { label: "Rent", value: 15000, color: "#8D6E63" },
  { label: "Transport", value: 6200, color: "#0277BD" },
  { label: "Shopping", value: 4800, color: "#BA68C8" },
  { label: "Bills & Utilities", value: 3500, color: "#FBC02D" },
];

const rows = [
  {
    id: "1",
    type: "expense" as const,
    amount: 850,
    currency: "NPR",
    date: "2026-09-12",
    time: "09:12",
    payment_method: "Cash" as const,
    description: "Morning coffee",
    categories: { id: "c1", name: "Food & Dining", icon: "🍔", color: "#EF6C00", type: "expense" },
  },
  {
    id: "2",
    type: "expense" as const,
    amount: 12500,
    currency: "NPR",
    date: "2026-09-11",
    time: "18:40",
    payment_method: "Card" as const,
    description: "Weekly groceries",
    categories: { id: "c2", name: "Groceries", icon: "🛒", color: "#2E7D32", type: "expense" },
  },
  {
    id: "3",
    type: "income" as const,
    amount: 55000,
    currency: "NPR",
    date: "2026-09-10",
    time: "10:00",
    payment_method: "Other" as const,
    description: "September salary",
    categories: { id: "c3", name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
  },
];

// Mock rows only carry display fields; cast to the row shape ExpenseItem reads.
const mockRows = rows as unknown as ExpenseRow[];

export default function PreviewPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">Design preview</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            Financial dashboard — mock data
          </h1>
        </div>
        <span className="border border-brass px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-brass">
          /preview
        </span>
      </header>

      <CashFlowHero
        net={7850}
        income={95000}
        expense={87150}
        todayTotal={850}
        budget={90000}
        pace={pace}
        formatted={fmt}
        cycleLabel="Aug 28 – Sep 27"
        todayLabel="Today"
        delta={{ text: "+2,140", positive: true }}
        entries={3}
        statementNo="2026-08"
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FlowChartCard label="Cash flow — try the ranges" />
        </div>
        <section className="sf-card flex flex-col p-5">
          <SectionTitle>Monthly Budget</SectionTitle>
          <BudgetDetailMock />
        </section>
      </div>

      {/* History redesign mock */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-extrabold text-text">History page — components</h2>
        <FlowSummaryBar
          income={95000}
          expense={87150}
          formatted={fmt}
          netLabel="Cash Flow"
          peak={{ label: "Weekly groceries", value: fmt(12500) }}
          entriesLabel="Inflow"
        />
        <div className="sf-card mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-faint">
                  <th className="px-5 py-2.5">Transaction</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                  <th className="w-10 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {mockRows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 transition last:border-0 hover:bg-surface-elevated/40">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-7 w-1 shrink-0"
                          style={{ backgroundColor: r.categories?.color ?? "#8B978F" }}
                        />
                        <span className="max-w-[280px] truncate font-semibold text-text">{r.description}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-text-muted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.categories?.color }} />
                        {r.categories?.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                        {r.payment_method}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">Sep 12, 26</td>
                    <td className={`numeric px-5 py-2.5 text-right font-extrabold ${r.type === "income" ? "text-income" : "text-text"}`}>
                      {r.type === "income" ? "+" : "−"}
                      {fmt(r.amount)}
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel">
          <div className="panel-rule flex items-center justify-between px-5 py-2.5">
            <span className="caps">Spending by category</span>
          </div>
          <div className="p-5">
            <CategoryBars slices={slices} totalValue={fmt(47900)} totalLabel="Spent" formatValue={fmt} />
          </div>
        </section>
        <section className="panel lg:col-span-2">
          <div className="panel-rule flex items-center justify-between px-5 py-2.5">
            <span className="caps">Recent Activity</span>
          </div>
          <div className="p-5">
            {mockRows.map((r) => (
              <ExpenseRowItem
                key={r.id}
                row={r}
                amount={fmt(r.amount)}
                note={[r.categories?.name, r.payment_method, r.date].filter(Boolean).join(" · ")}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function BudgetDetailMock() {
  return (
    <div className="flex flex-1 flex-col">
      <p className="numeric text-3xl font-extrabold text-text">{fmt(90000)}</p>
      <p className="mt-0.5 text-xs text-text-muted">budget · Aug 28 – Sep 27</p>
      <div className="mt-4 space-y-2 text-sm">
        <MockRow label="Spent" value={fmt(87150)} cls="text-danger" />
        <MockRow label="Remaining" value={fmt(2850)} cls="text-income" />
        <MockRow label="Projected close" value={fmt(91500)} cls="text-danger" />
      </div>
      <div className="mt-4">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-danger" style={{ width: "63%" }} />
        </div>
        <div className="mt-[-14px] h-3.5 w-0.5 rounded bg-text" style={{ marginLeft: "63%" }} aria-hidden />
        <p className="mt-2 text-[11px] text-faint">
          Day 19 of 30 · spending ahead of the calendar
        </p>
      </div>
    </div>
  );
}

function MockRow({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`numeric font-bold ${cls}`}>{value}</span>
    </div>
  );
}
