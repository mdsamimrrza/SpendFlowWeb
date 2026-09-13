"use client";

import { AlertTriangle } from "lucide-react";

interface BudgetHeroCardProps {
  budget: number | null;
  spent: number;
  todayTotal: number;
  formatted: (n: number) => string;
  cycleLabel: string;
}

/**
 * Budget hero (mobile BudgetLimitHeroCard, condensed): gauge bar, spent /
 * remaining, today's spend. Budget is display-converted only — never rewritten
 * (docs/SYNC-STRATEGY.md §6).
 */
export function BudgetHeroCard({ budget, spent, todayTotal, formatted, cycleLabel }: BudgetHeroCardProps) {
  const ratio = budget && budget > 0 ? Math.min(spent / budget, 1.2) : 0;
  const over = budget != null && spent > budget;
  const remaining = budget != null ? budget - spent : null;

  return (
    <section className="sf-card relative overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-brass-tint blur-2xl"
      />
      <div className="relative flex items-center justify-between">
        <p className="text-[13px] font-bold uppercase tracking-wide text-text-muted">
          {cycleLabel}
        </p>
        <div className="flex items-center gap-2">
          {budget != null && budget > 0 && (
            <span className="numeric rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-bold text-text-muted">
              {Math.round((spent / budget) * 100)}%
            </span>
          )}
          {over && (
            <span className="flex items-center gap-1 rounded-full bg-rust-tint px-2 py-0.5 text-[11px] font-bold text-rust">
              <AlertTriangle size={12} /> Over budget
            </span>
          )}
        </div>
      </div>

      <p className="numeric relative mt-2 text-[34px] font-extrabold leading-[1.1] text-text" style={{ minHeight: "38px" }}>
        {formatted(spent)}
        {budget != null && (
          <span className="ml-2 text-base font-bold text-faint">
            / {formatted(budget)}
          </span>
        )}
      </p>

      {budget != null && remaining != null && (
        <p className="relative mt-0.5 text-sm text-text-muted">
          {remaining >= 0 ? "Remaining" : "Over by"}{" "}
          <span className={`numeric font-bold ${remaining >= 0 ? "text-income" : "text-danger"}`}>
            {formatted(Math.abs(remaining))}
          </span>
        </p>
      )}

      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-danger" : "bg-primary"}`}
          style={{ width: `${Math.round(Math.min(ratio, 1) * 100)}%` }}
        />
      </div>

      <p className="relative mt-3 text-xs text-text-muted">
        Today: <span className="numeric font-bold text-text">{formatted(todayTotal)}</span>
      </p>
    </section>
  );
}
