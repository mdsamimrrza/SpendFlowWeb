"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarHeatmapProps {
  year: number;
  /** 0-based month (Date convention). */
  month: number;
  /** ISO date (YYYY-MM-DD) -> expense spent that day (display currency). */
  spend: Record<string, number>;
  /** Privacy-masked money formatter from the host screen. */
  formatted: (n: number) => string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  /** The next button is disabled when the caller says so (e.g. future month). */
  canNextMonth?: boolean;
  /** Optional tap handler (e.g. deep-link the day in History). */
  onDayTap?: (iso: string) => void;
  /** Localized footer label for the month total figure. */
  totalLabel?: string;
}

/* Mobile CalendarModal conventions: Sun-first weekday initials, English
   month labels in every language (mirrored from ui/CalendarModal.tsx). */
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Month calendar spending heatmap (Monarch Reports pattern): Sun-first grid
 * (matching CalendarModal), each day tinted on an intensity scale of the
 * danger token by spend, today outlined, prev/next wired by the caller,
 * optional day tap. Intensity layers scale the token color via opacity -
   no raw hex anywhere.
 */
export function CalendarHeatmap({
  year,
  month,
  spend,
  formatted,
  onPrevMonth,
  onNextMonth,
  canNextMonth = true,
  onDayTap,
  totalLabel = "Month total",
}: CalendarHeatmapProps) {
  const model = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayIso = (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    })();
    const cells: { day: number; iso: string; value: number; level: number }[] = [];
    let monthMax = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const value = spend[iso] ?? 0;
      if (value > monthMax) monthMax = value;
      cells.push({ day: d, iso, value, level: 0 });
    }
    // Four tint levels by relative spend (GitHub-style ramp over the danger hue).
    for (const c of cells) {
      if (c.value > 0 && monthMax > 0) {
        const ratio = c.value / monthMax;
        c.level = ratio > 0.66 ? 4 : ratio > 0.33 ? 3 : 2;
      }
    }
    return { firstDow, cells, todayIso, monthTotal: cells.reduce((s, c) => s + c.value, 0) };
  }, [year, month, spend]);

  // Level -> danger-token layer opacity (bg layer under the day number).
  const LEVEL_OPACITY: Record<number, number> = { 0: 0, 2: 0.16, 3: 0.38, 4: 0.72 };

  return (
    <div>
      {/* Month nav */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-extrabold text-text">
          {MONTH_NAMES[month]} {year}
        </p>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevMonth}
            disabled={!onPrevMonth}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border transition active:scale-90 disabled:opacity-30"
            style={{ backgroundColor: "var(--sf-surface-elevated)" }}
          >
            <ChevronLeft size={14} className="text-text" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            disabled={!onNextMonth || !canNextMonth}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border transition active:scale-90 disabled:opacity-30"
            style={{ backgroundColor: "var(--sf-surface-elevated)" }}
          >
            <ChevronRight size={14} className="text-text" aria-hidden />
          </button>
        </span>
      </div>

      {/* Weekday initials header */}
      <div className="grid grid-cols-7 gap-1 pb-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-bold text-faint">
            {d}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: model.firstDow }).map((_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {model.cells.map((c) => {
          const isToday = c.iso === model.todayIso;
          const opaque = LEVEL_OPACITY[c.level] ?? 0;
          const body = (
            <>
              {opaque > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-md"
                  style={{ backgroundColor: "var(--sf-danger)", opacity: opaque }}
                />
              )}
              <span
                className={`numeric relative text-[11px] ${opaque >= 0.38 ? "font-bold text-white" : "text-text-muted"}`}
              >
                {c.day}
              </span>
            </>
          );
          const cls = `relative flex aspect-square items-center justify-center rounded-md transition-transform ${
            isToday ? "ring-1 ring-primary ring-offset-1 ring-offset-[var(--sf-surface)]" : ""
          }`;
          if (onDayTap && c.value > 0) {
            return (
              <button
                key={c.iso}
                type="button"
                onClick={() => onDayTap(c.iso)}
                title={`${c.iso}: ${formatted(c.value)}`}
                aria-label={`${c.iso}: ${formatted(c.value)}`}
                className={`${cls} active:scale-90`}
                style={{ backgroundColor: "var(--sf-cell-idle)" }}
              >
                {body}
              </button>
            );
          }
          return (
            <span
              key={c.iso}
              title={c.value > 0 ? `${c.iso}: ${formatted(c.value)}` : undefined}
              className={cls}
              style={{ backgroundColor: c.value > 0 ? "var(--sf-cell-idle)" : "transparent" }}
            >
              {body}
            </span>
          );
        })}
      </div>

      {/* Month total footer */}
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="caps-faint">{totalLabel}</span>
        <span className="numeric text-[12.5px] font-extrabold text-text">{formatted(model.monthTotal)}</span>
      </div>
    </div>
  );
}
