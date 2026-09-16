"use client";

/**
 * "At today's rate" second view (user request 2026-09-16 — brokerage
 * cost-basis/market-value pattern): period totals stay HEADLINE-FROZEN at
 * each day's rate (QuickBooks/Xero behavior); this optional line shows what
 * the SAME money is worth at today's live cross, and hides itself when the
 * two agree (nothing to explain) or while today's rates are unresolved.
 * Callers pass masked formatters so privacy mode applies exactly like every
 * other figure.
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
      className={`flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-faint ${className}`}
      aria-label={t("curAtTodayRate")}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.08em]">{t("curAtTodayRate")}</span>
      <span className="figures whitespace-nowrap">
        {t("income")} {fmt(today.income)}
      </span>
      <span aria-hidden>·</span>
      <span className="figures whitespace-nowrap">
        {t("expense")} {fmt(today.expense)}
      </span>
    </div>
  );
}
