"use client";

/**
 * "At today's rate" second view (user request 2026-09-16 — brokerage
 * cost-basis/market-value pattern; restyled same day): period totals stay
 * HEADLINE-FROZEN at
 * each day's rate (QuickBooks/Xero behavior); this optional card shows what
 * the SAME money is worth at today's live cross. It hides itself when the two
 * agree (nothing to explain) or while today's rates are unresolved. Callers
 * pass masked formatters so privacy mode applies like every other figure.
 */
import { useLanguage } from "@/store/LanguageContext";

export function TodayRateLine({
  frozen,
  today,
  fmt,
  className = "",
}: {
  frozen: { income: number; expense: number };
  today: { income: number; expense: number } | null;
  fmt: (n: number) => string;
  className?: string;
}) {
  const { t } = useLanguage();
  if (!today) return null;
  const drift = Math.abs(frozen.income - today.income) + Math.abs(frozen.expense - today.expense);
  if (drift < 0.01) return null;
  return (
    <div
      className={`rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5 ${className}`}
      aria-label={t("curAtTodayRate")}
    >
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-faint">
        {t("curAtTodayRate")}
      </p>
      <div className="space-y-1 text-[11.5px] leading-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-income" aria-hidden />
            {t("income")}
          </span>
          <span className="figures shrink-0 font-bold text-text">{fmt(today.income)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
            {t("expense")}
          </span>
          <span className="figures shrink-0 font-bold text-text">{fmt(today.expense)}</span>
        </div>
      </div>
    </div>
  );
}
