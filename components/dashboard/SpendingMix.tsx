"use client";

import type { CategorySlice } from "@/components/charts/CategoryBars";
import { categoryGlyph } from "@/components/ui/Glyph";

export interface MixSlice extends CategorySlice {
  icon?: string;
}

interface SpendingMixProps {
  /** Expense slices for the cycle, any order (sorted here). */
  slices: MixSlice[];
  formatValue: (n: number) => string;
  /** Label the tail categories fold into (i18n). */
  otherLabel: string;
  /** Label for the bottom total row (i18n, e.g. "Cycle outflow"). */
  cycleTotalLabel: string;
  /** Ranked rows shown before folding to Other. */
  maxRows?: number;
  /** Denser type/spacing for narrow side-column placements (cycle report). */
  compact?: boolean;
}

/**
 * Spending mix – ranked composition view. A single segmented share bar up
 * top shows the cycle's category split at a glance; below it, rows rank each
 * category (icon chip, share bar scaled to the top category, figure + %).
 * Replaces the donut on the dashboard so the page has varied chart shapes,
 * not a third ring/bar cluster.
 */
export function SpendingMix({
  slices,
  formatValue,
  otherLabel,
  cycleTotalLabel,
  maxRows = 5,
  compact = false,
}: SpendingMixProps) {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  const head = sorted.slice(0, maxRows);
  const restValue = sorted.slice(maxRows).reduce((s, x) => s + x.value, 0);
  const rows: MixSlice[] =
    restValue > 0
      ? [...head, { label: otherLabel, value: restValue, color: "var(--sf-faint)" }]
      : head;
  const top = head[0]?.value ?? 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Segmented share bar – one glance at the whole mix */}
      <div
        className={`flex gap-[2px] overflow-hidden rounded-full ${compact ? "h-2" : "h-3"}`}
        role="img"
        aria-label={rows.map((r) => `${r.label} ${Math.round((r.value / total) * 100)}%`).join(", ")}
      >
        {rows.map((r) => (
          <div
            key={r.label}
            className="h-full transition-[flex-basis] duration-500"
            style={{
              flexBasis: `${(r.value / total) * 100}%`,
              // Shrink, never grow: percent widths + inter-segment gaps must
              // never push the bar past the card edge.
              flexGrow: 0,
              flexShrink: 1,
              minWidth: 0,
              backgroundColor: r.color,
            }}
          />
        ))}
      </div>

      {/* Ranked rows – spread evenly when the panel is stretched to match a
          taller grid sibling, natural spacing otherwise. */}
      <ul className={`flex flex-1 flex-col justify-evenly ${compact ? "mt-1" : "mt-1.5"}`}>
        {rows.map((r) => {
          const pct = Math.round((r.value / total) * 100);
          // Stored icons are emoji (mobile) OR lucide names – resolve both
          // through the shared glyph mapper so raw text never leaks in.
          const Glyph = categoryGlyph(r.icon);
          return (
            <li
              key={r.label}
              className={`flex items-center gap-3 border-b border-border/50 last:border-0 ${
                compact ? "min-h-9 py-1.5" : "min-h-12 py-2"
              }`}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-full ${
                  compact ? "h-7 w-7" : "h-9 w-9"
                }`}
                style={{
                  backgroundColor: `color-mix(in srgb, ${r.color} 14%, transparent)`,
                  color: r.color,
                }}
                aria-hidden
              >
                <Glyph size={compact ? 13 : 16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`min-w-0 truncate font-bold text-text ${compact ? "text-[12.5px]" : "text-sm"}`}>
                    {r.label}
                  </p>
                  <p className={`numeric shrink-0 font-bold text-text ${compact ? "text-[12.5px]" : "text-sm"}`}>
                    {formatValue(r.value)}
                  </p>
                </div>
                <div className={`flex items-center gap-2 ${compact ? "mt-1" : "mt-1.5"}`}>
                  <div className={`min-w-0 flex-1 overflow-hidden rounded-full bg-surface-elevated ${compact ? "h-1" : "h-1.5"}`}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max((r.value / top) * 100, 2)}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </div>
                  <span className="numeric shrink-0 font-semibold text-faint">
                    <span className={compact ? "text-[10px]" : "text-[11px]"}>{pct}%</span>
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Cycle-total footer – pins to the bottom so the panel fills a taller
          grid row (beside the cash-flow card) without a dead block. */}
      <div className={`mt-auto flex items-center justify-between gap-2 border-t border-border ${compact ? "pt-2.5" : "pt-3.5"}`}>
        <p className="caps">{cycleTotalLabel}</p>
        <p className={`figures font-bold text-text ${compact ? "text-sm" : "text-base"}`}>{formatValue(total)}</p>
      </div>
    </div>
  );
}
