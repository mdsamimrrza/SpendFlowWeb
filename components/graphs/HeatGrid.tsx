"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toISODate, todayISO } from "@/utils/format";

/**
 * Month spending calendar: one cell per day tinted by that day's outflow,
 * today ringed, future days dimmed and inert. Hovering/focusing a day with
 * spending raises a styled tooltip (pretty date + amount – the native
 * title pill is gone). Cells stagger-fade in (`.cell-in`), the whole grid
 * re-animates when the month flips (keyed by the caller). Sunday-first
 * weeks.
 */
export function HeatGrid({
  year,
  month,
  spend,
  formatted,
  locale,
  onPrevMonth,
  onNextMonth,
  canNextMonth,
  onDayTap,
  totalLabel,
}: {
  year: number;
  month: number; // 0-based
  spend: Record<string, number>;
  formatted: (n: number) => string;
  locale: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canNextMonth: boolean;
  onDayTap: (iso: string) => void;
  totalLabel: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay(); // 0 = Sunday
  const max = Math.max(0, ...Object.values(spend));
  const todayStr = todayISO();

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
      new Date(2023, 0, 1 + i), // Jan 1 2023 was a Sunday
    ),
  );
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${iso}T00:00:00`));

  let monthTotal = 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold capitalize text-text">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Previous month"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-text-muted transition-colors hover:border-faint hover:text-text"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            disabled={!canNextMonth}
            aria-label="Next month"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-text-muted transition-colors hover:border-faint hover:text-text disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdays.map((d, i) => (
          <span key={i} className="text-center text-[10px] font-medium text-faint">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" key={`${year}-${month}`}>
        {Array.from({ length: startWeekday }).map((_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = toISODate(new Date(year, month, day));
          const value = spend[iso] ?? 0;
          monthTotal += value;
          const t = max > 0 && value > 0 ? Math.min(1, value / max) : 0;
          const future = iso > todayStr;
          const isToday = iso === todayStr;
          const bg =
            t > 0
              ? `color-mix(in srgb, var(--sf-primary) ${Math.round(12 + t * 68)}%, var(--sf-surface))`
              : "var(--sf-cell-idle)";
          const ink = t > 0.55 ? "var(--sf-primary-ink)" : t > 0 ? "var(--sf-text)" : "var(--sf-faint)";
          return (
            <button
              key={iso}
              type="button"
              disabled={future}
              onClick={() => onDayTap(iso)}
              onMouseEnter={() => setHovered(iso)}
              onMouseLeave={() => setHovered((h) => (h === iso ? null : h))}
              onFocus={() => setHovered(iso)}
              onBlur={() => setHovered((h) => (h === iso ? null : h))}
              aria-label={`${iso}${value > 0 ? `, ${formatted(value)}` : ""}`}
              className={`cell-in numeric relative grid h-9 place-items-center rounded-md text-[10.5px] transition-transform hover:scale-[1.06] disabled:cursor-default disabled:opacity-35 ${
                isToday ? "ring-[1.5px] ring-primary ring-offset-1 ring-offset-surface" : ""
              }`}
              style={{
                ["--d" as string]: `${(startWeekday + i) * 7}ms`,
                background: bg,
                color: ink,
              }}
            >
              {day}
              {hovered === iso && (
                <span
                  role="tooltip"
                  className="sf-pop pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--sf-tooltip-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--sf-tooltip-ink)] shadow-pop"
                >
                  {dayLabel(iso)}
                  <span aria-hidden className="mx-1.5 opacity-50">
                    ·
                  </span>
                  <span className="numeric">{formatted(value)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-[11.5px] text-text-muted">{totalLabel}</span>
        <span className="numeric text-[13px] font-semibold text-text">
          {formatted(monthTotal)}
        </span>
      </div>
    </div>
  );
}
