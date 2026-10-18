"use client";

import { Wallet } from "lucide-react";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { useLanguage } from "@/store/LanguageContext";
import type { ReactNode } from "react";

/** Everything the cycle statement card shows, formatted by the page. */
export interface CycleCardProps {
  cycleLabel: string;
  net: string;
  netDelta?: ReactNode;
  income: string;
  expense: string;
  safe: string;
  safeCaption?: ReactNode;
  budget: { amount: string; pct: number; left: string } | null;
}

/**
 * The dashboard hero: a deep dark-emerald statement card. Mint accent on
 * the net figure and the budget ring; the cycle figures sit between as
 * typographic columns. Money figures are `.numeric`, so the global
 * privacy-eye blur (html.sf-privacy) masks them.
 */
export function BalanceCard({
  cycleLabel,
  net,
  netDelta,
  income,
  expense,
  safe,
  safeCaption,
  budget,
}: CycleCardProps) {
  const { t } = useLanguage();
  const pctUsed = budget ? Math.round(budget.pct * 100) : 0;

  return (
    <section
      className="rise relative overflow-hidden rounded-[24px] p-5 shadow-[0_24px_48px_-20px_rgba(8,20,14,0.7)] sm:p-6"
      style={{
        background:
          "linear-gradient(168deg, var(--sf-hero-from) 0%, var(--sf-hero-mid) 52%, var(--sf-hero-to) 100%)",
      }}
    >
      {/* Emerald glow behind the net figure */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-20 h-72 w-[420px] rounded-full bg-[var(--sf-hero-accent)] opacity-[0.07] blur-3xl"
      />
      {/* Engraved ripple rings, top right */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-[280px] w-[280px]"
        viewBox="0 0 280 280"
        fill="none"
      >
        <circle cx="180" cy="110" r="120" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
        <circle cx="180" cy="110" r="82" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
        <circle cx="180" cy="110" r="120" fill="rgba(255,255,255,0.03)" />
      </svg>

      <div className="relative flex items-start justify-between gap-3">
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
          {t("cfThisCycle")} · {cycleLabel}
        </p>
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20"
        >
          <Wallet size={19} />
        </span>
      </div>

      <div className="relative mt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
          {t("homeNetLabel")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="numeric text-[38px] font-semibold leading-none tracking-[-0.01em] text-[var(--sf-hero-accent)] sm:text-[46px]">
            {net}
          </div>
          {netDelta && <div className="pb-1">{netDelta}</div>}
        </div>
      </div>

      {/* Statement hairline */}
      <div aria-hidden className="relative mt-6 h-px bg-white/12" />

      {/* Cycle figures as typographic columns */}
      <div className="relative mt-4 grid grid-cols-3 gap-y-5 lg:divide-x lg:divide-white/12">
        <div className="lg:pr-5">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
            {t("income")}
          </p>
          <p className="numeric mt-1 truncate text-[15px] font-semibold text-white">
            {income}
          </p>
        </div>
        <div className="lg:px-5">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
            {t("expense")}
          </p>
          <p className="numeric mt-1 truncate text-[15px] font-semibold text-white">
            {expense}
          </p>
        </div>
        <div className="lg:pl-5">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
            {t("homeSafeToSpend")}
          </p>
          <p className="numeric mt-1 truncate text-[15px] font-semibold text-white">
            {safe}
          </p>
          {safeCaption != null && (
            <div className="mt-1 flex min-h-4 items-center gap-1 text-[10.5px] text-white/45">
              {safeCaption}
            </div>
          )}
        </div>
      </div>

      {/* Budget row with the usage ring */}
      {budget && (
        <div className="relative mt-6 flex items-center justify-between gap-4 rounded-2xl bg-white/6 p-3.5 ring-1 ring-white/12">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
              {t("budget")} · {budget.amount}
            </p>
            <p className="numeric mt-1 truncate text-[12.5px] font-semibold text-white/90">
              {t("cfBudgetLeft").replace("{amount}", budget.left)}
            </p>
          </div>
          <ProgressRing
            pct={budget.pct}
            size={52}
            strokeWidth={6}
            color="var(--sf-hero-accent)"
            trackColor="rgba(255,255,255,0.14)"
            className="shrink-0"
            ariaLabel={`${t("budget")} ${pctUsed}%`}
          >
            <span
              className={`numeric absolute inset-0 flex items-center justify-center text-[11px] font-bold ${
                budget.pct > 1 ? "text-[var(--sf-danger)]" : "text-[var(--sf-hero-accent)]"
              }`}
            >
              {pctUsed}%
            </span>
          </ProgressRing>
        </div>
      )}
    </section>
  );
}
