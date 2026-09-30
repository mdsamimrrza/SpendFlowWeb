"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "@/components/charts/TrendChart";
import { useLanguage } from "@/store/LanguageContext";
import { formatShortDate } from "@/utils/format";

interface StockFlowChartProps {
  points: TrendPoint[];
  locale?: string;
  /** viewBox height (rendered height scales with container width); lower it
   *  for compact embeds like the Analytics statement. */
  height?: number;
}

/**
 * "Expenses vs Inflow" two-line chart (user reference): the green line is
 * the DAILY net — zero everywhere except a spike up exactly on an income
 * entry's date and a spike down on an expense entry's date — while the red
 * line is the cumulative spend climbing from zero. Dots mark every entry
 * day. Full-amount y labels, thirds gridlines, and a floating transparent
 * readout card on hover (mouse) / tap (touch, pins) carry that day's exact
 * figures. SVG text scales inversely with container width so labels stay
 * legible at phone widths.
 */
export function StockFlowChart({ points, locale = "en-US", height = 240 }: StockFlowChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const { t } = useLanguage();
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

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const PADR = 16;

    // Two series: the DAILY net (income − expense for that exact day — zero
    // everywhere except a spike up at an income entry and a spike down at an
    // expense entry) and the cumulative spend climbing from zero. No running
    // total on the green line and no projection: the line only rises/falls
    // exactly on the date an entry exists (user clarification 2026-09-30).
    let cumOut = 0;
    const net: number[] = [];
    const spent: number[] = [];
    for (const p of points) {
      cumOut += p.expense;
      net.push(p.income - p.expense);
      spent.push(cumOut);
    }

    const fmtFull = (v: number) =>
      Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(Math.abs(v)));
    const maxV = Math.max(...net, ...spent, 0);
    const minV = Math.min(...net, 0);
    // Left gutter sized to the longest full-amount label on the axis.
    const padL = Math.max(fs(28), fmtFull(maxV).length * fs(5.4) + fs(12));

    const innerW = W - padL - PADR;
    const innerH = H - 22 - 26;
    const pad = (maxV - minV || maxV || 1) * 0.08;
    const dMax = maxV + pad;
    const dMin = minV - (minV < 0 ? pad : 0.0001);
    // SSR and the client can drift in the last float bits (points arrive from
    // different conversion paths), which React reports as a hydration
    // attribute mismatch on the raw cx/cy. Rounding the emitted coordinates
    // to 3 decimals collapses that drift; paths already do via toFixed(1).
    const round3 = (v: number) => Math.round(v * 1000) / 1000;
    const x = (i: number) =>
      round3(padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW));
    const y = (v: number) => round3(22 + innerH - ((v - dMin) / (dMax - dMin)) * innerH);

    // Smooth both series with one tight Gaussian (4% of the window) so a
    // single-day step reads as a step; first/last stay pinned to true values.
    const smooth = (series: number[]) => {
      // Very tight blur — just enough to soften pixel-level jitter while a
      // one-day spike still reads as a spike on its exact date.
      const sigma = Math.max(0.5, series.length * 0.012);
      const radius = Math.ceil(sigma * 2);
      const out = series.map((_, i) => {
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
      out[0] = series[0];
      out[out.length - 1] = series[series.length - 1];
      return out;
    };
    const netPlot = smooth(net);
    const spentPlot = smooth(spent);

    // Flowing Catmull-Rom spline (tension 0.22) — the soft market-curve look.
    const spline = (plot: number[]) => {
      const n = plot.length;
      const xs = plot.map((_, i) => x(i));
      const ys = plot.map((v) => y(v));
      let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
      if (n > 1) {
        const clampY = (v: number) => Math.max(22, Math.min(v, H - 26));
        const S = 0.22;
        for (let i = 0; i < n - 1; i++) {
          const i0 = Math.max(0, i - 1);
          const i3 = Math.min(n - 1, i + 2);
          const c1x = xs[i] + (xs[i + 1] - xs[i0]) * S;
          const c1y = clampY(ys[i] + (ys[i + 1] - ys[i0]) * S);
          const c2x = xs[i + 1] - (xs[i3] - xs[i]) * S;
          const c2y = clampY(ys[i + 1] - (ys[i3] - ys[i]) * S);
          d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
        }
      }
      return d;
    };
    const netPath = spline(netPlot);
    const spentPath = spline(spentPlot);
    const areaPath =
      netPath +
      ` L${x(points.length - 1).toFixed(1)},${(H - 26).toFixed(1)}` +
      ` L${x(0).toFixed(1)},${(H - 26).toFixed(1)} Z`;

    // Sparse x ticks — drop labels closer than one label width, keep last.
    const tickCount = Math.min(5, points.length);
    const rawTicks = Array.from({ length: tickCount }, (_, k) =>
      Math.round((k / (tickCount - 1 || 1)) * (points.length - 1)),
    );
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

    // Grid: the sample's look — the data range split into thirds with full
    // amount labels; when the balance dips negative, fall back to nice steps
    // so the zero line stays readable.
    let gridValues: number[] = [0, maxV / 3, (maxV / 3) * 2, maxV];
    if (minV < 0) {
      const raw = (maxV - minV) / 3;
      const mag = 10 ** Math.floor(Math.log10(raw));
      const norm = raw / mag;
      const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
      gridValues = [];
      for (let k = Math.ceil(minV / step); k * step <= maxV + step * 1e-6; k++) {
        gridValues.push(Math.abs(k) < 1e-9 ? 0 : k * step);
      }
    }

    return {
      net,
      spent,
      netPlot,
      spentPlot,
      netPath,
      spentPath,
      areaPath,
      x,
      y,
      padL,
      PADR,
      maxV,
      gridValues,
      fmtFull,
      // Hit-zone band: half a step either side of each point, so consecutive
      // rects tile the plot with no dead gaps between them.
      band: points.length > 1 ? innerW / (points.length - 1) : innerW,
      tickIdx,
    };
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
  // Hour buckets (the 1D range) carry a time component — label them by hour
  // instead of repeating the same date across the axis.
  const shortLabel = (iso: string) =>
    iso.length > 10 ? `${iso.slice(11, 13)}:00` : formatShortDate(iso, locale);
  const compact = (v: number) =>
    (v < 0 ? "−" : "") +
    Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v));

  // Floating on-chart data card for the active (hovered / pinned) bucket —
  // that exact day's entries, labeled rows with color dots; follows the
  // crosshair and flips side near the right edge so it never clips.
  const activeCard = (() => {
    if (active == null) return null;
    const p = points[active];
    const dayNet = p.income - p.expense;
    const rows: { label: string; value: string; color: string; dot: boolean }[] = [
      { label: t("homeInflow"), value: compact(p.income), color: "var(--sf-income)", dot: true },
      { label: t("homeOutflow"), value: compact(p.expense), color: "var(--sf-danger)", dot: true },
      {
        label: t("cfNet"),
        value: compact(dayNet),
        color: dayNet >= 0 ? "var(--sf-income)" : "var(--sf-danger)",
        dot: false,
      },
    ];
    const date = shortLabel(p.date).toUpperCase();
    const w =
      Math.max(date.length, ...rows.map((r) => r.label.length + r.value.length + 2)) * fs(5.4) + fs(28);
    const h = fs(20) + rows.length * fs(14) + fs(6);
    const px = model.x(active);
    return {
      date,
      rows,
      w,
      h,
      x: Math.min(Math.max(px - w / 2, model.padL), W - model.PADR - w),
      y: 24,
    };
  })();

  const onMove = (i: number, e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setHover(i);
  };
  const onTap = (i: number) => setPin((cur) => (cur === i ? null : i));

  return (
    <div ref={wrapRef}>
      {/* Strip: window stamp left, line legend right (sample style) */}
      <div className="mb-1 flex h-5 items-center justify-between gap-2">
        <span className="stamp truncate">
          {points.length > 1
            ? `${shortLabel(points[0].date)} — ${shortLabel(points[last].date)}`
            : ""}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
            {t("homeOutflow")}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-income" aria-hidden />
            {t("cfNet")}
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-manipulation"
        role="img"
        aria-label="Expenses versus inflow"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sf-income)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--sf-income)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid + full-amount y labels (sample style: thirds of the range) */}
        {model.gridValues.map((v) => (
          <g key={v}>
            <line
              x1={model.padL}
              x2={W - model.PADR}
              y1={model.y(v)}
              y2={model.y(v)}
              stroke={v === 0 ? "var(--sf-text-muted)" : "var(--sf-border)"}
              strokeWidth={v === 0 ? 1 : 0.75}
              strokeDasharray={v === 0 ? "3 3" : "2 5"}
              opacity={v === 0 ? 0.5 : 0.55}
            />
            <text
              x={model.padL - 8}
              y={model.y(v) + fs(3.5)}
              textAnchor="end"
              fontSize={fs(9)}
              fill="var(--sf-faint)"
              style={{ letterSpacing: "0.03em" }}
            >
              {model.fmtFull(v)}
            </text>
          </g>
        ))}

        {/* Wash under the balance line + the two curves */}
        <path d={model.areaPath} fill={`url(#${gradId})`} />
        <path
          d={model.spentPath}
          fill="none"
          stroke="var(--sf-danger)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw"
        />
        <path
          d={model.netPath}
          fill="none"
          stroke="var(--sf-income)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw"
        />

        {/* Entry dots: on the balance line when income lands, on the spend
            line when an expense lands */}
        {points.map((p, i) => (
          <g key={`dots-${p.date}`} pointerEvents="none">
            {(p.income > 0 || p.expense > 0) && (
              <circle
                cx={model.x(i)}
                cy={model.y(model.netPlot[i])}
                r={fs(2.6)}
                fill={p.income >= p.expense ? "var(--sf-income)" : "var(--sf-danger)"}
                stroke="var(--sf-surface)"
                strokeWidth="1"
              />
            )}
            {p.expense > 0 && (
              <circle
                cx={model.x(i)}
                cy={model.y(model.spentPlot[i])}
                r={fs(2.6)}
                fill="var(--sf-danger)"
                stroke="var(--sf-surface)"
                strokeWidth="1"
              />
            )}
          </g>
        ))}

        {/* End dots on both lines (sample style: both series end on a dot) */}
        <g pointerEvents="none">
          <circle
            cx={model.x(last)}
            cy={model.y(model.spentPlot[last])}
            r={fs(3)}
            fill="var(--sf-danger)"
            stroke="var(--sf-surface)"
            strokeWidth="1.5"
          />
          <circle
            cx={model.x(last)}
            cy={model.y(model.netPlot[last])}
            r={fs(3.5)}
            fill="var(--sf-income)"
            stroke="var(--sf-surface)"
            strokeWidth="1.5"
          />
        </g>

        {/* Crosshair on the active bucket */}
        {active != null && (
          <line
            x1={model.x(active)}
            x2={model.x(active)}
            y1={22}
            y2={H - 26}
            stroke="var(--sf-text-muted)"
            strokeWidth="1"
            strokeDasharray="1 3"
            opacity="0.7"
          />
        )}

        {/* Floating data card for the active bucket (transparent) */}
        {activeCard && (
          <g pointerEvents="none">
            <rect
              x={activeCard.x}
              y={activeCard.y}
              width={activeCard.w}
              height={activeCard.h}
              rx="6"
              fill="var(--sf-surface)"
              fillOpacity="0.6"
              stroke="var(--sf-border)"
            />
            <text
              x={activeCard.x + fs(8)}
              y={activeCard.y + fs(13)}
              fontSize={fs(8)}
              fill="var(--sf-faint)"
              style={{ letterSpacing: "0.05em" }}
            >
              {activeCard.date}
            </text>
            {activeCard.rows.map((r, ri) => {
              const rowY = activeCard.y + fs(28) + ri * fs(14);
              return (
                <g key={r.label}>
                  {r.dot && (
                    <circle cx={activeCard.x + fs(11)} cy={rowY - fs(3)} r={fs(3)} fill={r.color} />
                  )}
                  <text
                    x={activeCard.x + fs(19)}
                    y={rowY}
                    fontSize={fs(8)}
                    fill="var(--sf-text-muted)"
                  >
                    {r.label}:
                  </text>
                  <text
                    x={activeCard.x + activeCard.w - fs(8)}
                    y={rowY}
                    textAnchor="end"
                    fontSize={fs(8.5)}
                    fontWeight="700"
                    fill={r.color}
                  >
                    {r.value}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Hit zones — pointer-driven so touch taps work on phones. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={model.x(i) - model.band / 2}
            y={22}
            width={model.band}
            height={H - 22 - 26}
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
            key={`tick-${points[i].date}`}
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
