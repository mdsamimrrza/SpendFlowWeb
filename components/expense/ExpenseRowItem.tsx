"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ExpenseRow } from "@/services/expenses";
import { categoryGlyph } from "@/components/ui/Glyph";

interface ExpenseRowItemProps {
  row: ExpenseRow;
  amount: string;
  /** Second line, fully composed by the caller (category · account · method · date). */
  note?: string;
  showBadge?: boolean;
  /** Present = row opens the record sheet (web-only drill-in). */
  onOpen?: () => void;
}

/**
 * Ledger entry line — mobile-first: category icon avatar (income wears the
 * green ring), hairline separators, signed serif figures.
 */
export function ExpenseRowItem({ row, amount, note, showBadge = false, onOpen }: ExpenseRowItemProps) {
  const isIncome = row.type === "income";
  const catColor = row.categories?.color ?? "var(--sf-faint)";
  const avatarStyle = isIncome
    ? { borderColor: "var(--sf-income)", backgroundColor: "var(--sf-primary-light)", color: "var(--sf-income)" }
    : { borderColor: catColor, backgroundColor: `${catColor}14`, color: catColor };
  const CategoryGlyph = categoryGlyph(row.categories?.icon);
  return (
    <div
      {...(onOpen
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: onOpen,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter") onOpen();
            },
            className:
              "group flex cursor-pointer items-center gap-3 border-b border-border/60 py-2.5 transition last:border-0 hover:bg-surface-elevated/50 focus:bg-surface-elevated/70 focus:outline-none",
          }
        : {
            className:
              "flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0",
          })}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={avatarStyle}
        aria-hidden
      >
        <CategoryGlyph size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">
          {row.description || row.categories?.name || "Entry"}
        </p>
        <p className="truncate text-[11px] text-faint">
          {note}
          {(row.is_recurring || row.recurring_rule_id) && (
            <span className="ml-1.5 inline-block border border-border px-1 py-px align-[1px] text-[9px] font-bold uppercase tracking-wide text-brass">
              Rec
            </span>
          )}
        </p>
      </div>
      <span
        className={`figures shrink-0 text-[15px] font-bold ${isIncome ? "text-income" : "text-text"}`}
        style={{ minWidth: "104px" }}
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
