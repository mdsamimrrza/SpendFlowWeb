"use client";

export interface DayDatum {
  /** Calendar day, ISO `YYYY-MM-DD`. */
  iso: string;
  value: number;
}

interface DailyHeatProps {
  /** Consecutive days of the cycle up to today. */
  days: DayDatum[];
  locale: string;
  formatValue: (n: number) => string;
  onDayTap?: (iso: string) => void;
  /** ISO today — the cell gets a brand ring. */
  todayISO?: string;
  /** i18n: legend ends + busiest chip. */
  labels: { less: string; more: string; busiest: string };
}

const INTENSITY_STOPS = [10, 20, 30, 40, 50];

/** Intensity alpha for a value (0 → no fill). Capped at ~50% so the digit
 *  stays readable: cells are always a TINT (never saturated), and the day
 *  number is drawn in the theme text color on every cell. */
function alpha(v: number, max: number): number {
  if (v <= 0) return 0;
  return 0.1 + 0.4 * Math.sqrt(Math.min(v / max, 1));
}

/**
 * Daily rhythm as a calendar heat grid: cycle days laid out on real weekday
 * columns, each cell shaded by that day's outflow. A visually distinct
 * sibling to the line/bar charts — scannable at phone width, ≥40 px cells,
 * tap drills into History for that day.
 */
export function DailyHeat({ days, locale, formatValue, onDayTap, todayISO, labels }: DailyHeatProps) {
  if (days.length === 0) return null;

  const max = Math.max(...days.map((d) => d.value), 1);
  // Weekday headers (Sun-first), localized narrow.
  const anchorSunday = new Date(2024, 0, 7); // known Sunday
  const headers = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchorSunday);
    d.setDate(anchorSunday.getDate() + i);
    return new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d);
  });
  const firstOffset = new Date(`${days[0].iso}T00:00:00`).getDay();
  let busiest: DayDatum | null = null;
  for (const d of days) if (!busiest || d.value > busiest.value) busiest = d;
  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));

  return (
    <div>
      {/* Weekday header row — same column template as the cells so the
          letters sit directly above their columns. Cells are capped at 44px
          (still a valid tap target) so the grid never balloons into giant
          squares on wide panels. */}
      <div className="grid w-fit grid-cols-[repeat(7,minmax(0,44px))] gap-1.5">
        {headers.map((h, i) => (
          <span key={i} className="pb-1 text-center text-[10px] font-bold text-faint" aria-hidden>
            {h}
          </span>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid w-fit grid-cols-[repeat(7,minmax(0,44px))] gap-1.5">
        {Array.from({ length: firstOffset }).map((_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const a = alpha(d.value, max);
          const cell = (
            <span
              className={`flex aspect-square min-h-10 w-full items-center justify-center rounded-lg text-[12px] font-bold transition-colors ${
                d.value > 0 ? "text-text" : "text-faint"
              } ${d.iso === todayISO ? "ring-2 ring-primary ring-offset-1 ring-offset-surface" : ""}`}
              style={{
                backgroundColor: d.value > 0 ? `color-mix(in srgb, var(--sf-expense-series) ${Math.round(a * 100)}%, transparent)` : "var(--sf-surface-elevated)",
              }}
            >
              {Number(d.iso.slice(8))}
            </span>
          );
          return onDayTap ? (
            <button
              key={d.iso}
              onClick={() => onDayTap(d.iso)}
              className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${fmtDay(d.iso)} · ${formatValue(d.value)}`}
            >
              {cell}
            </button>
          ) : (
            <div key={d.iso} className="min-w-0" title={`${fmtDay(d.iso)} · ${formatValue(d.value)}`}>
              {cell}
            </div>
          );
        })}
      </div>

      {/* Legend + busiest-day chip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{labels.less}</span>
          {INTENSITY_STOPS.map((stop) => (
            <span
              key={stop}
              aria-hidden
              className="h-3.5 w-3.5 rounded-[5px]"
              style={{
                backgroundColor: `color-mix(in srgb, var(--sf-expense-series) ${stop}%, transparent)`,
              }}
            />
          ))}
          <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{labels.more}</span>
        </div>
        {busiest && busiest.value > 0 && (
          <span className="inline-flex h-7 items-center rounded-full bg-surface-elevated px-2.5 text-[11px] text-faint">
            {labels.busiest}{" "}
            <span className="numeric font-bold text-text">
              {fmtDay(busiest.iso)} · {formatValue(busiest.value)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
