"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatShortDate } from "@/utils/format";

export interface TrendPoint {
  date: string; // ISO
  income: number;
  expense: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  locale?: string;
  /** Compact variant for embedding in narrow cards (shorter, no HI/LO tags). */
  compact?: boolean;
}

/**
 * Cash-flow combo chart: outflow intensity as soft bars behind smoothed
 * income/outflow curves, with a gradient area under the outflow. Crosshair
 * works with mouse hover AND touch tap (tap pins the readout, tap again or
 * leave clears it) so the phone experience matches desktop. Series colors
 * follow the mobile rule (income = green; outflow = theme expense series).
 */
export function TrendChart({ points, locale = "en-US", compact = false }: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);

  const expenseColor = "var(--sf-expense-series)";
  const W = 680;
  const H = compact ? 180 : 240;

  // The SVG scales its 680-unit viewBox to the container, which shrinks text
  // to ~half size on a 390 px phone. Measure the container and grow font
  // sizes by the inverse factor so on-screen text keeps its designed size.
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
  const PAD = { top: 18, right: 64, bottom: 26, left: 40 + 14 * fontScale };

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.flatMap((p) => [p.income, p.expense]);
    const max = Math.max(...values, 1);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

    // Smooth path: Catmull-Rom → cubic Bézier through every data point.
    // Control points are clamped to the plot band so the spline can never
    // overshoot below the zero baseline (a sharp spike + empty buckets after
    // it otherwise produce a visible negative-value dip).
    const yTop = PAD.top;
    const yBase = y(0);
    const clampY = (v: number) => Math.max(yTop, Math.min(v, yBase));
    const smoothPath = (get: (p: TrendPoint) => number) => {
      const pts = points.map((p, i) => [x(i), y(get(p))] as const);
      if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
        d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    };

    const incomePath = smoothPath((p) => p.income);
    const expensePath = smoothPath((p) => p.expense);
    const closeArea = (path: string) =>
      path +
      ` L${x(points.length - 1).toFixed(1)},${(H - PAD.bottom).toFixed(1)}` +
      ` L${x(0).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;
    const incomeAreaPath = closeArea(incomePath);
    const areaPath = closeArea(expensePath);

    // High / low markers on the outflow series.
    let maxIdx = 0;
    let minIdx = 0;
    points.forEach((p, i) => {
      if (p.expense > points[maxIdx].expense) maxIdx = i;
      if (p.expense < points[minIdx].expense) minIdx = i;
    });

    // X ticks: ~5 evenly spaced indices.
    const tickCount = Math.min(5, points.length);
    const tickIdx = Array.from({ length: tickCount }, (_, k) =>
      Math.round((k / (tickCount - 1 || 1)) * (points.length - 1)),
    );

    const compact_ = (v: number) =>
      Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);

    // Bars only make sense while buckets are wide enough to stay legible.
    const barW = Math.max(Math.min((innerW / points.length) * 0.55, 14), 2);

    return {
      max,
      x,
      y,
      barW,
      incomePath,
      incomeAreaPath,
      expensePath,
      areaPath,
      maxIdx,
      minIdx,
      tickIdx,
      gridValues: [0, max * 0.25, max * 0.5, max * 0.75, max] as number[],
      compact: compact_,
    };
  }, [points, locale, H, fontScale]);

  if (!model) {
    return (
      <div ref={wrapRef} className="flex h-[240px] items-center justify-center border border-dashed border-border">
        <p className="caps">No entries in range</p>
      </div>
    );
  }

  const active = hover ?? pin;
  const hovered = active != null ? points[active] : null;
  const lastPoint = points[points.length - 1];

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
            ? `${formatShortDate(points[0].date, locale)} — ${formatShortDate(lastPoint.date, locale)}`
            : ""}
        </span>
        {hovered && (
          <p className="numeric flex shrink-0 items-baseline gap-1.5 text-xs font-bold text-text">
            <span className="caps !text-faint">{formatShortDate(hovered.date, locale)}</span>
            <span className="text-income">IN {model.compact(hovered.income)}</span>
            <span className="text-faint">·</span>
            <span style={{ color: expenseColor }}>OUT {model.compact(hovered.expense)}</span>
            <span className="text-faint">·</span>
            <span className={hovered.income - hovered.expense >= 0 ? "text-income" : "text-danger"}>
              NET {hovered.income - hovered.expense >= 0 ? "+" : "−"}
              {model.compact(Math.abs(hovered.income - hovered.expense))}
            </span>
          </p>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-manipulation" role="img" aria-label="Income and expense trend">
        <defs>
          <linearGradient id="sf-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={expenseColor} stopOpacity="0.13" />
            <stop offset="100%" stopColor={expenseColor} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="sf-area-income" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sf-income)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--sf-income)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid + y labels */}
        {model.gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={model.y(v)}
              y2={model.y(v)}
              stroke="var(--sf-border)"
              strokeWidth={v === 0 ? 1.25 : 0.75}
              strokeDasharray={v === 0 ? undefined : "2 4"}
              opacity={v === 0 ? 1 : 0.7}
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

        {/* Outflow intensity bars behind the curves */}
        {points.map((p, i) => {
          if (p.expense <= 0) return null;
          const h = Math.max(H - PAD.bottom - model.y(p.expense), 2);
          return (
            <rect
              key={`bar-${p.date}`}
              x={model.x(i) - model.barW / 2}
              y={H - PAD.bottom - h}
              width={model.barW}
              height={h}
              rx={model.barW / 2}
              fill={expenseColor}
              opacity={active === i ? 0.4 : 0.16}
              style={{ transition: "opacity 160ms ease" }}
            />
          );
        })}

        {/* Areas + curves */}
        <path d={model.incomeAreaPath} fill="url(#sf-area-income)" />
        <path d={model.areaPath} fill="url(#sf-area)" />
        <path
          d={model.incomePath}
          fill="none"
          stroke="var(--sf-income)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw chart-draw-delay"
        />
        <path
          d={model.expensePath}
          fill="none"
          stroke={expenseColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw"
        />

        {/* High / low markers (outflow) */}
        {!compact && points.length > 2 && (
          <g>
            <circle
              cx={model.x(model.maxIdx)}
              cy={model.y(points[model.maxIdx].expense)}
              r="3"
              fill={expenseColor}
            />
            <text
              x={model.x(model.maxIdx)}
              y={model.y(points[model.maxIdx].expense) - 7}
              textAnchor={model.maxIdx >= points.length - 2 ? "end" : "middle"}
              fontSize={fs(8)}
              fontWeight="700"
              fill={expenseColor}
              style={{ letterSpacing: "0.06em" }}
            >
              HI {model.compact(points[model.maxIdx].expense)}
            </text>
            <circle
              cx={model.x(model.minIdx)}
              cy={model.y(points[model.minIdx].expense)}
              r="2.5"
              fill="var(--sf-surface)"
              stroke={expenseColor}
              strokeWidth="1.25"
            />
            <text
              x={model.x(model.minIdx) + (model.minIdx === 0 ? 4 : model.minIdx === points.length - 1 ? -4 : 0)}
              y={
                model.y(points[model.minIdx].expense) > H - 64
                  ? model.y(points[model.minIdx].expense) - 8
                  : model.y(points[model.minIdx].expense) + 13
              }
              textAnchor={model.minIdx === 0 ? "start" : model.minIdx === points.length - 1 ? "end" : "middle"}
              fontSize={fs(8)}
              fontWeight="700"
              fill="var(--sf-faint)"
              style={{ letterSpacing: "0.06em" }}
            >
              LO {model.compact(points[model.minIdx].expense)}
            </text>
          </g>
        )}

        {/* Last-value tag */}
        <g>
          <line
            x1={model.x(points.length - 1)}
            x2={W - PAD.right + 6}
            y1={model.y(lastPoint.expense)}
            y2={model.y(lastPoint.expense)}
            stroke={expenseColor}
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <rect
            x={W - PAD.right + 6}
            y={model.y(lastPoint.expense) - fs(9)}
            width={PAD.right - 6}
            height={fs(18)}
            rx={5}
            fill={expenseColor}
          />
          <text
            x={W - PAD.right + 6 + (PAD.right - 6) / 2}
            y={model.y(lastPoint.expense) + fs(3.5)}
            textAnchor="middle"
            fontSize={fs(8.5)}
            fontWeight="700"
            fill="var(--sf-surface)"
          >
            {model.compact(lastPoint.expense)}
          </text>
        </g>

        {/* Crosshair on the active bucket */}
        {hovered && active != null && (
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
              cy={model.y(hovered.expense)}
              r={4}
              fill={expenseColor}
              stroke="var(--sf-surface)"
              strokeWidth="1.5"
            />
            <circle
              cx={model.x(active)}
              cy={model.y(hovered.income)}
              r={4}
              fill="var(--sf-income)"
              stroke="var(--sf-surface)"
              strokeWidth="1.5"
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
            {formatShortDate(points[i].date, locale).toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  );
}
