"use client";

import { useMemo, useState } from "react";
import { formatShortDate } from "@/utils/format";

export interface TrendPoint {
  date: string; // ISO
  income: number;
  expense: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  locale?: string;
}

/**
 * Stock-style cash-flow chart: smooth cubic curves through the data, dense
 * ruled grid, x-axis date ticks, subtle area under the outflow series,
 * high/low markers, last-value tag, hover crosshair with readout, and a
 * line-draw entrance animation. Series colors follow the mobile rule
 * (income = green; outflow = indigo dark / rust light via --sf-expense-series).
 */
export function TrendChart({ points, locale = "en-US" }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const expenseColor = "var(--sf-expense-series)";
  const W = 680;
  const H = 240;
  const PAD = { top: 18, right: 64, bottom: 26, left: 54 };

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
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    };

    const incomePath = smoothPath((p) => p.income);
    const expensePath = smoothPath((p) => p.expense);
    const areaPath =
      expensePath +
      ` L${x(points.length - 1).toFixed(1)},${(H - PAD.bottom).toFixed(1)}` +
      ` L${x(0).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

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

    const compact = (v: number) =>
      Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);

    return {
      max,
      x,
      y,
      incomePath,
      expensePath,
      areaPath,
      maxIdx,
      minIdx,
      tickIdx,
      gridValues: [0, max * 0.25, max * 0.5, max * 0.75, max] as number[],
      compact,
    };
  }, [points, locale]);

  if (!model) {
    return (
      <div className="flex h-[240px] items-center justify-center border border-dashed border-border">
        <p className="caps">No entries in range</p>
      </div>
    );
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const lastPoint = points[points.length - 1];

  return (
    <div>
      {/* Readout strip (hover) */}
      <div className="mb-1 flex h-5 items-center justify-between">
        <span className="stamp">
          {points.length > 1
            ? `${formatShortDate(points[0].date, locale)} — ${formatShortDate(lastPoint.date, locale)}`
            : ""}
        </span>
        {hovered && (
          <p className="numeric text-xs font-bold text-text">
            <span className="caps mr-2 !text-faint">{formatShortDate(hovered.date, locale)}</span>
            <span className="text-income">IN {model.compact(hovered.income)}</span>
            <span className="mx-1.5 text-faint">·</span>
            <span style={{ color: expenseColor }}>OUT {model.compact(hovered.expense)}</span>
          </p>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Income and expense trend">
        <defs>
          <linearGradient id="sf-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={expenseColor} stopOpacity="0.13" />
            <stop offset="100%" stopColor={expenseColor} stopOpacity="0.01" />
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
              y={model.y(v) + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="var(--sf-faint)"
              style={{ letterSpacing: "0.05em" }}
            >
              {model.compact(v)}
            </text>
          </g>
        ))}

        {/* Area + curves */}
        <path d={model.areaPath} fill="url(#sf-area)" />
        <path
          d={model.incomePath}
          fill="none"
          stroke="var(--sf-income)"
          strokeWidth="1.75"
          strokeLinecap="round"
          className="chart-draw chart-draw-delay"
        />
        <path
          d={model.expensePath}
          fill="none"
          stroke={expenseColor}
          strokeWidth="2"
          strokeLinecap="round"
          className="chart-draw"
        />

        {/* High / low markers (outflow) */}
        {points.length > 2 && (
          <g>
            <rect
              x={model.x(model.maxIdx) - 2.5}
              y={model.y(points[model.maxIdx].expense) - 2.5}
              width="5"
              height="5"
              fill={expenseColor}
            />
            <text
              x={model.x(model.maxIdx)}
              y={model.y(points[model.maxIdx].expense) - 7}
              textAnchor="middle"
              fontSize="8"
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
              fontSize="8"
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
            y={model.y(lastPoint.expense) - 9}
            width={PAD.right - 12}
            height="18"
            fill={expenseColor}
          />
          <text
            x={W - PAD.right + 6 + (PAD.right - 12) / 2}
            y={model.y(lastPoint.expense) + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="var(--sf-surface)"
          >
            {model.compact(lastPoint.expense)}
          </text>
        </g>

        {/* Hover crosshair */}
        {hovered && (
          <g>
            <line
              x1={model.x(hoverIndex!)}
              x2={model.x(hoverIndex!)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--sf-text-muted)"
              strokeWidth="1"
              strokeDasharray="1 3"
            />
            <rect
              x={model.x(hoverIndex!) - 3}
              y={model.y(hovered.expense) - 3}
              width="6"
              height="6"
              fill={expenseColor}
              stroke="var(--sf-surface)"
              strokeWidth="1"
            />
            <rect
              x={model.x(hoverIndex!) - 3}
              y={model.y(hovered.income) - 3}
              width="6"
              height="6"
              fill="var(--sf-income)"
              stroke="var(--sf-surface)"
              strokeWidth="1"
            />
          </g>
        )}

        {/* Hit zones */}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={model.x(i) - (W - PAD.left - PAD.right) / (points.length * 2)}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / points.length}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}

        {/* X ticks */}
        {model.tickIdx.map((i) => (
          <text
            key={points[i].date}
            x={model.x(i)}
            y={H - 7}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize="9"
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
