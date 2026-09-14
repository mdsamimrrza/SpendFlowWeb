"use client";

import { Flame, PiggyBank, Wallet } from "lucide-react";
import { FitText } from "@/components/ui/FitText";
import { ProgressRing } from "@/components/charts/ProgressRing";

interface BudgetPanelProps {
  budget: number | null;
  spent: number;
  income: number;
  pace: {
    daysTotal: number;
    daysElapsed: number;
    spentPct: number;
    expectedPct: number | null;
    projected: number | null;
    onPace: boolean | null;
  };
  formatted: (n: number) => string;
  cycleLabel: string;
  labels: {
    budgetOnFile: string;
    spent: string;
    remaining: string;
    overBy: string;
    projectedClose: string;
    dailyAllowance: string;
    savingsRate: string;
    noBudgetTitle: string;
    noBudgetBody: string;
    setBudget: string;
    day: string;
    of: string;
  };
  /** Link href for the set-budget CTA. */
  budgetHref?: string;
  /** Optional ReactNode rendered as the set-budget action (e.g. a Next <Link>). */
  action?: React.ReactNode;
}

/**
 * Budget account card: remaining figure as the headline, a segmented pace
 * meter (spent fill + calendar tick + allowance line), and ledger rows for
 * projected close / daily allowance / savings rate. Empty state invites the
 * user to file a budget instead of showing a void.
 */
export function BudgetPanel({
  budget,
  spent,
  income,
  pace,
  formatted,
  cycleLabel,
  labels,
  budgetHref = "/profit-loss",
  action,
}: BudgetPanelProps) {
  if (budget == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brass-tint text-brass">
          <Wallet size={22} />
        </span>
        <div>
          <p className="text-sm font-bold text-text">{labels.noBudgetTitle}</p>
          <p className="mt-1 text-xs text-text-muted">{labels.noBudgetBody}</p>
        </div>
        {action ?? (
          <a
            href={budgetHref}
            className="mt-1 flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:bg-primary-strong"
          >
            {labels.setBudget}
          </a>
        )}
      </div>
    );
  }

  const over = spent > budget;
  const remaining = budget - spent;
  const spentPctClamped = Math.min(pace.spentPct * 100, 100);
  const dailyAllowance =
    pace.daysTotal - pace.daysElapsed > 0 ? Math.max(remaining, 0) / (pace.daysTotal - pace.daysElapsed) : 0;
  const savingsRate = income > 0 ? Math.max(0, Math.round(((income - spent) / income) * 100)) : null;

  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      {/* Headline: usage ring + remaining/over figure side by side — the ring
          gives the column visual weight next to the tall flow chart. */}
      <div className="flex items-center gap-4">
        <ProgressRing
          pct={Math.min(pace.spentPct, 1)}
          size={84}
          strokeWidth={8}
          color={over ? "var(--sf-danger)" : "var(--sf-primary)"}
          ariaLabel={`${Math.round(pace.spentPct * 100)}% of budget spent`}
        >
          <span className="numeric text-base font-extrabold text-text">
            {Math.round(pace.spentPct * 100)}%
          </span>
          <span className="caps-faint !text-[9px]">{labels.spent}</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="caps">{over ? labels.overBy : labels.remaining}</p>
          <div className={`figures mt-1 font-bold ${over ? "text-danger" : "text-text"}`}>
            <FitText basePx={28} minPx={16}>{formatted(Math.abs(remaining))}</FitText>
          </div>
          <p className="mt-0.5 text-[11px] text-faint">
            {labels.of} {formatted(budget)} · {cycleLabel}
          </p>
        </div>
      </div>

      {/* Segmented pace meter */}
      <div className="mt-4">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={`h-full rounded-full transition-all duration-500 ${over ? "bg-danger" : "bg-primary"}`}
            style={{ width: `${spentPctClamped}%` }}
          />
          {pace.expectedPct != null && (
            <div
              className="absolute top-0 h-full w-[2px] bg-text"
              style={{ left: `${Math.min(pace.expectedPct * 100, 100)}%` }}
              aria-hidden
              title="calendar pace"
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold text-faint">
          <span className="numeric">{Math.round(pace.spentPct * 100)}% · {labels.spent}</span>
          <span className="numeric">
            {labels.day} {pace.daysElapsed}/{pace.daysTotal}
          </span>
        </div>
      </div>

      {/* Ledger rows — flex-1 + even spacing lets the panel fill a taller
          grid row (next to the flow chart) without a dead block at the end. */}
      <div className="mt-4 flex flex-1 flex-col justify-evenly border-t border-border">
        <MeterRow
          icon={<Flame size={14} className={pace.onPace === false ? "text-danger" : "text-primary"} />}
          label={labels.projectedClose}
          value={pace.projected != null ? formatted(pace.projected) : "—"}
          valueClass={pace.onPace === false ? "text-danger" : "text-income"}
        />
        <MeterRow
          icon={<Wallet size={14} className="text-brass" />}
          label={labels.dailyAllowance}
          value={formatted(dailyAllowance)}
          valueClass="text-text"
        />
        {savingsRate != null && (
          <MeterRow
            icon={<PiggyBank size={14} className="text-income" />}
            label={labels.savingsRate}
            value={`${savingsRate}%`}
            valueClass={savingsRate >= 20 ? "text-income" : savingsRate > 0 ? "text-brass" : "text-danger"}
          />
        )}
      </div>

      {/* Footer keeps the card visually anchored when a sibling column is taller. */}
      <p className="stamp mt-auto pt-4">{cycleLabel}</p>
    </div>
  );
}

function MeterRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-0">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
          {icon}
        </span>
        <span className="truncate text-sm text-text-muted">{label}</span>
      </span>
      <span className={`numeric shrink-0 text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}
