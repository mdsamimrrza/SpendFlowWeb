"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toISODate } from "@/utils/format";

interface WeekTrendProps {
  /** ISO date → outflow total (display currency, converted). */
  dayMap: Map<string, number>;
  locale: string;
  formatValue: (n: number) => string;
  onDayTap?: (iso: string) => void;
  /** Compact variant (Analytics statement): narrower grid, shorter bars. */
  dense?: boolean;
  labels: {
    heading: string;
    avg: string;
    thisWeek: string;
    lastWeek: string;
    peakDay: string;
    weekTotal: string;
    prevWeek: string;
    nextWeek: string;
  };
}

/** Monday of the week containing d. */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Week trend — the reference "Spending Trend" pattern: exactly seven day
 * cards (Mon–Sun) with weekday, date, intensity bar and compact figure; the
 * peak day of the week wears the brand ring. A ‹ This Week / Last Week /
 * date-range › navigator steps whole weeks (future weeks are never shown).
 * Header carries the range + avg/day, footer the peak day + week total.
 * Cards are a fixed 7-column grid capped in width, so the strip never
 * stretches on wide screens.
 */
export function WeekTrend({ dayMap, locale, formatValue, onDayTap, labels, dense = false }: WeekTrendProps) {
  // Weeks back from the current week (0 = this week). Never future.
  const [offset, setOffset] = useState(0);
  const thisMonday = mondayOf(new Date());
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    return { iso, date: d, value: dayMap.get(iso) ?? 0 };
  });
  const end = days[6].date;

  const weekTotal = days.reduce((s, d) => s + d.value, 0);
  const max = Math.max(...days.map((d) => d.value), 1);
  const peak = days.reduce((a, b) => (b.value > a.value ? b : a), days[0]);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const wdFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const mdFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  const mdYFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });

  const weekLabel =
    offset === 0 ? labels.thisWeek : offset === 1 ? labels.lastWeek : `${mdFmt.format(start)} – ${mdYFmt.format(end)}`;

  return (
    <div>
      {/* Header: overline + week navigator */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="caps !text-text-muted">{labels.heading}</p>
        <div className="flex h-9 items-center gap-0.5 rounded-full bg-surface-elevated p-0.5">
          <button
            onClick={() => setOffset((o) => o + 1)}
            aria-label={labels.prevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface hover:text-text active:scale-[0.95]"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-0 truncate px-1.5 text-center text-xs font-bold text-text">
            {weekLabel}
          </span>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            aria-label={labels.nextWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface hover:text-text active:scale-[0.95] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Range + average line */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold text-faint">
          {mdFmt.format(start)} – {mdYFmt.format(end)}
        </p>
        <p className="text-[11px] text-faint">
          {labels.avg} <span className="numeric font-bold text-text">{formatValue(weekTotal / 7)}</span>
        </p>
      </div>

      {/* Seven day cards — fixed grid, capped width, centered */}
      <div className={`mx-auto mt-3 grid grid-cols-7 gap-1.5 sm:gap-2 ${dense ? "max-w-[430px]" : "max-w-[560px]"}`}>
        {days.map((d) => {
          const pct = Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0);
          const isPeak = d.value > 0 && d.iso === peak.iso;
          const col = (
            <>
              <span className="caps !text-[9px]">{wdFmt.format(d.date)}</span>
              <span className={`numeric mt-0.5 font-extrabold leading-none text-text ${dense ? "text-xs sm:text-sm" : "text-sm sm:text-base"}`}>
                {d.date.getDate()}
              </span>
              <span className={`my-1.5 flex w-1.5 items-end overflow-hidden rounded-full bg-surface-elevated ${dense ? "h-6 sm:h-8" : "h-10 sm:h-12"}`}>
                <span
                  className="w-full rounded-full transition-all duration-300"
                  style={{
                    height: `${d.value > 0 ? pct : 0}%`,
                    backgroundColor: isPeak ? "var(--sf-primary)" : "var(--sf-expense-series)",
                    opacity: d.value > 0 ? 1 : 0.35,
                  }}
                />
              </span>
              <span className="numeric text-[10px] font-semibold text-faint">
                {d.value > 0 ? compact.format(d.value) : "—"}
              </span>
            </>
          );
          const base = `flex min-w-0 flex-col items-center rounded-xl border px-1 transition ${dense ? "py-1.5" : "py-2 sm:py-2.5"}`;
          const look = isPeak
            ? "border-transparent bg-surface-elevated/40 ring-2 ring-primary"
            : "border-border bg-surface-elevated/30";
          return onDayTap ? (
            <button
              key={d.iso}
              onClick={() => onDayTap(d.iso)}
              className={`${base} ${look} hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
              aria-label={`${mdFmt.format(d.date)} · ${formatValue(d.value)}`}
            >
              {col}
            </button>
          ) : (
            <div key={d.iso} className={`${base} ${look}`}>
              {col}
            </div>
          );
        })}
      </div>

      {/* Footer: peak day + week total */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border pt-2.5 text-[11px] text-faint">
        <p>
          {labels.peakDay}:{" "}
          <span className="numeric font-bold text-danger">
            {peak.value > 0 ? formatValue(peak.value) : "—"}
          </span>
        </p>
        <p>
          {labels.weekTotal}:{" "}
          <span className="numeric font-bold text-text">{formatValue(weekTotal)}</span>
        </p>
      </div>
    </div>
  );
}
