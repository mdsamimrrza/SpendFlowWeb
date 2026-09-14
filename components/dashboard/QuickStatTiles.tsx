"use client";

import type { ReactNode } from "react";
import { FitText } from "@/components/ui/FitText";

export interface QuickStat {
  key: string;
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: "primary" | "income" | "danger" | "brass" | "info";
}

const TONE: Record<NonNullable<QuickStat["tone"]>, { text: string; chip: string }> = {
  primary: { text: "text-primary", chip: "bg-primary/10 text-primary" },
  income: { text: "text-income", chip: "bg-income/10 text-income" },
  danger: { text: "text-danger", chip: "bg-rust-tint text-danger" },
  brass: { text: "text-brass", chip: "bg-brass-tint text-brass" },
  info: { text: "text-info", chip: "bg-info/10 text-info" },
};

/**
 * Quick-stats grid — 2-up on phones, 4-up from sm. Modern tile: circular
 * tone-tinted icon chip over a soft elevated surface, label, and a
 * fit-to-width figure with sub-line.
 */
export function QuickStatTiles({ tiles }: { tiles: QuickStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((s) => {
        const tone = TONE[s.tone ?? "primary"];
        return (
          <div
            key={s.key}
            className="panel !rounded-2xl flex flex-col p-4 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {s.icon && (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.chip}`}
                >
                  {s.icon}
                </span>
              )}
              <p className="caps min-w-0 truncate">{s.label}</p>
            </div>
            <div className={`figures mt-2.5 font-bold ${tone.text}`}>
              <FitText basePx={23} minPx={12}>{s.value}</FitText>
            </div>
            {s.sub && <p className="mt-auto truncate pt-0.5 text-[11px] text-faint">{s.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}
