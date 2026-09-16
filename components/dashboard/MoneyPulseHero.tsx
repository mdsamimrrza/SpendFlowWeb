"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Flame, Plus, Wallet } from "lucide-react";
import { FitText } from "@/components/ui/FitText";
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
 * Money Pulse hero — Tier 1 of the redesigned dashboard. A soft brand-tinted
 * card: the cycle's net figure with a previous-cycle delta chip, a budget
 * progress ring (remaining / projection / pace status), and an inflow vs
 * outflow split bar. Replaces the old "statement masthead" treatment.
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
    <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary-light via-surface to-surface shadow-pop">
      {/* soft brand glow — decorative only; kept inside bounds so the
          overflow scan stays clean (the card clips it regardless) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-2 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative p-5 sm:p-6">
        {/* Row 1 — net figure and budget ring INLINE at every width (the ring
            fills the space beside the number on phones). The no-budget CTA
            card stacks below instead. */}
        <div
          className={
            hasBudget
              ? "flex items-start justify-between gap-4"
              : "flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"
          }
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="caps whitespace-nowrap !text-primary-strong">{t("homeNetCashFlow")}</p>
              <span className="whitespace-nowrap text-[11px] font-semibold text-faint">
                · {cycleLabel}
              </span>
            </div>
            <div
              className={`figures mt-1 font-extrabold ${net < 0 ? "text-danger" : "text-text"}`}
            >
              {/* FitText: sized to the column, steps down dynamically as the
                  amount grows (floor 16px so the figure is never clipped
                  mid-value) — the sign scales with it (em). */}
              <FitText basePx={40} minPx={16} title={`${t("homeNetCashFlow")} · ${cycleLabel}`}>
                <span className="mr-1 text-[0.45em] font-semibold text-faint">
                  {net < 0 ? "−" : "+"}
                </span>
                {formatted(Math.abs(net))}
              </FitText>
            </div>
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

          {/* Budget ring — pacing anchor, inline beside the net figure. Kept
              narrow on phones so the number column still gets real width. */}
          {hasBudget ? (
            <div className="shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-4">
                <ProgressRing
                  pct={Math.min(pace.spentPct, 1)}
                  size={76}
                  strokeWidth={7}
                  color={over ? "var(--sf-danger)" : "var(--sf-primary)"}
                  trackColor="var(--sf-surface-elevated)"
                  ariaLabel={`${Math.round(pace.spentPct * 100)}% ${t("homeBudgetUsed")}`}
                >
                  <span className="numeric text-[13px] font-extrabold text-text">
                    {Math.round(pace.spentPct * 100)}%
                  </span>
                  <span className="caps-faint !text-[7px]">{t("homeBudgetUsed")}</span>
                </ProgressRing>
                <div className="min-w-0 max-w-[100px] sm:max-w-[160px]">
                  <p className="caps truncate">{over ? t("homeOverBy") : t("remaining")}</p>
                  <div
                    className={`figures mt-0.5 font-bold ${over ? "text-danger" : "text-text"}`}
                  >
                    <FitText basePx={22} minPx={13}>
                      {formatted(Math.abs(remaining))}
                    </FitText>
                  </div>
                  <p className="numeric mt-0.5 truncate text-[11px] text-faint">
                    {t("homeOfBudget")} {formatted(budget as number)}
                  </p>
                </div>
              </div>
            </div>
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

        {/* Pace meta row — spans the full card width at every breakpoint so
            the chips never clip; swipe-scrolls only if localized labels get
            wider than the card. */}
        {hasBudget && (
          <div className="scroll-x mt-4 flex flex-nowrap items-center gap-1.5 overflow-x-auto">
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
              <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface-elevated px-2 text-[10px] font-semibold text-faint">
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
        )}

        {/* Row 2 — inflow vs outflow pulse */}
        <div className="mt-5 rounded-xl border border-border bg-surface/90 p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="caps flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-income" aria-hidden />
                {t("homeInflow")}
              </p>
              <div className="figures mt-1 font-bold text-income">
                <FitText basePx={21} minPx={13} title={t("homeInflow")}>
                  {formatted(income)}
                </FitText>
              </div>
            </div>
            <div className="min-w-0 text-right">
              <p className="caps flex items-center justify-end gap-1.5">
                {t("homeOutflow")}
                <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
              </p>
              <div className="figures mt-1 font-bold text-danger">
                <FitText basePx={21} minPx={13} title={t("homeOutflow")}>
                  {formatted(expense)}
                </FitText>
              </div>
            </div>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full bg-income transition-[width] duration-500"
              style={{ width: `${incomePct}%` }}
            />
            <div
              className="h-full bg-danger transition-[width] duration-500"
              style={{ width: `${outflowPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-faint">
            <span className="numeric">{incomePct}%</span>
            <span className="numeric">{outflowPct}%</span>
          </div>
        </div>

        {footer && <div className="mt-3 space-y-2">{footer}</div>}
      </div>
    </section>
  );
}
