"use client";

import type { ReactNode } from "react";

interface ProgressRingProps {
  /** 0–1 (values above 1 clamp visually but stay reportable). */
  pct: number;
  size?: number;
  strokeWidth?: number;
  /** Arc color; defaults to brand primary. */
  color?: string;
  trackColor?: string;
  /** Centered content (figure/label). */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * Circular gauge for budget usage, savings rate and paid-slot progress.
 * Arc animates its dash on mount via the same reduced-motion discipline as
 * the line charts. Over-budget states pass color={danger}.
 */
export function ProgressRing({
  pct,
  size = 104,
  strokeWidth = 9,
  color = "var(--sf-primary)",
  trackColor = "var(--sf-surface-elevated)",
  children,
  className = "",
  ariaLabel,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 1));

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(pct * 100)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${(clamped * c).toFixed(2)} ${c.toFixed(2)}`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
