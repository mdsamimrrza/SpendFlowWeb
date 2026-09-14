"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "@/components/charts/TrendChart";
import { formatShortDate } from "@/utils/format";

interface StockFlowChartProps {
  points: TrendPoint[];
  locale?: string;
  /** viewBox height (rendered height scales with container width); lower it
   *  for compact embeds like the Analytics statement. */
  height?: number;
}

/**
 * Stock-ticker-style cash chart: one cumulative net-flow line (the running
 * balance across the window) with a gradient fill beneath — green when the
 * window ends up, red when it ends down, like a market cap curve. Dashed
 * baseline marks the window start, a right-edge tag carries the final value,
 * and the crosshair readout works with mouse hover AND touch tap (tap pins).
 * SVG text scales inversely with container width so labels stay legible at
 * phone widths.
 */
export function StockFlowChart({ points, locale = "en-US", height = 240 }: StockFlowChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const gradId = `sf-stock-area${useId().replace(/:/g, "")}`;

  const W = 680;
  const H = height;

  // The SVG scales its 680-unit viewBox to the container, which shrinks text
  // to ~half size on a 390 px phone. Measure and grow font sizes by the
  // inverse factor so on-screen text keeps its designed size.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fontScale, setFontScale] = useState(1);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w > 0) setFontScale(Math.min(Math.max(W / w, 1), 2.6));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fs = (n: number) => Math.round(n * fontScale * 10) / 10;
  // Left gutter grows with the scaled y-labels so they never clip the viewBox.
  const PAD = { top: 22, right: 64, bottom: 26, left: 40 + 14 * fontScale };

  const model = useMemo(() => {
    if (points.length === 0) return null;
    let cum = 0;
    const series = points.map((p) => (cum += p.income - p.expense));
    const daily = points.map((p) => p.income - p.expense);

    // Gaussian-smooth the series for the DRAWN curve — this is what makes
    // ticker charts look silky: the day-to-day noise is blurred away and
    // only the real trend remains. The first and last points are pinned to
    // the true values (the tag must stay exact), and every number shown in
    // text (readout, summary, insights) still comes from the raw series.
    const sigma = Math.max(1.5, series.length * 0.07);
    const radius = Math.ceil(sigma * 2);
    const plot = series.map((_, i) => {
      let sum = 0;
      let wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        if (j < 0 || j >= series.length) continue;
        const w = Math.exp(-(k * k) / (2 * sigma * sigma));
        sum += series[j] * w;
        wsum += w;
      }
      return sum / wsum;
    });
    if (plot.length > 0) {
      plot[0] = series[0];
      plot[plot.length - 1] = series[series.length - 1];
    }

    const max = Math.max(...plot, 0);
    const min = Math.min(...plot, 0);
    const flat = max === 0 && min === 0;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    // Padded domain: a little headroom above the peak (and below the trough
    // when negative) so the line never rides the plot edge — like a real
    // market chart. The zero baseline hugs the bottom when all-positive.
    const pad = (max - min || Math.max(max, 1)) * 0.08;
    const dMin = min < 0 ? min - pad : Math.min(0, max) - 0.0001;
    const dMax = max + pad;
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - ((v - dMin) / (dMax - dMin)) * innerH;

    // Flowing Catmull-Rom spline with a loose tension (0.22 vs the classic
    // 1/6) — the soft-shouldered "market curve" look: rounded bell peaks,
    // long glide into spikes, gentle tails. Control points are clamped to
    // the plot band so the tasteful overshoot never leaves the chart.
    const n = series.length;
    const xs = plot.map((_, i) => x(i));
    const ys = plot.map((v) => y(v));
    let linePath = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    if (n > 1) {
      const clampY = (v: number) => Math.max(PAD.top, Math.min(v, H - PAD.bottom));
      const S = 0.22;
      for (let i = 0; i < n - 1; i++) {
        const i0 = Math.max(0, i - 1);
        const i3 = Math.min(n - 1, i + 2);
        const c1x = xs[i] + (xs[i + 1] - xs[i0]) * S;
        const c1y = clampY(ys[i] + (ys[i + 1] - ys[i0]) * S);
        const c2x = xs[i + 1] - (xs[i3] - xs[i]) * S;
        const c2y = clampY(ys[i + 1] - (ys[i3] - ys[i]) * S);
        linePath += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
      }
    }
    const areaPath =
      linePath +
      ` L${xs[n - 1].toFixed(1)},${(H - PAD.bottom).toFixed(1)}` +
      ` L${xs[0].toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

    const up = series[series.length - 1] >= 0;
    const color = up ? "var(--sf-income)" : "var(--sf-danger)";

    const tickCount = Math.min(5, points.length);
    const rawTicks = Array.from({ length: tickCount }, (_, k) =>
      Math.round((k / (tickCount - 1 || 1)) * (points.length - 1)),
    );
    // With the inverse-scaled mobile fonts, adjacent labels can collide —
    // drop ticks closer than one label width and always keep the final date.
    const minGap = fs(9) * 6;
    const tickIdx: number[] = [];
    for (const i of rawTicks) {
      if (tickIdx.length && x(i) - x(tickIdx[tickIdx.length - 1]) < minGap) continue;
      tickIdx.push(i);
    }
    if (tickIdx[tickIdx.length - 1] !== points.length - 1) {
      if (tickIdx.length > 1 && x(points.length - 1) - x(tickIdx[tickIdx.length - 1]) < minGap) tickIdx.pop();
      tickIdx.push(points.length - 1);
    }

    const compact = (v: number) =>
      (v < 0 ? "−" : "") +
      Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v));

    // Grid: human "nice" steps (1/2/2.5/5 × 10ⁿ) across the data range, so
    // labels read like a real market axis (0 / 20K / 40K …) instead of thirds.
    let gridValues: number[] = [0];
    if (!flat) {
      const raw = (max - min) / 3;
      const mag = 10 ** Math.floor(Math.log10(raw));
      const norm = raw / mag;
      const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
      gridValues = [];
      for (let k = Math.ceil(min / step); k * step <= max + step * 1e-6; k++) {
        gridValues.push(Math.abs(k) < 1e-9 ? 0 : k * step);
      }
    }

    return { series, plot, daily, max, min, flat, x, y, linePath, areaPath, up, color, tickIdx, compact, gridValues };
  }, [points, locale, fontScale]);

  if (!model) {
    return (
      <div ref={wrapRef} className="flex h-[240px] items-center justify-center border border-dashed border-border">
        <p className="caps">No entries in range</p>
      </div>
    );
  }

  const active = hover ?? pin;
  const last = points.length - 1;
  const lastValue = model.series[last];
  // Hour buckets (the 1D range) carry a time component — label them by hour
  // instead of repeating the same date across the axis.
  const shortLabel = (iso: string) =>
    iso.length > 10 ? `${iso.slice(11, 13)}:00` : formatShortDate(iso, locale);

  const onMove = (i: number, e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setHover(i);
  };
  const onTap = (i: number) => setPin((cur) => (cur === i ? null : i));

  return (
    <div ref={wrapRef}>
      {/* Readout strip (hover / pinned) */}
      <div className="mb-1 flex h-5 items-center justify-between gap-2">
        <span className="stamp truncate">
          {points.length > 1
            ? `${shortLabel(points[0].date)} — ${shortLabel(points[last].date)}`
            : ""}
        </span>
        {active != null && (
          <p className="numeric flex shrink-0 items-baseline gap-1.5 text-xs font-bold text-text">
            <span className="caps !text-faint">{shortLabel(points[active].date)}</span>
            <span className={model.daily[active] >= 0 ? "text-income" : "text-danger"}>
              {model.daily[active] >= 0 ? "+" : "−"}
              {model.compact(Math.abs(model.daily[active]))}
            </span>
            <span className="text-faint">·</span>
            <span>
              NET {model.compact(model.series[active])}
            </span>
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-manipulation"
        role="img"
        aria-label="Cumulative net cash flow"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={model.color} stopOpacity="0.18" />
            <stop offset="55%" stopColor={model.color} stopOpacity="0.06" />
            <stop offset="100%" stopColor={model.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid + y labels — the zero line reads as the axis, slightly firmer */}
        {model.gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={model.y(v)}
              y2={model.y(v)}
              stroke={v === 0 ? "var(--sf-text-muted)" : "var(--sf-border)"}
              strokeWidth={v === 0 ? 1 : 0.75}
              strokeDasharray={v === 0 ? "3 3" : "2 5"}
              opacity={v === 0 ? 0.4 : 0.55}
            />
            <text
              x={PAD.left - 8}
              y={model.y(v) + fs(3.5)}
              textAnchor="end"
              fontSize={fs(9)}
              fill="var(--sf-faint)"
              style={{ letterSpacing: "0.05em" }}
            >
              {model.compact(v)}
            </text>
          </g>
        ))}

        {/* Gradient fill + line */}
        <path d={model.areaPath} fill={`url(#${gradId})`} />
        <path
          d={model.linePath}
          fill="none"
          stroke={model.color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw"
        />
        {/* End dot + right-edge value tag — the chip sits fully inside the
            right gutter (its old width ran 2 units past the viewBox and was
            clipped into a sliver at the card edge). */}
        <g>
          <line
            x1={model.x(last)}
            x2={W - PAD.right + 4}
            y1={model.y(lastValue)}
            y2={model.y(lastValue)}
            stroke={model.color}
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <rect
            x={W - PAD.right + 4}
            y={model.y(lastValue) - fs(9)}
            width={PAD.right - 8}
            height={fs(18)}
            rx={5}
            fill={model.color}
          />
          <text
            x={W - PAD.right + 4 + (PAD.right - 8) / 2}
            y={model.y(lastValue) + fs(3.5)}
            textAnchor="middle"
            fontSize={fs(8)}
            fontWeight="700"
            fill="var(--sf-surface)"
          >
            {model.compact(lastValue)}
          </text>
          <circle cx={model.x(last)} cy={model.y(lastValue)} r="8" fill={model.color} opacity="0.16" />
          <circle
            cx={model.x(last)}
            cy={model.y(lastValue)}
            r="3.5"
            fill={model.color}
            stroke="var(--sf-surface)"
            strokeWidth="1.5"
          />
        </g>

        {/* Crosshair on the active bucket */}
        {active != null && (
          <g>
            <line
              x1={model.x(active)}
              x2={model.x(active)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--sf-text-muted)"
              strokeWidth="1"
              strokeDasharray="1 3"
            />
            <circle
              cx={model.x(active)}
              cy={model.y(model.plot[active])}
              r="4.5"
              fill={model.color}
              stroke="var(--sf-surface)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Hit zones — pointer-driven so touch taps work on phones. */}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={model.x(i) - (W - PAD.left - PAD.right) / (points.length * 2)}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / points.length}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerMove={(e) => onMove(i, e)}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") onTap(i);
            }}
            onClick={(e) => {
              // Mouse clicks pin too; touch already pinned on pointerdown.
              if ((e.nativeEvent as PointerEvent).pointerType === "mouse") onTap(i);
            }}
            onPointerLeave={() => setHover(null)}
          />
        ))}

        {/* X ticks */}
        {model.tickIdx.map((i) => (
          <text
            key={points[i].date}
            x={model.x(i)}
            y={H - 7}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize={fs(9)}
            fill="var(--sf-faint)"
            style={{ letterSpacing: "0.06em" }}
          >
            {shortLabel(points[i].date).toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  );
}
