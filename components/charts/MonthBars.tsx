"use client";

import { useMemo } from "react";
import { formatShortDate } from "@/utils/format";
import type { TrendPoint } from "@/components/charts/TrendChart";

interface MonthBarsProps {
  /** Monthly buckets (income/expense per month). */
  points: TrendPoint[];
  locale?: string;
  /** Money formatter for tooltips. */
  formatValue?: (n: number) => string;
  height?: number;
  className?: string;
  onMonthTap?: (monthKey: string) => void;
}

/**
 * Grouped monthly income-vs-expense bars with a net hairline. One column per
 * month: income bar (green) + expense bar (series color) side by side, a
 * small net tick under each pair. Last 12 buckets are shown; the pair is
 * labeled by short month on phones.
 */
export function MonthBars({ points, locale = "en-US", formatValue, height = 150, className = "", onMonthTap }: MonthBarsProps) {
  const model = useMemo(() => {
    const last = points.slice(-12);
    const max = Math.max(...last.flatMap((p) => [p.income, p.expense]), 1);
    return { last, max };
  }, [points]);

  if (model.last.length === 0) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-border ${className}`}
        style={{ height }}
      >
        <span className="caps">No monthly data yet</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className="flex items-end justify-between gap-1 sm:gap-2"
        style={{ height }}
        role="img"
        aria-label="Income versus expense by month"
      >
        {model.last.map((p) => {
          const key = p.date.slice(0, 7);
          const iH = Math.max((p.income / model.max) * 100, p.income > 0 ? 3 : 1);
          const eH = Math.max((p.expense / model.max) * 100, p.expense > 0 ? 3 : 1);
          const net = p.income - p.expense;
          return (
            <button
              key={key}
              onClick={() => onMonthTap?.(key)}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${key} · IN ${formatValue ? formatValue(p.income) : p.income} · OUT ${formatValue ? formatValue(p.expense) : p.expense}`}
              disabled={!onMonthTap}
            >
              <div className="flex h-full items-end justify-center gap-[3px]">
                <div
                  className="w-[42%] max-w-[14px] rounded-t bg-income transition-all duration-500 group-hover:opacity-80"
                  style={{ height: `${iH}%` }}
                />
                <div
                  className="w-[42%] max-w-[14px] rounded-t transition-all duration-500 group-hover:opacity-80"
                  style={{ height: `${eH}%`, backgroundColor: "var(--sf-expense-series)" }}
                />
              </div>
              {/* Net tick — above the rule for positive, below for negative */}
              <span
                className={`mt-1 block h-[3px] w-full rounded-full ${net >= 0 ? "bg-income/60" : "bg-danger/60"}`}
                aria-hidden
              />
              <span className="mt-1 block w-full truncate text-center text-[9px] text-faint sm:text-[10px]">
                {formatShortDate(p.date, locale).split(" ")[0]?.toUpperCase() ?? key.slice(5, 7)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-wide">
        <span className="flex items-center gap-1.5 text-income">
          <span className="h-2 w-2 rounded-sm bg-income" aria-hidden /> Income
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--sf-expense-series)" }}>
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--sf-expense-series)" }} aria-hidden /> Expense
        </span>
      </div>
    </div>
  );
}
