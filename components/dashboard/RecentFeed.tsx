"use client";

import { Fragment } from "react";
import { Repeat } from "lucide-react";
import type { ExpenseRow } from "@/services/expenses";
import { categoryGlyph } from "@/components/ui/Glyph";

interface RecentFeedProps {
  /** Expense rows, newest first (the dashboard fetches date-desc). */
  rows: ExpenseRow[];
  /** Formatted amount for a row (privacy-masked by the caller). */
  amountFor: (row: ExpenseRow) => string;
  displayCurrency: string;
  locale: string;
  onOpen?: (row: ExpenseRow) => void;
  /** Max rows rendered in total (grouping preserved). */
  max?: number;
  labels: { today: string; yesterday: string };
}

/**
 * Recent activity — modern fintech feed. Entries group under Today /
 * Yesterday / dated headers; each group is one rounded card with hairline
 * rows: tinted category avatar, description, category · account · method
 * meta, and a signed fit-to-width figure. Replaces the flat ledger list.
 */
export function RecentFeed({
  rows,
  amountFor,
  displayCurrency,
  locale,
  onOpen,
  max = 8,
  labels,
}: RecentFeedProps) {
  const limited = rows.slice(0, max);
  const todayStr = toISO(new Date());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = toISO(yest);

  // Bucket by date, preserving order.
  const groups: { date: string; label: string; rows: ExpenseRow[] }[] = [];
  for (const row of limited) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) {
      last.rows.push(row);
      continue;
    }
    const label =
      row.date === todayStr
        ? labels.today
        : row.date === yesterdayStr
          ? labels.yesterday
          : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
              new Date(`${row.date}T00:00:00`),
            );
    groups.push({ date: row.date, label, rows: [row] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.date}>
          <p className="caps mb-1.5 px-1">{g.label}</p>
          <div className="panel !rounded-2xl divide-y divide-border/60 px-4">
            {g.rows.map((row) => {
              const isIncome = row.type === "income";
              const catColor = row.categories?.color ?? "var(--sf-faint)";
              const Glyph = categoryGlyph(row.categories?.icon);
              const meta = [row.categories?.name, row.bank_accounts?.name, row.payment_method]
                .filter(Boolean)
                .join(" · ");
              const inner = (
                <>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: isIncome
                        ? "var(--sf-primary-light)"
                        : `color-mix(in srgb, ${catColor} 14%, transparent)`,
                      color: isIncome ? "var(--sf-income)" : catColor,
                    }}
                    aria-hidden
                  >
                    <Glyph size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-text">
                      {row.description || row.categories?.name || "Entry"}
                    </p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11px] text-faint">{meta}</span>
                      {(row.is_recurring || row.recurring_rule_id) && (
                        <span
                          className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-brass-tint px-1 text-[9px] font-bold uppercase text-brass"
                          title="Recurring"
                        >
                          <Repeat size={8} aria-hidden /> Rec
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="min-w-0 shrink-0 text-right">
                    {row.currency !== displayCurrency && (
                      <p className="text-[10px] font-semibold text-faint">{row.currency}</p>
                    )}
                    <p
                      className={`figures text-[15px] font-bold ${
                        isIncome ? "text-income" : "text-text"
                      }`}
                    >
                      {isIncome ? "+" : "−"}
                      {amountFor(row).replace(/^[^\d]*/, "")}
                    </p>
                  </div>
                </>
              );
              return onOpen ? (
                <button
                  key={row.id}
                  onClick={() => onOpen(row)}
                  className="flex min-h-14 w-full min-w-0 items-center gap-3 py-2 text-left transition-colors hover:bg-surface-elevated/50 focus-visible:outline-none focus-visible:bg-surface-elevated/70"
                >
                  {inner}
                </button>
              ) : (
                <div key={row.id} className="flex min-h-14 min-w-0 items-center gap-3 py-2">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
