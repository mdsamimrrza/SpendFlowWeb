"use client";

import { useMemo, useState } from "react";

export interface MonthlyBarPoint {
  /** Short month label rendered under the pair (parent formats per locale). */
  label: string;
  income: number;
  expense: number;
  isCurrent?: boolean;
}

interface MonthlyBarsProps {
  months: MonthlyBarPoint[];
  /** Privacy-masked money formatter from the host screen. */
  formatted: (n: number) => string;
  /** Compact axis formatter (15.5K) for the faint y-gridline labels. */
  compact: (n: number) => string;
}

/* Round gridline step: 1 / 2 / 2.5 / 5 x 10^n covering max/4. */
function niceStep(x: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(x)));
  const frac = x / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Month-over-month comparison columns (Monarch Reports pattern): two bars
 * per month (income emerald, expense series red) on a labeled month axis,
 * faint y-gridlines, hairline baseline, current month highlighted. Tap a
 * column pins the IN/OUT readout in the HUD slot above the chart.
 */
export function MonthlyBars({ months, formatted, compact }: MonthlyBarsProps) {
  // Default the HUD readout to the latest (current) month.
  const [sel, setSel] = useState<number | null>(months.length - 1);

  const model = useMemo(() => {
    const max = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
    // Nice-step scale: 4 gridline divisions at round values, headroom above
    // the tallest bar (e.g. max 79,700 -> step 20,000 -> scale 80,000).
    const step = niceStep(max / 4);
    return { scale: step * 4, grid: [1, 2, 3, 4].map((i) => step * i) };
  }, [months]);

  if (months.length === 0) {
    return (
      <div className="flex h-[190px] items-center justify-center border border-dashed border-border">
        <span className="caps">No monthly data yet</span>
      </div>
    );
  }

  const selMonth = sel != null ? months[sel] : null;

  return (
    <div>
      {/* HUD readout: pinned (tap) or default current-month figures */}
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-x-3 text-[11.5px] font-bold">
        {selMonth ? (
          <>
            <span className="caps-faint !text-[11px]">{selMonth.label}</span>
            <span className="numeric text-income">IN {formatted(selMonth.income)}</span>
            <span className="numeric" style={{ color: "var(--sf-expense-series)" }}>
              OUT {formatted(selMonth.expense)}
            </span>
            <span className={`numeric ${selMonth.income - selMonth.expense >= 0 ? "text-income" : "text-danger"}`}>
              NET {selMonth.income - selMonth.expense >= 0 ? "+" : "−"}
              {formatted(Math.abs(selMonth.income - selMonth.expense))}
            </span>
          </>
        ) : (
          <span className="caps-faint !text-[11px]">&nbsp;</span>
        )}
      </div>

      <div className="relative" style={{ height: 170 }}>
        {/* Faint y-gridlines + compact labels */}
        {model.grid.map((v) => (
          <div
            key={v}
            aria-hidden
            className="absolute left-0 right-0 border-t border-dashed"
            style={{ bottom: `${(v / model.scale) * 100}%`, borderColor: "var(--sf-border)", opacity: 0.7 }}
          >
            <span className="numeric absolute -top-2 left-0 bg-[var(--sf-surface)] pr-1 text-[9px] leading-4 text-faint">
              {compact(v)}
            </span>
          </div>
        ))}
        {/* Hairline baseline */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 border-t" style={{ borderColor: "var(--sf-border)" }} />

        {/* Columns */}
        <div className="absolute inset-0 flex items-end justify-between gap-1 pl-9 sm:gap-2">
          {months.map((m, i) => {
            const iH = m.income > 0 ? Math.max((m.income / model.scale) * 100, 2) : 0;
            const eH = m.expense > 0 ? Math.max((m.expense / model.scale) * 100, 2) : 0;
            const pinned = sel === i;
            return (
              <button
                key={m.label + String(i)}
                type="button"
                onClick={() => setSel((cur) => (cur === i ? null : i))}
                title={`${m.label} · IN ${formatted(m.income)} · OUT ${formatted(m.expense)}`}
                aria-label={`${m.label}: income ${formatted(m.income)}, expense ${formatted(m.expense)}`}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-md pb-0 transition-colors"
                style={{ backgroundColor: pinned ? "var(--sf-surface-elevated)" : "transparent" }}
              >
                <span className="flex h-full w-full items-end justify-center gap-[3px] px-0.5">
                  <span
                    className="w-[42%] max-w-[13px] rounded-t bg-income transition-all duration-500 group-hover:opacity-80"
                    style={{ height: `${iH}%` }}
                  />
                  <span
                    className="w-[42%] max-w-[13px] rounded-t transition-all duration-500 group-hover:opacity-80"
                    style={{ height: `${eH}%`, backgroundColor: "var(--sf-expense-series)" }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Month axis - current month highlighted */}
      <div className="mt-1.5 flex justify-between gap-1 pl-9 sm:gap-2">
        {months.map((m, i) => (
          <span
            key={m.label + String(i)}
            className={`min-w-0 flex-1 truncate text-center text-[10px] ${
              m.isCurrent ? "font-extrabold text-text" : "text-faint"
            }`}
          >
            {m.label.toUpperCase()}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-wide">
        <span className="flex items-center gap-1.5 text-income">
          <span className="h-2 w-2 rounded-sm bg-income" aria-hidden /> Income
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--sf-expense-series)" }}>
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--sf-expense-series)" }} aria-hidden /> Expense
        </span>
      </div>
    </div>
  );
}
