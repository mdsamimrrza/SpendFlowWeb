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
 * KPI band (2026-10-11 dashboard redesign, market pattern: Monarch /
 * Simplifi-style summary row). Four summary cards - Net, Inflow, Outflow,
 * Savings rate - each a quiet label over a Fraunces figure with one
 * supporting line. Budget pacing lives in its own card beside the chart.
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

  return (
    <section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Net cash flow */}
        <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="caps truncate">{t("homeNetCashFlow")}</p>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-elevated text-text-muted">
              <Scale size={14} aria-hidden />
            </span>
          </div>
          <div
            className={`figures-display mt-2 ${net < 0 ? "text-danger" : "text-text"}`}
          >
            <FitText basePx={30} minPx={17} title={`${t("homeNetCashFlow")} · ${cycleLabel}`}>
              <span className="mr-0.5 text-[0.55em] text-faint">{net < 0 ? "−" : "+"}</span>
              {formatted(Math.abs(net))}
            </FitText>
          </div>
          <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5">
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

        {/* Inflow */}
        <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="caps truncate">{t("homeInflow")}</p>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-income/10 text-income">
              <ArrowDownLeft size={14} aria-hidden />
            </span>
          </div>
          <div className="figures-display mt-2 text-income">
            <FitText basePx={30} minPx={17} title={t("homeInflow")}>
              {formatted(income)}
            </FitText>
          </div>
          <div className="mt-auto pt-2.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-income transition-[width] duration-500" style={{ width: `${incomePct}%` }} />
            </div>
            <p className="numeric mt-1 text-[11px] text-faint">{incomePct}%</p>
          </div>
        </div>

        {/* Outflow */}
        <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="caps truncate">{t("homeOutflow")}</p>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rust-tint text-danger">
              <ArrowUpRight size={14} aria-hidden />
            </span>
          </div>
          <div className="figures-display mt-2 text-danger">
            <FitText basePx={30} minPx={17} title={t("homeOutflow")}>
              {formatted(expense)}
            </FitText>
          </div>
          <div className="mt-auto pt-2.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-danger transition-[width] duration-500" style={{ width: `${outflowPct}%` }} />
            </div>
            <p className="numeric mt-1 text-[11px] text-faint">
              {t("today")} <span className="font-semibold text-text-muted">{formatted(todayTotal)}</span>
            </p>
          </div>
        </div>

        {/* Savings rate */}
        <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="caps truncate">{t("homeSavingsRate")}</p>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-income/10 text-income">
              <PiggyBank size={14} aria-hidden />
            </span>
          </div>
          <div
            className={`figures-display mt-2 ${
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
