"use client";

export interface CategorySlice {
  label: string;
  value: number;
  color: string;
}

interface CategoryBarsProps {
  slices: CategorySlice[];
  totalLabel?: string;
  totalValue?: string;
  /** Formatter for per-row absolute values. */
  formatValue?: (n: number) => string;
}

/**
 * Ledger spending breakdown: ranked horizontal rules with color keys and
 * figures — the statement alternative to a pie chart.
 */
export function CategoryBars({ slices, totalLabel, totalValue, formatValue }: CategoryBarsProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const max = Math.max(...slices.map((s) => s.value), 1);

  return (
    <div>
      {(totalValue || totalLabel) && (
        <div className="panel-rule mb-4 flex items-baseline justify-between gap-3 pb-3">
          {totalValue && <p className="figures min-w-0 break-all text-2xl font-bold text-text">{totalValue}</p>}
          {totalLabel && <p className="caps whitespace-nowrap">{totalLabel}</p>}
        </div>
      )}
      <ul>
        {slices.slice(0, 7).map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label} className="border-b border-border/60 py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-sm font-semibold text-text">{s.label}</span>
                </span>
                <span className="shrink-0 text-right">
                  {formatValue && (
                    <span className="numeric mr-2 text-sm font-bold text-text">{formatValue(s.value)}</span>
                  )}
                  <span className="numeric text-sm text-faint">{pct}%</span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1 flex-1 bg-surface-elevated">
                  <div
                    className="h-full"
                    style={{ width: `${Math.round((s.value / max) * 100)}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
