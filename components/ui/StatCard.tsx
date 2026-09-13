"use client";

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "income" | "danger" | "brass";
  icon?: ReactNode;
}

const ACCENT_TEXT = {
  primary: "text-primary",
  income: "text-income",
  danger: "text-danger",
  brass: "text-brass",
} as const;

/** KPI tile for dashboard grids (web dashboard pattern). */
export function StatCard({ label, value, sub, accent = "primary", icon }: StatCardProps) {
  return (
    <div className="sf-card flex items-start justify-between p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
        <p className={`numeric mt-1.5 truncate text-[22px] font-extrabold leading-tight ${ACCENT_TEXT[accent]}`}>
          {value}
        </p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-faint">{sub}</p>}
      </div>
      {icon && (
        <div className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
          {icon}
        </div>
      )}
    </div>
  );
}
