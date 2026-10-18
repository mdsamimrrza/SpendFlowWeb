"use client";

import { useMemo } from "react";
import { categoryGlyph } from "@/components/ui/Glyph";
import type { ExpenseRow } from "@/services/expenses";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Recent-activity register: day-grouped rows with a signed day-net per
 * group. Amounts arrive already masked/converted via `amountFor`; the row
 * opens the shared expense detail sheet through `onOpen`.
 */
export function Feed({
  rows,
  amountFor,
  dayNetFor,
  locale,
  onOpen,
  max,
  labels,
}: {
  rows: ExpenseRow[];
  amountFor: (row: ExpenseRow) => string;
  dayNetFor: (group: ExpenseRow[]) => { text: string; positive: boolean };
  locale: string;
  onOpen: (row: ExpenseRow) => void;
  max: number;
  labels: { today: string; yesterday: string };
}) {
  const groups = useMemo(() => {
    const byDay = new Map<string, ExpenseRow[]>();
    for (const row of rows.slice(0, max)) {
      const list = byDay.get(row.date) ?? [];
      list.push(row);
      byDay.set(row.date, list);
    }
    return Array.from(byDay.entries());
  }, [rows, max]);

  if (rows.length === 0) return null;

  const yesterdayISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const todayISOStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const dayLabel = (iso: string) => {
    if (iso === todayISOStr) return labels.today;
    if (iso === yesterdayISO) return labels.yesterday;
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${iso}T00:00:00`));
  };

  return (
    <div>
      {groups.map(([date, grp]) => {
        const net = dayNetFor(grp);
        return (
          <div key={date} className="mt-4 first:mt-0">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
              <span className="text-[11.5px] font-semibold text-text-muted">
                {dayLabel(date)}
              </span>
              <span
                className={`numeric text-[11px] font-semibold ${
                  net.positive ? "text-income" : "text-danger"
                }`}
              >
                {net.text}
              </span>
            </div>
            <ul className="divide-y divide-border/70">
              {grp.map((row) => {
                const Glyph = categoryGlyph(row.categories?.icon);
                const income = row.type === "income";
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(row)}
                      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-elevated/50"
                    >
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${row.categories?.color ?? "var(--sf-faint)"} 13%, transparent)`,
                          color: row.categories?.color ?? "var(--sf-faint)",
                        }}
                      >
                        <Glyph size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">
                          {row.description?.trim() || row.categories?.name || "—"}
                        </span>
                        <span className="block truncate text-[11px] text-faint">
                          {row.categories?.name ?? ""}
                          {row.payment_method ? ` · ${row.payment_method}` : ""}
                        </span>
                      </span>
                      <span
                        className={`numeric shrink-0 text-[13px] font-semibold ${
                          income ? "text-income" : "text-text"
                        }`}
                      >
                        {income ? "+" : "−"}
                        {amountFor(row)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
