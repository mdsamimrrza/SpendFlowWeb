"use client";

import { useMemo, useState } from "react";

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
  /** Optional icon character (emoji) or short code shown in the legend. */
  icon?: string;
}

interface CategoryDonutProps {
  slices: DonutDatum[];
  /** Total figure shown above the legend (already formatted). */
  centerValue: string;
  centerLabel?: string;
  /** Per-value formatter for legend rows and selection readout. */
  formatValue?: (n: number) => string;
  className?: string;
  /** Ring diameter in px; scales down inside narrow panels automatically. */
  size?: number;
  /** "side" (default): readout beside the ring, compact legend. "center":
   *  total overlaid inside the ring hole, full bar-row legend below. */
  layout?: "side" | "center";
}

/**
 * Interactive category donut: tap a ring segment or a legend row to pin it —
 * center flips to that slice's label, figure and share; tap again to clear.
 * Segments animate their dash on mount. Legend is the full accessible table
 * (color + icon + text + value + %), never color alone.
 */
export function CategoryDonut({
  slices,
  centerValue,
  centerLabel = "Total",
  formatValue,
  className = "",
  size = 168,
  layout = "side",
}: CategoryDonutProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const segs = useMemo(() => {
    const total = slices.reduce((s, x) => s + x.value, 0);
    let offset = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const frac = total > 0 ? s.value / total : 0;
        const seg = { ...s, frac, offset, pct: Math.round(frac * 100) };
        offset += frac;
        return seg;
      });
  }, [slices]);

  const total = segs.reduce((s, x) => s + x.value, 0);
  const sel = selected ? segs.find((s) => s.label === selected) ?? null : null;

  const R = 70;
  const C = 2 * Math.PI * R;
  const stroke = 20;

  if (segs.length === 0) {
    return (
      <div className="flex items-center justify-center border border-dashed border-border py-10">
        <span className="caps">Nothing to show yet</span>
      </div>
    );
  }

  const ring = (
    <svg
      viewBox="0 0 180 180"
      style={{ width: size, height: size }}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label="Spending by category"
    >
      <circle cx="90" cy="90" r={R} fill="none" stroke="var(--sf-surface-elevated)" strokeWidth={stroke} />
      {segs.map((s) => {
        const dimmed = sel && sel.label !== s.label;
        return (
          <g key={s.label}>
            <circle
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={sel?.label === s.label ? stroke + 5 : stroke}
              strokeDasharray={`${(s.frac * C - 1.5).toFixed(2)} ${C.toFixed(2)}`}
              strokeDashoffset={(-s.offset * C).toFixed(2)}
              strokeLinecap="butt"
              opacity={dimmed ? 0.25 : 1}
              style={{ transition: "stroke-width 200ms ease, opacity 200ms ease" }}
            />
            {/* Invisible hit ring (rotated back so pointer math stays simple). */}
            <circle
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke="transparent"
              strokeWidth={stroke + 10}
              strokeDasharray={`${(s.frac * C).toFixed(2)} ${C.toFixed(2)}`}
              strokeDashoffset={(-s.offset * C).toFixed(2)}
              className="cursor-pointer"
              onClick={() => setSelected((cur) => (cur === s.label ? null : s.label))}
            />
          </g>
        );
      })}
    </svg>
  );

  if (layout === "center") {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          {ring}
          {/* Total (or pinned slice) overlaid in the ring hole; never blocks
              segment taps. */}
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
            aria-live="polite"
          >
            <p className="figures max-w-full truncate text-lg font-extrabold text-text">
              {sel ? (formatValue ? formatValue(sel.value) : sel.value) : centerValue}
            </p>
            <p className="caps-faint mt-0.5 max-w-full truncate !text-[9px]">
              {sel ? `${sel.label} · ${sel.pct}%` : centerLabel}
            </p>
          </div>
        </div>
        {sel && (
          <button
            onClick={() => setSelected(null)}
            className="caps mt-2 !text-primary-strong hover:underline"
          >
            Clear
          </button>
        )}
        <ul className="mt-4 w-full space-y-1.5">
          {segs.map((s) => (
            <li key={s.label}>
              <button
                onClick={() => setSelected((cur) => (cur === s.label ? null : s.label))}
                aria-pressed={sel?.label === s.label}
                className={`w-full rounded-lg px-2 py-1.5 text-left transition ${
                  sel?.label === s.label ? "bg-surface-elevated" : "hover:bg-surface-elevated/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">{s.label}</span>
                  <span className="numeric shrink-0 text-xs font-bold text-text">
                    {formatValue ? formatValue(s.value) : s.value}
                  </span>
                  <span className="numeric w-9 shrink-0 text-right text-[11px] text-faint">{s.pct}%</span>
                </div>
                <div className="ml-[18px] mt-1.5 h-1 rounded-full bg-surface-elevated">
                  <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`@container flex flex-col items-center gap-5 @lg:flex-row @lg:items-start ${className}`}>
      {ring}

      {/* Center readout + legend */}
      <div className="w-full min-w-0 flex-1">
        <div
          className="mb-3 flex items-baseline justify-between gap-2 sm:justify-start"
          aria-live="polite"
        >
          <div className="min-w-0">
            <p className="figures truncate text-xl font-bold text-text sm:text-2xl">
              {sel ? (formatValue ? formatValue(sel.value) : sel.value) : centerValue}
            </p>
            <p className="caps mt-0.5 truncate">
              {sel ? `${sel.label} · ${sel.pct}%` : centerLabel}
            </p>
          </div>
          {sel && (
            <button
              onClick={() => setSelected(null)}
              className="caps shrink-0 !text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {/* One legend column at every width — two-up squeezed the label
            column into unreadable truncation on desktop cards. */}
        <ul className="grid grid-cols-1 gap-0.5">
          {segs.slice(0, 8).map((s) => (
            <li key={s.label}>
              <button
                onClick={() => setSelected((cur) => (cur === s.label ? null : s.label))}
                aria-pressed={sel?.label === s.label}
                className={`flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-xs transition ${
                  sel?.label === s.label ? "bg-surface-elevated" : "hover:bg-surface-elevated/60"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold text-text">
                  {s.icon && <span className="mr-1">{s.icon}</span>}
                  {s.label}
                </span>
                <span className="numeric shrink-0 text-text-muted">
                  {formatValue ? formatValue(s.value) : ""}
                  <span className="ml-1.5 text-faint">{s.pct}%</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
