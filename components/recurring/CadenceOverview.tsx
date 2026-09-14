"use client";

import { useMemo } from "react";
import { AlertCircle, CalendarClock, Pause, Play, Wallet } from "lucide-react";
import { CategoryDonut, type DonutDatum } from "@/components/charts/CategoryDonut";
import { FitText } from "@/components/ui/FitText";
import type { RecurringRuleRow, RuleOccurrence } from "@/services/recurring";
import { monthlyNormalized, ruleIsDue } from "@/services/recurring";

interface CadenceOverviewProps {
  rules: RecurringRuleRow[];
  occurrences: RuleOccurrence[];
  formatted: (n: number) => string;
  locale: string;
  labels: {
    commitment: string;
    yearly: string;
    active: string;
    paused: string;
    dueNow: string;
    mix: string;
    perMonth: string;
    noPlans: string;
    manage: string;
    weeklyApprox: string;
    dailyApprox: string;
  };
}

/**
 * Cadence overview — monthly commitment headline (FitText), four stat cells
 * and a mix donut that breaks the committed amount down by plan category
 * (normalized to a monthly figure across daily/weekly/custom cadences).
 */
export function CadenceOverview({ rules, occurrences, formatted, locale, labels }: CadenceOverviewProps) {
  const { monthlyTotal, activeCount, pausedCount, dueCount, slices } = useMemo(() => {
    let monthlyTotal = 0;
    let activeCount = 0;
    let dueCount = 0;
    const byCat = new Map<string, DonutDatum>();
    for (const r of rules) {
      if (!r.is_active) continue;
      const monthly = monthlyNormalized(r);
      monthlyTotal += monthly;
      activeCount += 1;
      if (ruleIsDue(r, occurrences)) dueCount += 1;
      const name = r.categories?.name ?? "Other";
      const existing = byCat.get(name);
      if (existing) existing.value += monthly;
      else
        byCat.set(name, {
          label: name,
          value: monthly,
          color: r.categories?.color ?? "#8B978F",
          icon: r.categories?.icon,
        });
    }
    return {
      monthlyTotal,
      activeCount,
      pausedCount: rules.length - activeCount,
      dueCount,
      slices: Array.from(byCat.values()).sort((a, b) => b.value - a.value),
    };
  }, [rules, occurrences]);

  const cells = [
    {
      key: "active",
      label: labels.active,
      value: String(activeCount),
      icon: <Play size={14} />,
      tone: "text-income",
      chip: "bg-income/10 text-income",
    },
    {
      key: "paused",
      label: labels.paused,
      value: String(pausedCount),
      icon: <Pause size={14} />,
      tone: "text-text-muted",
      chip: "bg-surface-elevated text-text-muted",
    },
    {
      key: "due",
      label: labels.dueNow,
      value: String(dueCount),
      icon: <AlertCircle size={14} />,
      tone: dueCount > 0 ? "text-danger" : "text-text",
      chip: dueCount > 0 ? "bg-rust-tint text-danger" : "bg-surface-elevated text-text-muted",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Commitment account */}
      <section className="panel flex flex-col p-4 sm:p-5" aria-label={labels.commitment}>
        <div className="flex items-center justify-between gap-2">
          <p className="caps">{labels.commitment}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet size={15} />
          </span>
        </div>
        <div className="figures mt-2 font-bold text-text">
          <FitText basePx={34} minPx={18}>{formatted(monthlyTotal)}</FitText>
        </div>
        <p className="mt-0.5 text-[11px] text-faint">
          {labels.perMonth} · ≈ {formatted(monthlyTotal * 12)} {labels.yearly}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {cells.map((c) => (
            <div key={c.key} className="rounded-xl border border-border bg-surface-elevated/40 p-2.5 sm:p-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.chip}`}>{c.icon}</span>
              <p className={`figures mt-2 text-xl font-bold leading-none ${c.tone}`}>{c.value}</p>
              <p className="caps-faint mt-1 truncate !text-[9px] sm:!text-[10px]">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Break-even reference rates keep the card anchored beside the taller
            mix card instead of trailing into blank space. */}
        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border/70 pt-3">
          <div>
            <p className="caps-faint">{labels.weeklyApprox}</p>
            <p className="numeric mt-0.5 text-sm font-bold text-text">{formatted(monthlyTotal / 4.33)}</p>
          </div>
          <div className="text-right">
            <p className="caps-faint">{labels.dailyApprox}</p>
            <p className="numeric mt-0.5 text-sm font-bold text-text">{formatted(monthlyTotal / 30)}</p>
          </div>
        </div>
      </section>

      {/* Commitment mix */}
      <section className="panel p-4 sm:p-5" aria-label={labels.mix}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="caps">{labels.mix}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass-tint text-brass">
            <CalendarClock size={15} />
          </span>
        </div>
        {slices.length > 0 ? (
          <CategoryDonut
            slices={slices}
            centerValue={formatted(monthlyTotal)}
            centerLabel={labels.commitment}
            formatValue={formatted}
            size={150}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-text-muted">{labels.noPlans}</p>
          </div>
        )}
      </section>
    </div>
  );
}
