"use client";

import type { ReactNode } from "react";

interface HoverCardProps {
  /** Horizontal anchor as a CSS length/percentage (already edge-clamped). */
  left: string;
  /** Vertical anchor as a CSS length (card bottom sits just above this). */
  top: string;
  /** Show the card BELOW the anchor instead of above (top-row cells). */
  below?: boolean;
  children: ReactNode;
}

/**
 * Small frosted detail card that floats beside a hovered/tapped chart
 * element - the generalized version of TrendChart's floating readout.
 * Pointer-transparent, clamps horizontally via the caller's CSS clamp().
 */
export function HoverCard({ left, top, below = false, children }: HoverCardProps) {
  return (
    <div
      role="status"
      className={`pointer-events-none absolute z-20 w-max max-w-[180px] -translate-x-1/2 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 shadow-soft backdrop-blur-sm ${
        below ? "translate-x-0" : "-translate-y-[calc(100%_-_6px)]"
      }`}
      style={{ left, top }}
    >
      {children}
    </div>
  );
}
