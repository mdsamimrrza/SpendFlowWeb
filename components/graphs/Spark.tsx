"use client";

import { useId } from "react";

/**
 * Mini trend line for the pulse plate: a plain polyline over a soft
 * gradient area, drawn once on mount (`.draw` / `.chart-fade`). The SVG
 * stretches to its container; `vector-effect` keeps the stroke weight
 * honest under that stretch. Series colors resolve through the scope's
 * tokens (on the plate: mint/coral/periwinkle).
 */
export function Spark({
  values,
  height = 56,
  className,
}: {
  values: number[];
  height?: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (values.length < 2) return null;

  const W = 100;
  const H = 40;
  const color = "var(--sf-primary)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map(
    (v, i) =>
      [(i / (values.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)] as const,
  );
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${uid})`} className="chart-fade" />
      <g className="wipe-x">
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}
