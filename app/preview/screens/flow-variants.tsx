"use client";

import { CalendarDays } from "lucide-react";
import { DashCard, RangeChip } from "@/components/dash/primitives";
import { CashFlowCard } from "@/components/dash/CashFlowCard";
import type { FlowPoint } from "@/components/graphs/FlowChart";

/**
 * Design-review gallery for the cash-flow CARD: the CashFlowCard
 * presentations across the standard ranges (1D/1W/1M/Cycle/1Y/Custom) on
 * realistic mock data. Mock-data only, no auth, no network – shot by
 * scripts/shot-preview.mjs as "flow-variants".
 */

const fmt = (n: number) =>
  `NPR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
const axisFmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

const LABELS = { income: "Income", expense: "Expense", empty: "No entries" };
const NOW = new Date();

/* 24 days into a billing cycle: salary on day 1, rent on day 2, freelance
   top-up on day 12, everyday spending between – one outlier purchase. */
const DAY_VALUES: Array<[number, number]> = [
  [48500, 0], //  1 salary
  [0, 12500], //  2 rent
  [0, 860], //   3
  [0, 340], //   4
  [0, 1290], //  5
  [0, 220], //   6
  [0, 2450], //  7 weekend
  [0, 780], //   8
  [0, 152], //   9
  [0, 940], //  10
  [0, 430], //  11
  [6200, 1100], // 12 freelance
  [0, 2600], // 13
  [0, 185], //  14
  [0, 4200], // 15 phone
  [0, 610], //  16
  [0, 240], //  17
  [0, 1350], // 18
  [0, 95], //   19
  [0, 1780], // 20
  [0, 520], //  21
  [0, 305], //  22
  [0, 2210], // 23
  [0, 460], //  24
];

const cycleFlow: FlowPoint[] = DAY_VALUES.map(([income, expense], i) => ({
  label: String(i + 1),
  income,
  expense,
}));

const hourFlow: FlowPoint[] = (() => {
  const spendAt: Record<number, number> = { 7: 180, 9: 420, 10: 1250, 12: 860, 15: 260 };
  const lastH = 23; // fixed full-day mock so the gallery demos at any hour
  const out: FlowPoint[] = [];
  for (let h = 0; h <= lastH; h++) {
    const label = new Intl.DateTimeFormat("en", { hour: "numeric", hour12: true })
      .format(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), h))
      .replace(/\s/g, "")
      .toLowerCase();
    out.push({ label, income: h === 9 ? 5000 : 0, expense: spendAt[h] ?? 0 });
  }
  return out;
})();

const dailyFlow = (days: number, labels: (d: Date, i: number) => string): FlowPoint[] => {
  const out: FlowPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
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
  Math.round((NOW.getTime() - new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1).getTime()) / 86400000) + 1,
  (d, i) =>
    d.getDate() === 1 || i === 0 ? `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}` : String(d.getDate()),
);

const monthFlow: FlowPoint[] = [
  ["Nov", 44000, 28400],
  ["Dec", 51000, 33600],
  ["Jan", 46500, 29800],
  ["Feb", 52400, 35200],
  ["Mar", 48500, 31200],
  ["Apr", 51000, 27900],
  ["May", 49800, 30400],
  ["Jun", 47200, 29600],
  ["Jul", 53600, 32100],
  ["Aug", 48900, 28800],
  ["Sep", 50700, 31500],
  ["Oct", 48500, 22400],
].map(([label, income, expense]) => ({
  label: label as string,
  income: income as number,
  expense: expense as number,
}));

const sum = (pts: FlowPoint[], k: "income" | "expense") => pts.reduce((s, p) => s + p[k], 0);

function Card({
  title,
  design,
  points,
  windowLabel,
  insight,
  activeChip,
}: {
  title: string;
  design: "ratio" | "strip";
  points: FlowPoint[];
  windowLabel: string;
  insight: string;
  activeChip: string;
}) {
  const delta = { text: "+33%", positive: true, label: "vs prev period" };
  return (
    <DashCard
      title={title}
      className="flex flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      action={
        <div
          role="group"
          aria-label={title}
          className="flex items-center rounded-full border border-border bg-surface p-0.5"
        >
          {["1D", "1W", "1M", "Cycle", "1Y"].map((chip) => (
            <RangeChip key={chip} active={chip === activeChip} label={chip} onClick={() => {}} />
          ))}
          <button
            type="button"
            aria-label="Custom range"
            className={`flex h-7 items-center rounded-full px-2 ${
              activeChip === "custom"
                ? "bg-[var(--sf-primary-light)] text-primary-strong"
                : "text-text-muted"
            }`}
          >
            <CalendarDays size={13} aria-hidden />
          </button>
        </div>
      }
    >
      <CashFlowCard
        design={design}
        points={points}
        totals={{ income: sum(points, "income"), expense: sum(points, "expense") }}
        delta={delta}
        windowLabel={windowLabel}
        insight={insight}
        format={fmt}
        tickFormat={axisFmt}
        labels={LABELS}
      />
    </DashCard>
  );
}

export default function FlowVariants() {
  const dayName = (d: Date) => new Intl.DateTimeFormat("en", { weekday: "short" }).format(d);
  return (
    <main className="min-h-screen bg-background px-3 py-4 sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-3 sm:gap-4">
        <p className="px-1 text-[13px] font-medium text-text-muted">
          Cash-flow card – two lines, standard ranges
        </p>
        <Card
          title="1D · today"
          design="ratio"
          points={hourFlow}
          windowLabel={new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(NOW)}
          insight="Avg NPR 124 an hour"
          activeChip="1D"
        />
        <Card
          title="1W · last 7 days"
          design="ratio"
          points={weekFlow}
          windowLabel={`${dayName(new Date(NOW.getTime() - 6 * 86400000))} – ${dayName(NOW)}`}
          insight="Avg NPR 1,864 a day · 7 active days"
          activeChip="1W"
        />
        <Card
          title="1M · this + last month"
          design="strip"
          points={monthBackFlow}
          windowLabel="Sep 1 – Oct 15"
          insight="Avg NPR 1,742 a day · 45 active days"
          activeChip="1M"
        />
        <Card
          title="Cycle"
          design="ratio"
          points={cycleFlow}
          windowLabel="1 Oct – 14 Oct"
          insight="Avg NPR 1,446 a day · 24 active days"
          activeChip="Cycle"
        />
        <Card
          title="1Y · 12 months"
          design="ratio"
          points={monthFlow}
          windowLabel="Nov – Oct"
          insight="Avg 49,341 in · 30,075 out a month"
          activeChip="1Y"
        />
      </div>
    </main>
  );
}
