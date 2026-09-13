"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ExpenseRow } from "@/services/expenses";

interface ExpenseRowItemProps {
  row: ExpenseRow;
  amount: string;
  /** Second line, fully composed by the caller (category · method · date). */
  note?: string;
  showBadge?: boolean;
}

/** Ledger entry line: hairline-separated row, color key, serif figures. */
export function ExpenseRowItem({ row, amount, note, showBadge = false }: ExpenseRowItemProps) {
  const isIncome = row.type === "income";
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span
        className="h-7 w-1 shrink-0"
        style={{ backgroundColor: row.categories?.color ?? "#8B978F" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">
          {row.description || row.categories?.name || "Entry"}
        </p>
        <p className="truncate text-[11px] text-faint">{note}</p>
      </div>
      <span
        className={`figures shrink-0 text-[15px] font-bold ${isIncome ? "text-income" : "text-text"}`}
      >
        <span className="mr-0.5 inline-block align-[-1px]">
          {isIncome ? (
            <ArrowUpRight size={12} className="text-income" />
          ) : (
            <ArrowDownRight size={12} className="text-danger" />
          )}
        </span>
        {showBadge && <span className="mr-1 text-[10px] font-normal text-faint">{row.currency}</span>}
        {isIncome ? "+" : "−"}
        {amount.replace(/^[^\d]*/, "")}
      </span>
    </div>
  );
}
