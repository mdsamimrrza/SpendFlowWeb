"use client";

import { useMemo, useState } from "react";
import { FitText } from "@/components/ui/FitText";

export interface ShareDonutSlice {
  label: string;
  value: number;
}

/* Deliberate single-hue ramp (design decision 2026-10-11): the ONLY raw hexes
   allowed in this file. Stored category colors are data (mobile writes them)
   but are ignored here so the analytics donut stays inside the Neo emerald
   system; zinc closes the ramp for the "Other" remainder. */
export const DONUT_RAMP = [
  "#065f46",
  "#059669",
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#a1a1aa", // "Other"
] as const;

interface ShareDonutProps {
  slices: ShareDonutSlice[];
  /** Privacy-masked money formatter from the host screen. */
  formatted: (n: number) => string;
  /** Caption under the center figure (e.g. "spent"). */
  centerLabel?: string;
}

/**
 * Category-share donut (Monarch Reports pattern): SVG stroke arcs with 2px
 * gaps, center shows the total or the hovered/tapped slice's share, legend
 * rows below highlight their slice on hover/tap. Slices are colored from the
 * curated single-hue DONUT_RAMP (deepest emerald -> mint -> zinc), not from
 * stored category colors.
 */
export function ShareDonut({ slices, formatted, centerLabel }: ShareDonutProps) {
  const [active, setActive] = useState<number | null>(null);

  const model = useMemo(() => {
    const total = slices.reduce((s, x) => s + x.value, 0);
    // pathLength=100 normalizes each circle; a 2px gap at this radius is
    // ~0.45 units. Round the emitted attrs - SSR/client float drift would
    // otherwise surface as a hydration mismatch.
    const gap = 0.55;
    const round2 = (v: number) => Math.round(v * 100) / 100;
    let start = 0;
    const arcs = slices.map((s, i) => {
      const share = total > 0 ? s.value / total : 0;
      const len = share * 100;
      const arc = {
        ...s,
        color: DONUT_RAMP[Math.min(i, DONUT_RAMP.length - 1)],
        pct: Math.round(share * 100),
        dash: `${round2(Math.max(len - gap, 0.2))} ${round2(100 - Math.max(len - gap, 0.2))}`,
        offset: round2(-start - gap / 2),
      };
      start += len;
      return arc;
    });
    return { total, arcs };
  }, [slices]);

  if (model.total <= 0) {
    return (
      <div className="flex h-[200px] items-center justify-center border border-dashed border-border">
        <p className="caps">No spending in range</p>
      </div>
    );
  }

  const activeSlice = active != null ? model.arcs[active] : null;

  return (
    <div className="flex min-w-0 flex-col items-center gap-4">
      {/* Donut + center figure */}
      <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
        <svg viewBox="0 0 200 200" width={200} height={200} role="img" aria-label="Category share">
          {model.arcs.map((a, i) => (
            <circle
              key={a.label}
              cx={100}
              cy={100}
              r={76}
              fill="none"
              stroke={a.color}
              strokeWidth={active === i ? 36 : 30}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              pathLength={100}
              opacity={active == null || active === i ? 1 : 0.3}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "100px 100px",
                transition: "stroke-width 160ms ease, opacity 160ms ease",
              }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {activeSlice ? (
            <>
              <span className="figures-display text-[26px] leading-7 text-text">{activeSlice.pct}%</span>
              <span className="mt-0.5 max-w-[110px] truncate text-[11px] text-text-muted">{activeSlice.label}</span>
              <span className="numeric mt-0.5 text-[11.5px] font-bold text-text">{formatted(activeSlice.value)}</span>
            </>
          ) : (
            <>
              {/* Hole inner diameter is ~122px (r76 minus stroke 30); FitText
                  shrinks long currency figures to stay inside it. */}
              <span className="figures-display block w-[122px] text-text">
                <FitText basePx={22} minPx={12}>
                  {formatted(model.total)}
                </FitText>
              </span>
              {centerLabel && <span className="caps-faint mt-0.5">{centerLabel}</span>}
            </>
          )}
        </div>
      </div>

      {/* Legend rows - hover/tap highlights the slice */}
      <div className="w-full space-y-0.5">
        {model.arcs.map((a, i) => (
          <button
            key={a.label}
            type="button"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive((cur) => (cur === i ? null : i))}
            aria-label={`${a.label}: ${formatted(a.value)} (${a.pct}%)`}
            className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors"
            style={{ backgroundColor: active === i ? "var(--sf-surface-elevated)" : "transparent" }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">{a.label}</span>
            <span className="numeric shrink-0 text-[12.5px] font-bold text-text">{formatted(a.value)}</span>
            <span className="numeric w-9 shrink-0 text-right text-[11px] text-text-muted">{a.pct}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
