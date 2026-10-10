"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Flame, Plus, Wallet } from "lucide-react";
import { FitText } from "@/components/ui/FitText";
import { Guilloche } from "@/components/ui/Guilloche";
import { ProgressRing } from "@/components/charts/ProgressRing";
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
  /** Optional footer band inside the card (currency breakdown / today's-rate). */
  footer?: ReactNode;
}

/**
 * Money Pulse hero — Tier 1 of the redesigned dashboard. A statement band of
 * four labeled segments — NET · INFLOW · OUTFLOW · BUDGET — each a caps
 * microlabel over a figure with its own supporting detail, separated by
 * hairline verticals on laptop. Stacks in the same order on phones (the
 * inflow/outflow pair side by side). The net figure is the protagonist;
 * everything else stays quiet.
 */
export function MoneyPulseHero({
  net,
  income,
  expense,
  todayTotal,
  budget,
  pace,
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

  const hasBudget = budget != null && budget > 0;
  const over = hasBudget && expense > budget;
  const remaining = hasBudget ? budget - expense : 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-surface shadow-pop">
      {/* guilloche engraving — the note's one ornament, tucked behind the
          protagonist figure (one-ornament-per-view rule) */}
      <Guilloche className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 text-primary opacity-[0.07]" />

      <div className="relative p-5 sm:p-6 lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:gap-x-6">
        {/* Segment 1 — the protagonist: net for the cycle */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="caps whitespace-nowrap !text-primary-strong">{t("homeNetCashFlow")}</p>
            <span className="whitespace-nowrap text-[11px] font-semibold text-faint">
              · {cycleLabel}
            </span>
          </div>
          {/* denomination frame — the value-corner double rules of a note */}
          <div className="rule-double mt-2" />
          <div
            className={`figures-display mt-1 py-1.5 ${net < 0 ? "text-danger" : "text-text"}`}
          >
            <FitText basePx={40} minPx={16} title={`${t("homeNetCashFlow")} · ${cycleLabel}`}>
              <span className="mr-1 text-[0.45em] font-semibold text-faint">
                {net < 0 ? "−" : "+"}
              </span>
              {formatted(Math.abs(net))}
            </FitText>
          </div>
          <div className="rule-double-b" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {delta && (
              <span
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-bold ${
                  delta.positive ? "bg-income/10 text-income" : "bg-rust-tint text-danger"
                }`}
              >
                {delta.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                <span className="numeric">{delta.text}</span>
                <span className="font-semibold opacity-70">{t("homeVsPrev")}</span>
              </span>
            )}
            {entries != null && (
              <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-surface-elevated px-2.5 text-[11px] font-semibold text-text-muted">
                {entries} {t("homeEntriesWord")}
              </span>
            )}
          </div>
          <p className="mt-3 text-xs leading-snug text-text-muted">
            {t("today")}{" "}
            <span className="numeric font-bold text-text">{formatted(todayTotal)}</span>{" "}
            <span className="text-faint">{t("homeTodaySpendSub")}</span>
          </p>
        </div>

        {/* Segments 2 + 3 — the two flows, side by side on phones */}
        <div className="mt-4 grid grid-cols-2 gap-4 lg:col-span-2 lg:mt-0 lg:contents">
          <div className="min-w-0 lg:border-l lg:border-primary/10 lg:pl-6">
            <p className="caps flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-income" aria-hidden />
              {t("homeInflow")}
            </p>
            <div className="figures mt-1 font-bold text-income">
              <FitText basePx={22} minPx={13} title={t("homeInflow")}>
                {formatted(income)}
              </FitText>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full bg-income transition-[width] duration-500" style={{ width: `${incomePct}%` }} />
            </div>
            <p className="numeric mt-1 text-[11px] font-semibold text-faint">{incomePct}%</p>
          </div>
          <div className="min-w-0 lg:border-l lg:border-primary/10 lg:pl-6">
            <p className="caps flex items-center gap-1.5">
              {t("homeOutflow")}
              <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
            </p>
            <div className="figures mt-1 font-bold text-danger">
              <FitText basePx={22} minPx={13} title={t("homeOutflow")}>
                {formatted(expense)}
              </FitText>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full bg-danger transition-[width] duration-500" style={{ width: `${outflowPct}%` }} />
            </div>
            <p className="numeric mt-1 text-[11px] font-semibold text-faint">{outflowPct}%</p>
          </div>
        </div>

        {/* Segment 4 — budget ring + remaining, pace chips beneath */}
        <div className="mt-4 min-w-0 lg:mt-0 lg:border-l lg:border-primary/10 lg:pl-6">
          {hasBudget ? (
            <>
              <div className="flex items-center gap-3">
                <ProgressRing
                  pct={Math.min(pace.spentPct, 1)}
                  size={68}
                  strokeWidth={7}
                  color={over ? "var(--sf-danger)" : "var(--sf-primary)"}
                  trackColor="var(--sf-surface-elevated)"
                  ariaLabel={`${Math.round(pace.spentPct * 100)}% ${t("homeBudgetUsed")}`}
                >
                  <span className="numeric text-[12px] font-extrabold text-text">
                    {Math.round(pace.spentPct * 100)}%
                  </span>
                  <span className="caps-faint !text-[7px]">{t("homeBudgetUsed")}</span>
                </ProgressRing>
                <div className="min-w-0 max-w-[100px] sm:max-w-[160px]">
                  <p className="caps truncate">{over ? t("homeOverBy") : t("remaining")}</p>
                  <div className={`figures mt-0.5 font-bold ${over ? "text-danger" : "text-text"}`}>
                    <FitText basePx={22} minPx={13}>
                      {formatted(Math.abs(remaining))}
                    </FitText>
                  </div>
                  <p className="numeric mt-0.5 truncate text-[11px] text-faint">
                    {t("homeOfBudget")} {formatted(budget as number)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-surface-elevated px-2 text-[10px] font-bold text-text-muted">
                  {t("homeDayWord")} {pace.daysElapsed}/{pace.daysTotal}
                </span>
                {pace.onPace != null && (
                  <span
                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold ${
                      pace.onPace ? "bg-income/10 text-income" : "bg-rust-tint text-danger"
                    }`}
                  >
                    <Flame size={10} aria-hidden />
                    {pace.onPace ? t("homeOnPace") : t("homeAheadOfPace")}
                  </span>
                )}
                {pace.projected != null && (
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-faint">
                    {t("homeProjectedClose")}{" "}
                    <span
                      className={`numeric font-bold ${
                        pace.onPace === false ? "text-danger" : "text-income"
                      }`}
                    >
                      {formatted(pace.projected)}
                    </span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="min-w-0 rounded-xl border border-dashed border-primary/50 bg-surface/70 p-4 lg:max-w-[280px]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass-tint text-brass">
                <Wallet size={17} />
              </span>
              <p className="mt-2 text-sm font-bold text-text">{t("homeNoBudgetTitle")}</p>
              <p className="mt-0.5 text-xs text-text-muted">{t("homeNoBudgetBody")}</p>
              <Link
                href="/profit-loss"
                className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-primary-strong px-4 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-soft transition hover:brightness-110 active:scale-[0.98]"
              >
                <Plus size={14} />
                {t("homeSetBudget")}
              </Link>
            </div>
          )}
        </div>

        {footer && <div className="mt-4 space-y-2 lg:col-span-4">{footer}</div>}
      </div>
    </section>
  );
}
