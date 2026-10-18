"use client";

import { FitText } from "@/components/ui/FitText";
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import { Spark } from "@/components/graphs/Spark";
import { DeltaChip } from "./primitives";

/**
 * The cycle summary – purely typographic, on the page background. The net
 * figure anchors the page; the cumulative-net sparkline (accent ink) and
 * the signed income/expense/today strip sit beneath a hairline. No card,
 * no dark slab – the panel rhythm starts with the accounts band below.
 */
export function PulseHero({
  net,
  income,
  expense,
  todayTotal,
  spark,
  cycleLabel,
  delta,
  formatted,
  labels,
  frozen,
}: {
  net: number;
  income: number;
  expense: number;
  todayTotal: number;
  spark: number[];
  cycleLabel: string;
  delta: { text: string; positive: boolean } | null;
  formatted: (n: number) => string;
  labels: { cycle: string; net: string; income: string; expense: string; today: string };
  frozen?: { income: number; expense: number };
}) {
  const netText = `${net >= 0 ? "+" : "−"}${formatted(Math.abs(net))}`;
  return (
    <section className="rise" aria-label={labels.net}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-faint">
          {labels.cycle}
          <span aria-hidden className="mx-1.5">
            ·
          </span>
          <span className="numeric">{cycleLabel}</span>
        </p>
        {delta && <DeltaChip text={delta.text} positive={delta.positive} />}
      </div>

      <FitText basePx={52} minPx={28} className="mt-2 max-w-full">
        <span className="figures-display text-[52px] leading-none text-text sm:text-[64px]">
          {netText}
        </span>
      </FitText>

      {spark.length >= 2 && <Spark values={spark} height={52} className="mt-4 w-full" />}

      <div className="mt-5 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
        <HeroStat label={labels.income} value={formatted(income)} color="var(--sf-income)" first />
        <HeroStat label={labels.expense} value={formatted(expense)} color="var(--sf-danger)" />
        <HeroStat label={labels.today} value={formatted(todayTotal)} color="var(--sf-text)" />
      </div>

      {frozen && (
        <div className="mt-4">
          <TodayRateLine live={{ income, expense }} frozen={frozen} fmt={formatted} />
        </div>
      )}
    </section>
  );
}

function HeroStat({
  label,
  value,
  color,
  first,
}: {
  label: string;
  value: string;
  color: string;
  first?: boolean;
}) {
  return (
    <div className={first ? "pr-3" : "px-3"}>
      <p className="truncate text-[10.5px] font-medium text-faint">{label}</p>
      <p className="numeric mt-1 truncate text-[13.5px]" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
