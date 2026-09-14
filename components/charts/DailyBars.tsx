"use client";

import { useState } from "react";

export interface DailyBarDatum {
  label: string;
  value: number;
  /** Override the fill for this bar (e.g. category color, income green). */
  color?: string;
  sub?: string;
}

interface DailyBarsProps {
  bars: DailyBarDatum[];
  formatValue?: (n: number) => string;
  /** Bar color; defaults to the theme expense-series variable. */
  color?: string;
  /** Baseline overlay value (e.g. ideal daily budget) drawn as a dashed rule. */
  baseline?: number | null;
  baselineLabel?: string;
  height?: number;
  /** Every-nth x label to show (density control on phones). */
  labelEvery?: number;
  onBarTap?: (bar: DailyBarDatum, index: number) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Vertical daily-bars chart with tap-to-read. Bars fill from the bottom;
 * the selected bar dims its siblings and the readout line above swaps to the
 * tapped day. Dashed baseline rule supports budget-pace comparisons.
 */
export function DailyBars({
  bars,
  formatValue,
  color = "var(--sf-expense-series)",
  baseline = null,
  baselineLabel,
  height = 120,
  labelEvery,
  onBarTap,
  className = "",
  ariaLabel = "Daily activity",
}: DailyBarsProps) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.value), baseline ?? 0, 1);
  const every = labelEvery ?? Math.ceil(bars.length / 7);
  const readout = sel != null ? bars[sel] : null;

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center border border-dashed border-border text-center"
        style={{ height }}
      >
        <span className="caps">No activity in this window</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div aria-live="polite" className="flex min-h-5 items-baseline gap-2">
        {readout ? (
          <>
            <span className="text-[11px] font-bold text-text">{readout.label}</span>
            <span className="numeric text-[11px] text-text-muted">
              {formatValue ? formatValue(readout.value) : readout.value}
              {readout.sub ? <span className="ml-1.5 text-faint">{readout.sub}</span> : null}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-faint">
            {onBarTap ? "Tap a bar for details" : `${bars.length} days`}
          </span>
        )}
      </div>

      <div className="relative mt-1" style={{ height }}>
        {baseline != null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-text-muted/60"
            style={{ bottom: `${Math.min((baseline / max) * 100, 100)}%` }}
            aria-hidden
          >
            {baselineLabel && (
              <span className="absolute -top-4 left-0 rounded-sm bg-surface px-1 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                {baselineLabel}
              </span>
            )}
          </div>
        )}
        <div
          className="flex h-full items-end gap-px"
          role="img"
          aria-label={ariaLabel}
        >
          {bars.map((b, i) => {
            const h = Math.max((b.value / max) * 100, b.value > 0 ? 3 : 0.6);
            const active = sel === i;
            const inner = (
              <>
                <div
                  className="w-full rounded-t-[3px] transition-all duration-300"
                  style={{
                    height: `${h}%`,
                    backgroundColor: b.color ?? color,
                    opacity: sel != null && !active ? 0.3 : b.value > 0 ? 1 : 0.35,
                  }}
                />
                {i % every === 0 || i === bars.length - 1 ? (
                  <span className="mt-1 block truncate text-center text-[9px] text-faint">
                    {b.label}
                  </span>
                ) : (
                  <span className="mt-1 block text-[9px]" aria-hidden>
                    &nbsp;
                  </span>
                )}
              </>
            );
            return onBarTap || formatValue ? (
              <button
                key={`${b.label}-${i}`}
                onClick={() => {
                  if (!onBarTap) {
                    setSel((s) => (s === i ? null : i));
                    return;
                  }
                  setSel(i);
                  onBarTap(b, i);
                }}
                className="group flex h-full min-w-0 flex-1 flex-col items-stretch justify-end focus-visible:outline-none"
                aria-label={`${b.label}: ${formatValue ? formatValue(b.value) : b.value}`}
                aria-pressed={active}
              >
                {inner}
              </button>
            ) : (
              <div key={`${b.label}-${i}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
