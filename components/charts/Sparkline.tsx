"use client";

import { useMemo } from "react";

interface SparklineProps {
  /** Ordered values (oldest → newest). */
  values: number[];
  /** Stroke color; defaults to the brand primary. */
  color?: string;
  /** Paint the gradient area under the line. */
  area?: boolean;
  height?: number;
  className?: string;
  /** Accessible description of the series. */
  ariaLabel?: string;
  /** Highlight the last point with a dot. */
  showDot?: boolean;
}

/**
 * Compact trend line for stat tiles and card headers. Stretches to its
 * container width (viewBox units), smooth Catmull-Rom curve, optional
 * gradient fill and last-point marker. Pure SVG — no chart library.
 */
export function Sparkline({
  values,
  color = "var(--sf-primary)",
  area = true,
  height = 36,
  className = "",
  ariaLabel,
  showDot = true,
}: SparklineProps) {
  const W = 100;
  const H = 30;

  const model = useMemo(() => {
    const clean = values.filter((v) => Number.isFinite(v));
    if (clean.length < 2) return null;
    const max = Math.max(...clean);
    const min = Math.min(...clean);
    const span = max - min || 1;
    const x = (i: number) => (i / (clean.length - 1)) * W;
    const y = (v: number) => H - 2 - ((v - min) / span) * (H - 6);
    const pts = clean.map((v, i) => [x(i), y(v)] as const);

    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    const last = pts[pts.length - 1];
    return { d, area: `${d} L${W},${H} L0,${H} Z`, last };
  }, [values]);

  if (!model) {
    // Flat placeholder rule keeps tile heights identical with or without data.
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        className={`w-full ${className}`}
        aria-hidden
      >
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--sf-border)" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }

  const gid = `sf-spark-${Math.abs(hash(model.d + color))}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      className={`w-full ${className}`}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={model.area} fill={`url(#${gid})`} />
        </>
      )}
      <path
        d={model.d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDot && (
        <circle cx={model.last[0]} cy={model.last[1]} r="2.4" fill={color} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
