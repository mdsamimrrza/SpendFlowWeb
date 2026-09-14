"use client";

import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import type { RecurringRuleRow } from "@/services/recurring";
import { nextOccurrences } from "@/services/recurring";

interface UpcomingTimelineProps {
  rules: RecurringRuleRow[];
  locale: string;
  labels: {
    title: string;
    empty: string;
    today: string;
  };
  onOpenRule?: (rule: RecurringRuleRow) => void;
}

interface DueEvent {
  iso: string;
  rules: RecurringRuleRow[];
}

const DAYS = 30;

/**
 * Upcoming 30-day schedule — one chip per day that has at least one active
 * plan slot due, stacked dots show multiple bills on the same day. Swipes
 * horizontally on phones (scroll-x) and spreads edge-to-edge from sm.
 */
export function UpcomingTimeline({ rules, locale, labels, onOpenRule }: UpcomingTimelineProps) {
  const events = useMemo<DueEvent[]>(() => {
    const byDay = new Map<string, RecurringRuleRow[]>();
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + DAYS);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = iso(now);
    const horizon = iso(end);
    const add = (day: string, r: RecurringRuleRow) => {
      const list = byDay.get(day) ?? [];
      if (!list.some((x) => x.id === r.id)) byDay.set(day, [...list, r]);
    };
    for (const r of rules) {
      if (!r.is_active) continue;
      // The chain's open slot may already be overdue — anchor it on today.
      if (r.next_due_date < today) add(today, r);
      // nextOccurrences starts at its `from` argument, so the open slot is
      // the first entry when it is still ahead of us.
      for (const s of nextOccurrences(r.next_due_date, r.frequency, 40, r.interval_days)) {
        if (s >= today && s <= horizon) add(s, r);
      }
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([dayIso, rs]) => ({ iso: dayIso, rules: rs }));
  }, [rules]);

  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const dowFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <section className="panel p-4 sm:p-5" aria-label={labels.title}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarRange size={15} />
        </span>
        <p className="caps">{labels.title}</p>
      </div>

      {events.length === 0 ? (
        <p className="border border-dashed border-border px-3 py-6 text-center">
          <span className="caps">{labels.empty}</span>
        </p>
      ) : (
        <div className="scroll-x -mx-1 max-w-full overflow-x-auto px-1 pb-1 sm:overflow-visible">
          <ol className="flex w-max gap-2 sm:grid sm:w-auto sm:grid-cols-[repeat(auto-fit,minmax(88px,1fr))] sm:gap-1.5">
            {events.slice(0, 14).map((ev) => (
              <li key={ev.iso} className="w-[92px] shrink-0 sm:w-auto">
                <div className="rounded-xl border border-border bg-surface-elevated/40 p-2.5">
                  <p className="caps-faint !text-[9px]">
                    {ev.iso === new Date().toISOString().slice(0, 10)
                      ? labels.today
                      : dowFmt.format(new Date(`${ev.iso}T00:00:00`))}
                  </p>
                  <p className="figures mt-0.5 text-lg font-bold text-text">{dayFmt.format(new Date(`${ev.iso}T00:00:00`))}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ev.rules.slice(0, 4).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onOpenRule?.(r)}
                        title={r.description || r.categories?.name || ""}
                        aria-label={`${r.description || r.categories?.name || "plan"} — ${ev.iso}`}
                        className="h-2.5 w-2.5 rounded-full transition hover:ring-2 hover:ring-primary/50"
                        style={{ backgroundColor: r.categories?.color ?? "var(--sf-primary)" }}
                      />
                    ))}
                    {ev.rules.length > 4 && (
                      <span className="text-[9px] font-bold text-faint">+{ev.rules.length - 4}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
