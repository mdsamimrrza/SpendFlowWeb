"use client";

/**
 * "At transaction-date rates" debugger line (kept TEMPORARILY to cross-check
 * the live-rate rule, user decision 2026-09-19): headline totals for the
 * ACTIVE financial month are priced at today's live rate everywhere; this
 * collapsible shows what the SAME money is worth frozen at each transaction's
 * own date. Collapsible: starts CLOSED — tap the header to reveal the two
 * figures, tap again to fold it back. Hides itself entirely when the two
 * bases agree (nothing to cross-check) or while the frozen totals are
 * unresolved. Callers pass masked formatters so privacy mode applies like
 * every other figure.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/store/LanguageContext";

export function TodayRateLine({
  live,
  frozen,
  fmt,
  className = "",
}: {
  /** Headline basis for the rendered period — LIVE rates for the active
   *  financial month, transaction-date rates for closed periods. */
  live: { income: number; expense: number };
  /** ALWAYS transaction-date totals — shown inside the collapsible so the
   *  frozen historical value can be cross-checked against the live headline. */
  frozen: { income: number; expense: number } | null;
  fmt: (n: number) => string;
  className?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!frozen) return null;
  const drift = Math.abs(live.income - frozen.income) + Math.abs(live.expense - frozen.expense);
  if (drift < 0.01) return null;
  return (
    <div className={`rounded-xl border border-border/70 bg-surface/80 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-faint"
      >
        <span>{t("curAtTxnRate")}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-2.5">
          <div className="space-y-1 text-[11.5px] leading-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-income" aria-hidden />
                {t("income")}
              </span>
              <span className="figures shrink-0 font-bold text-text">{fmt(frozen.income)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
                {t("expense")}
              </span>
              <span className="figures shrink-0 font-bold text-text">{fmt(frozen.expense)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
