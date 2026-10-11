"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatShortDate } from "@/utils/format";

export interface NetTrendPoint {
  /** ISO date of the bucket. */
  date: string;
  /** Running net (income - expense, cumulative) at this bucket. */
  net: number;
}

interface TrendAreaProps {
  points: NetTrendPoint[];
  /** Privacy-masked money formatter from the host screen. */
  formatted: (n: number) => string;
  locale?: string;
}

/**
 * Cumulative net-over-time area (Monarch Reports pattern): smooth line with
 * a low-opacity gradient fill down to the zero baseline, dashed zero-line
 * when the net dips negative, crosshair readout on hover (mouse) and tap
 * (pins, like TrendChart). Pure SVG, token colors only.
 */
export function TrendArea({ points, formatted, locale = "en-US" }: TrendAreaProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);

  const W = 680;
  const H = 210;

  // The SVG scales its viewBox to the container; grow font sizes by the
  // inverse factor so on-screen text keeps its designed size (TrendChart's
  // measured approach).
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
    const PAD = { top: 14, right: 12, bottom: 24, left: 12 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const min = Math.min(0, ...points.map((p) => p.net));
    const max = Math.max(0, ...points.map((p) => p.net));
    const span = max - min || 1;
    const round3 = (v: number) => Math.round(v * 1000) / 1000;
    const x = (i: number) =>
      round3(PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW));
    const y = (v: number) => round3(PAD.top + innerH - ((v - min) / span) * innerH);
    const yTop = PAD.top;
    const yBot = PAD.top + innerH;
    const clampY = (v: number) => Math.max(yTop, Math.min(v, yBot));

    // Catmull-Rom -> cubic Bézier, clamped to the plot band.
    const smooth = () => {
      const pts = points.map((p, i) => [x(i), y(p.net)] as const);
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
    const linePath = smooth();
    const y0 = y(0);
    const areaPath =
      linePath +
      ` L${x(points.length - 1).toFixed(1)},${y0.toFixed(1)}` +
      ` L${x(0).toFixed(1)},${y0.toFixed(1)} Z`;

    const tickCount = Math.min(3, points.length);
    const tickIdx = Array.from({ length: tickCount }, (_, k) =>
      Math.round((k / (tickCount - 1 || 1)) * (points.length - 1)),
    );
    return { PAD, min, max, x, y, y0, linePath, areaPath, tickIdx, dips: min < 0 };
  }, [points]);

  if (!model) {
    return (
      <div ref={wrapRef} className="flex h-[190px] items-center justify-center border border-dashed border-border">
        <p className="caps">No entries in range</p>
      </div>
    );
  }

  const active = hover ?? pin;
  const activePoint = active != null ? points[active] : null;

  const indexFromClientX = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    const innerW = W - model.PAD.left - model.PAD.right;
    const ratio = (vx - model.PAD.left) / (innerW || 1);
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Readout strip (hover / pinned) */}
      <div className="mb-1 flex h-5 items-center justify-between gap-2">
        <span className="stamp truncate">
          {points.length > 1
            ? `${formatShortDate(points[0].date, locale)} - ${formatShortDate(points[points.length - 1].date, locale)}`
            : ""}
        </span>
        {activePoint && active != null && (
          <p className="numeric flex shrink-0 items-baseline gap-1.5 text-xs font-bold text-text">
            <span className="caps-faint !text-[10px]">{formatShortDate(activePoint.date, locale)}</span>
            <span className={activePoint.net >= 0 ? "text-income" : "text-danger"}>
              {activePoint.net >= 0 ? "+" : "−"}
              {formatted(Math.abs(activePoint.net))}
            </span>
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-manipulation"
        role="img"
        aria-label="Cumulative net over time"
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") setHover(indexFromClientX(e.clientX, e.currentTarget));
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") setPin(indexFromClientX(e.clientX, e.currentTarget));
        }}
        onClick={(e) => {
          if ((e.nativeEvent as PointerEvent).pointerType === "mouse") {
            const i = indexFromClientX(e.clientX, e.currentTarget);
            setPin((cur) => (cur === i ? null : i));
          }
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="sf-net-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sf-primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--sf-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Dashed zero baseline when the net dips negative */}
        {model.dips && (
          <line
            x1={model.PAD.left}
            x2={W - model.PAD.right}
            y1={model.y0}
            y2={model.y0}
            stroke="var(--sf-faint)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}

        <path d={model.areaPath} fill="url(#sf-net-area)" />
        <path
          d={model.linePath}
          fill="none"
          stroke="var(--sf-primary)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw"
        />

        {/* Crosshair + dot on the active bucket */}
        {activePoint && active != null && (
          <g>
            <line
              x1={model.x(active)}
              x2={model.x(active)}
              y1={model.PAD.top}
              y2={H - model.PAD.bottom}
              stroke="var(--sf-text-muted)"
              strokeWidth="1"
              strokeDasharray="1 3"
            />
            <circle
              cx={model.x(active)}
              cy={model.y(activePoint.net)}
              r={4}
              fill="var(--sf-primary)"
              stroke="var(--sf-surface)"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* X ticks: first / middle / last */}
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
