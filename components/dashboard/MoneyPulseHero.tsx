"use client";

import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, PiggyBank, Scale } from "lucide-react";
import { FitText } from "@/components/ui/FitText";
import { useLanguage } from "@/store/LanguageContext";

interface PaceInfo {
  spentPct: number;
  expectedPct: number | null;
  projected: number | null;
  onPace: boolean | null;
  daysElapsed: number;
  daysTotal: number;
}

interface MoneyPulseHeroProps {
  net: number;
  income: number;
  expense: number;
  todayTotal: number;
  budget: number | null;
  pace: PaceInfo;
  formatted: (n: number) => string;
  cycleLabel: string;
  /** Comparison against the previous cycle, already formatted. */
  delta?: { text: string; positive: boolean } | null;
  /** Entries in the current cycle. */
  entries?: number;
  /** Optional footer band under the KPI row (e.g. the today's-rate note). */
  footer?: ReactNode;
}

/**
 * KPI band (soft consumer-dashboard restyle 2026-10-11): four PASTEL TINTED
 * cards - Net on primary-light, Inflow on the income tile tint, Outflow on
 * rust-tint, Savings rate on brass-tint - each with a white circular icon
 * chip, a Fraunces figure, and its existing supporting line. No borders on
 * the tinted cards; the chip carries the depth (shadow-soft). Budget pacing
 * lives in its own card beside the chart.
 */
export function MoneyPulseHero({
  net,
  income,
  expense,
  todayTotal,
  formatted,
  cycleLabel,
  delta = null,
  entries,
  footer,
}: MoneyPulseHeroProps) {
  const { t } = useLanguage();
  const totalFlow = income + expense;
  const incomePct = totalFlow > 0 ? Math.round((income / totalFlow) * 100) : 50;
  const outflowPct = 100 - incomePct;
  const savingsRate =
    income > 0 ? Math.round(((income - expense) / income) * 100) : null;

  const card =
    "flex min-w-0 flex-col rounded-3xl p-4 shadow-soft sm:p-5";
  const chip = (icon: ReactNode, chipBg: string) => (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-soft ${chipBg}`}>
      {icon}
    </span>
  );

  return (
    <section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Net cash flow - primary-light tint */}
        <div className={`${card} bg-teal-100 dark:bg-teal-500/20`}>
          <div className="flex items-center gap-2.5">
            {chip(<Scale size={16} aria-hidden />, "bg-teal-600 dark:bg-teal-500")}
            <p className="caps truncate">{t("homeNetCashFlow")}</p>
          </div>
          <div
            className={`figures-display mt-2.5 ${net < 0 ? "text-danger" : "text-text"}`}
          >
            <FitText basePx={30} minPx={17} title={`${t("homeNetCashFlow")} · ${cycleLabel}`}>
              <span className="mr-0.5 text-[0.55em] text-faint">{net < 0 ? "−" : "+"}</span>
              {formatted(Math.abs(net))}
            </FitText>
          </div>
          <div className="mt-auto flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 pt-2.5">
            {delta && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                  delta.positive ? "text-income" : "text-danger"
                }`}
              >
                {delta.positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                <span className="numeric">{delta.text}</span>
                <span className="font-medium text-faint">{t("homeVsPrev")}</span>
              </span>
            )}
            {entries != null && (
              <span className="numeric text-[11px] text-faint">
                {entries} {t("homeEntriesWord")}
              </span>
            )}
          </div>
        </div>

        {/* Inflow - income tile tint */}
        <div className={`${card} bg-emerald-100 dark:bg-emerald-500/20`}>
          <div className="flex items-center gap-2.5">
            {chip(<ArrowDownLeft size={16} aria-hidden />, "bg-emerald-600 dark:bg-emerald-500")}
            <p className="caps truncate">{t("homeInflow")}</p>
          </div>
          <div className="figures-display mt-2.5 text-income">
            <FitText basePx={30} minPx={17} title={t("homeInflow")}>
              {formatted(income)}
            </FitText>
          </div>
          <div className="mt-auto pt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
              <div className="h-full rounded-full bg-income transition-[width] duration-500" style={{ width: `${incomePct}%` }} />
            </div>
            <p className="numeric mt-1 text-[11px] text-faint">{incomePct}%</p>
          </div>
        </div>

        {/* Outflow - rust tint */}
        <div className={`${card} bg-rose-100 dark:bg-rose-500/20`}>
          <div className="flex items-center gap-2.5">
            {chip(<ArrowUpRight size={16} aria-hidden />, "bg-rose-500")}
            <p className="caps truncate">{t("homeOutflow")}</p>
          </div>
          <div className="figures-display mt-2.5 text-danger">
            <FitText basePx={30} minPx={17} title={t("homeOutflow")}>
              {formatted(expense)}
            </FitText>
          </div>
          <div className="mt-auto pt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
              <div className="h-full rounded-full bg-danger transition-[width] duration-500" style={{ width: `${outflowPct}%` }} />
            </div>
            <p className="numeric mt-1 text-[11px] text-faint">
              {t("today")} <span className="font-semibold text-text-muted">{formatted(todayTotal)}</span>
            </p>
          </div>
        </div>

        {/* Savings rate - brass tint */}
        <div className={`${card} bg-amber-100 dark:bg-amber-500/20`}>
          <div className="flex items-center gap-2.5">
            {chip(<PiggyBank size={16} aria-hidden />, "bg-amber-500")}
            <p className="caps truncate">{t("homeSavingsRate")}</p>
          </div>
          <div
            className={`figures-display mt-2.5 ${
              savingsRate == null ? "text-faint" : savingsRate >= 20 ? "text-income" : "text-text"
            }`}
          >
            <FitText basePx={30} minPx={17} title={t("homeSavingsRate")}>
              {savingsRate != null ? `${savingsRate}%` : "-"}
            </FitText>
          </div>
          <p className="mt-auto pt-2.5 text-[11px] text-faint">{t("homeKeptOfIncome")}</p>
        </div>
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}
