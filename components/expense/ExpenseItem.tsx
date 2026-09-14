"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { ExpenseRow } from "@/services/expenses";
import { categoryGlyph } from "@/components/ui/Glyph";

interface ExpenseItemProps {
  row: ExpenseRow;
  displayAmount: string;
  timeLabel: string;
  showCurrencyBadge?: boolean;
}

/** Transaction row (mobile ExpenseItem parity — buttons replace the swipe gesture). */
export function ExpenseItem({ row, displayAmount, timeLabel, showCurrencyBadge = false }: ExpenseItemProps) {
  const isIncome = row.type === "income";
  const CategoryIcon = categoryGlyph(row.categories?.icon);
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 transition hover:bg-surface-elevated">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${row.categories?.color ?? "#888"}22`, color: row.categories?.color ?? undefined }}
        aria-hidden
      >
        <CategoryIcon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-text">
          {row.description || row.categories?.name || "Transaction"}
        </p>
        <p className="text-xs text-text-muted">
          {row.categories?.name ?? "—"} · {row.payment_method} · {timeLabel}
        </p>
      </div>
      <span
        className={`numeric flex shrink-0 items-center gap-0.5 text-sm font-extrabold ${
          isIncome ? "text-income" : "text-text"
        }`}
      >
        {isIncome ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} className="text-danger" />}
        {showCurrencyBadge && <span className="mr-0.5 text-[10px] text-faint">{row.currency}</span>}
        {displayAmount}
      </span>
    </div>
  );
}
