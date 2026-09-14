"use client";

import { AlertCircle, Pencil, Trash2 } from "lucide-react";
import { categoryGlyph } from "@/components/ui/Glyph";
import { Tag } from "lucide-react";
import type { RecurringFrequency, RecurringRuleRow, RuleOccurrence } from "@/services/recurring";
import { latestOccurrenceFor } from "@/services/recurring";
import { todayISO } from "@/utils/format";

interface PlanCardProps {
  rule: RecurringRuleRow;
  occurrences: RuleOccurrence[];
  /** Formatted per-cycle amount for the rule currency. */
  amount: string;
  /** e.g. "/mo" cadence suffix. */
  cadence: string;
  freqText: string;
  nextDueShort: string;
  paidNote: string | null;
  due: boolean;
  dueLabel: string;
  overdueDays: number;
  dueInDays: number | null;
  labels: { overdue: string; dueToday: string; inDays: string; active: string; paused: string; edit: string; del: string };
  onOpen: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const DAY_MS = 86_400_000;

function cycleDays(frequency: RecurringFrequency, intervalDays?: number | null): number {
  if (frequency === "daily") return 1;
  if (frequency === "weekly") return 7;
  if (frequency === "custom") return intervalDays ?? 30;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / DAY_MS);
}

/**
 * Plan card — one bill, one glance: category avatar, cadence chip, the
 * next-due countdown pill (overdue / today / in N days), a thin slot-progress
 * rule showing where today sits between the last paid slot and the next one,
 * and the amount. Tap anywhere opens the record sheet; row-level actions stay
 * out of the tap target.
 */
export function PlanCard({
  rule,
  occurrences,
  amount,
  cadence,
  freqText,
  nextDueShort,
  paidNote,
  due,
  dueLabel,
  overdueDays,
  dueInDays,
  labels,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
}: PlanCardProps) {
  const CatGlyph = rule.categories?.icon ? categoryGlyph(rule.categories.icon) : Tag;
  const catColor = rule.categories?.color ?? "var(--sf-primary)";

  // Slot progress: last booked slot (or virtual start of the current chain)
  // → next due. Clamped 0–1; overdue slots pin to full and go red.
  const latest = latestOccurrenceFor(occurrences, rule.id);
  const chainFrom =
    latest && latest.recurring_due_date && latest.recurring_due_date < rule.next_due_date
      ? latest.recurring_due_date
      : (() => {
          const span = cycleDays(rule.frequency, rule.interval_days);
          const d = new Date(`${rule.next_due_date}T00:00:00`);
          d.setDate(d.getDate() - span);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })();
  const total = Math.max(daysBetween(chainFrom, rule.next_due_date), 1);
  const elapsed = daysBetween(chainFrom, todayISO());
  const progress = Math.max(0, Math.min(1, elapsed / total));

  const countdown = due
    ? overdueDays > 0
      ? `${labels.overdue} ${overdueDays}d`
      : labels.dueToday
    : dueInDays != null
      ? labels.inDays.replace("{n}", String(dueInDays))
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${rule.description || rule.categories?.name || "Plan"} — ${nextDueShort}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group flex cursor-pointer items-center gap-3 border-b border-border/60 px-3.5 py-3.5 transition last:border-0 hover:bg-surface-elevated/40 focus-visible:bg-surface-elevated/60 focus-visible:outline-none sm:gap-4 sm:px-5"
    >
      {/* Category avatar with cadence ring */}
      <span
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
        style={{ borderColor: `${catColor}55`, backgroundColor: `${catColor}14`, color: catColor }}
        aria-hidden
      >
        <CatGlyph size={18} />
        {!rule.is_active && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface text-faint">
            <AlertCircle size={9} />
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`max-w-full truncate text-sm font-bold ${rule.is_active ? "text-text" : "text-faint line-through"}`}>
            {rule.description || rule.categories?.name || "Recurring"}
          </p>
          {countdown && (
            <span
              className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-black uppercase tracking-wide ${
                due ? "bg-rust-tint text-danger" : "bg-primary/10 text-primary"
              }`}
            >
              {due && <AlertCircle size={9} />}
              {countdown}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-faint">
          {rule.categories?.name ?? "—"} · {freqText} · {nextDueShort}
          {paidNote ? ` · ${paidNote}` : ""}
        </p>
        {/* Slot-progress rule — today's position between last paid and next due */}
        <div className="relative mt-2 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={`h-full rounded-full transition-all duration-500 ${due ? "bg-danger" : "bg-primary"}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="numeric text-sm font-extrabold text-text sm:text-[15px]">
          {amount}
          <span className="text-[10px] font-normal text-faint">{cadence}</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {due ? (
          <span className="inline-flex h-7 items-center gap-1 rounded-full border-[1.5px] border-danger/60 bg-danger/10 px-2.5 text-[10px] font-black uppercase tracking-wide text-danger">
            {dueLabel}
          </span>
        ) : (
          <button
            onClick={onToggle}
            className={`h-7 rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              rule.is_active
                ? "border-income/40 text-income hover:bg-income/10"
                : "border-border text-faint hover:text-text"
            }`}
          >
            {rule.is_active ? labels.active : labels.paused}
          </button>
        )}
        {/* Row-level edit/delete live in the record sheet on phones. */}
        <div className="hidden items-center gap-1 sm:flex">
          <button
            onClick={onEdit}
            aria-label={labels.edit}
            className="rounded-md p-1.5 text-faint transition-colors hover:text-primary"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            aria-label={labels.del}
            className="rounded-md p-1.5 text-faint transition-colors hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
