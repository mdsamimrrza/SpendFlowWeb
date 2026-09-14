"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface HeatCalendarProps {
  /** ISO date (YYYY-MM-DD) → intensity value (e.g. money spent that day). */
  values: Record<string, number>;
  locale?: string;
  /** Start month as { year, month: 0-11 }; defaults to current month. */
  initialMonth?: { year: number; month: number };
  /** Hide the month switcher (fixed single-month render). */
  fixedMonth?: boolean;
  /** Formats the tooltip/aria text for a day. */
  formatValue?: (n: number) => string;
  /** Cells can deep-link: tap a day to open the register for that date. */
  onDayTap?: (iso: string) => void;
}

/**
 * Spending-intensity calendar (GitHub-contributions style, ledger flavored).
 * Weeks as columns, Mon–Sun rows; five quantile buckets drive the tint ramp
 * (brand color at low opacity → full). Tap a cell to deep-link that day
 * when onDayTap is provided. Fully token-driven — no raw hex.
 */
export function HeatCalendar({
  values,
  locale = "en-US",
  initialMonth,
  fixedMonth = false,
  formatValue,
  onDayTap,
}: HeatCalendarProps) {
  const today = new Date();
  const [month, setMonth] = useState(
    () => initialMonth ?? { year: today.getFullYear(), month: today.getMonth() },
  );
  const [hovered, setHovered] = useState<{ iso: string; v: number } | null>(null);

  const { weeks, monthLabel, max } = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const last = new Date(month.year, month.month + 1, 0);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Monday-first grid covering the whole month.
    const startDow = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startDow);
    const wk: { iso: string; day: number; inMonth: boolean }[][] = [];
    const cursor = new Date(gridStart);
    let guard = 0;
    do {
      const col: { iso: string; day: number; inMonth: boolean }[] = [];
      for (let r = 0; r < 7; r++) {
        col.push({
          iso: iso(cursor),
          day: cursor.getDate(),
          inMonth: cursor.getMonth() === month.month,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      wk.push(col);
      guard += 1;
    } while ((cursor.getMonth() === month.month || cursor.getDay() !== 1) && guard < 7);
    const valuesMax = Math.max(...Object.values(values), 0);
    return {
      weeks: wk,
      monthLabel: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(first),
      max: valuesMax,
    };
  }, [month, values, locale]);

  // Quantile ramp: bucket index 0..4 from value/max.
  const bucket = (v: number) => {
    if (!v || max <= 0) return -1;
    const r = v / max;
    if (r > 0.75) return 4;
    if (r > 0.5) return 3;
    if (r > 0.25) return 2;
    if (r > 0.08) return 1;
    return 0;
  };
  const TINTS = ["var(--sf-primary)", "var(--sf-primary)"];
  const tintFor = (b: number): string => {
    if (b < 0) return "var(--sf-surface-elevated)";
    if (b === 0) return "color-mix(in srgb, var(--sf-primary) 22%, transparent)";
    if (b === 1) return "color-mix(in srgb, var(--sf-primary) 42%, transparent)";
    if (b === 2) return "color-mix(in srgb, var(--sf-primary) 64%, transparent)";
    if (b === 3) return "color-mix(in srgb, var(--sf-primary) 82%, transparent)";
    return TINTS[1];
  };

  const shift = (n: number) => {
    setMonth((m) => {
      const d = new Date(m.year, m.month + n, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setHovered(null);
  };
  const isCurrentMonth = month.year === today.getFullYear() && month.month === today.getMonth();
  const atFuture = new Date(month.year, month.month, 1) >= new Date(today.getFullYear(), today.getMonth(), 1);

  const dowFmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const dowLabels = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    dowFmt.format(new Date(2024, 0, d)), // Mon..Sun of a known Monday week
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-bold text-text">{monthLabel}</p>
        {!fixedMonth && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted transition hover:border-primary hover:text-primary active:scale-95"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => shift(1)}
              disabled={atFuture}
              aria-label="Next month"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted transition hover:border-primary hover:text-primary active:scale-95 disabled:opacity-35"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-1 sm:gap-1.5">
        <div className="grid grid-rows-7 gap-1 sm:gap-1.5">
          {dowLabels.map((l, i) => (
            <span key={i} className="flex h-full items-center text-[9px] font-bold text-faint">
              {i % 2 === 1 ? l : ""}
            </span>
          ))}
        </div>
        <div className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-1 sm:gap-1.5">
          {weeks.map((col, ci) =>
            col.map((cell) => {
              const v = values[cell.iso] ?? 0;
              const b = bucket(v);
              const future = cell.iso > isoOf(today);
              const title = `${cell.iso}${v > 0 && formatValue ? ` · ${formatValue(v)}` : ""}`;
              const inner = (
                <span
                  className={`flex aspect-square w-full items-center justify-center rounded-[5px] text-[9px] font-semibold sm:rounded-md sm:text-[10px] ${
                    !cell.inMonth || future ? "opacity-25" : ""
                  } ${b >= 2 ? "text-white" : "text-text-muted"}`}
                  style={{
                    backgroundColor: future && !cell.inMonth ? "transparent" : tintFor(b),
                  }}
                >
                  {cell.day}
                </span>
              );
              return onDayTap && cell.inMonth && !future ? (
                <button
                  key={`${ci}-${cell.iso}`}
                  onClick={() => onDayTap(cell.iso)}
                  onMouseEnter={() => setHovered({ iso: cell.iso, v })}
                  onMouseLeave={() => setHovered(null)}
                  title={title}
                  aria-label={title}
                  className="min-w-0 rounded-[5px] transition hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:rounded-md"
                >
                  {inner}
                </button>
              ) : (
                <span
                  key={`${ci}-${cell.iso}`}
                  title={cell.inMonth ? title : undefined}
                  onMouseEnter={() => cell.inMonth && !future && setHovered({ iso: cell.iso, v })}
                  onMouseLeave={() => setHovered(null)}
                  className="min-w-0"
                  aria-hidden={!cell.inMonth}
                >
                  {inner}
                </span>
              );
            }),
          )}
        </div>
      </div>

      {/* Readout + legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="numeric min-h-[14px] truncate text-[11px] text-text-muted">
          {hovered && formatValue ? (
            <>
              <span className="font-bold text-text">{hovered.iso}</span> · {formatValue(hovered.v)}
            </>
          ) : (
            <span className="text-faint">Tap a day to open that date in History</span>
          )}
        </p>
        <span className="flex items-center gap-1 text-[10px] text-faint">
          Less
          {[0, 1, 2, 3, 4].map((b) => (
            <span key={b} className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: tintFor(b) }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
