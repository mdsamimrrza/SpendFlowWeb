"use client";

import { useEffect, useState } from "react";

export interface RankedBarRow {
  label: string;
  value: number;
  /** Category color; falls back to the brand primary. */
  color?: string | null;
}

interface RankedBarsProps {
  rows: RankedBarRow[];
  /** Privacy-masked money formatter from the host screen. */
  formatted: (n: number) => string;
}

/**
 * Ranked horizontal bars (Monarch Reports pattern): rank number, name,
 * mount-animated width proportional to the category's share, amount + % on
 * the right. Widths animate on mount unless prefers-reduced-motion is set.
 */
export function RankedBars({ rows, formatted }: RankedBarsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(raf);
    }
    setMounted(true);
  }, []);

  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);

  if (total <= 0) {
    return (
      <div className="flex h-[120px] items-center justify-center border border-dashed border-border">
        <p className="caps">No spending in range</p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => {
        const pct = Math.round((r.value / total) * 100);
        return (
          <li key={r.label} className="flex min-w-0 items-center gap-2.5">
            <span className="numeric w-4 shrink-0 text-right text-[11px] font-bold text-faint">{i + 1}</span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block truncate text-[12.5px] font-semibold text-text">{r.label}</span>
              <span className="block h-[6px] overflow-hidden rounded-full" style={{ backgroundColor: "var(--sf-track)" }}>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${mounted ? Math.max((r.value / max) * 100, 2) : 0}%`,
                    backgroundColor: r.color || "var(--sf-primary)",
                    transition: "width 700ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                />
              </span>
            </span>
            <span className="w-[104px] shrink-0 text-right" style={{ minWidth: 104 }}>
              <span className="numeric block text-[12.5px] font-bold text-text">{formatted(r.value)}</span>
              <span className="numeric block text-[10.5px] text-text-muted">{pct}%</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
