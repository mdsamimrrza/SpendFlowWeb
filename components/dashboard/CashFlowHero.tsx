"use client";

interface PaceInfo {
  spentPct: number;
  expectedPct: number | null;
  projected: number | null;
  onPace: boolean | null;
  daysElapsed: number;
  daysTotal: number;
}

interface CashFlowHeroProps {
  net: number;
  income: number;
  expense: number;
  todayTotal: number;
  budget: number | null;
  pace: PaceInfo;
  formatted: (n: number) => string;
  cycleLabel: string;
  todayLabel: string;
  /** Comparison against the previous cycle, already formatted. */
  delta?: { text: string; positive: boolean } | null;
  /** Entries in this statement's cycle (footer). */
  entries?: number;
  /** Locale-independent statement number (e.g. "2026-08"), from cycle start. */
  statementNo: string;
  /**
   * Two-column layout for narrow containers (landing hero): net and budget
   * pace span the full width, inflow/outflow share a row — each figure gets
   * 3–5× the column width so amounts never hit the FitText floor.
   */
  compact?: boolean;
}

import { FitText } from "@/components/ui/FitText";

/**
 * Statement masthead — Tier 1 of the dashboard. A flat paper sheet with a
 * brand top rule and hairline-divided columns: net figure, inflow, outflow,
 * budget pace. No colored blocks, no shadows.
 */
export function CashFlowHero({
  net,
  income,
  expense,
  todayTotal,
  budget,
  pace,
  formatted,
  cycleLabel,
  todayLabel,
  delta = null,
  entries,
  statementNo,
  compact = false,
}: CashFlowHeroProps) {
  const totalFlow = income + expense;
  const incomeShare = totalFlow > 0 ? income / totalFlow : 0.5;
  // One rounded figure, complement derived — the pair always sums to 100%.
  const incomePct = totalFlow > 0 ? Math.round(incomeShare * 100) : 50;
  const outflowPct = 100 - incomePct;

  return (
    <section className="panel">
      {/* Masthead rule — tighter padding only below sm; compact (landing) untouched */}
      <div className={`border-b-2 border-primary py-2.5 ${compact ? "px-5" : "px-4"} sm:px-6`}>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span className="caps !text-primary-strong">Statement of cash flow</span>
          <span className="caps">{cycleLabel}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
          <span className="stamp">Form SF-01 · personal ledger</span>
          <span className="stamp">No. {statementNo}</span>
        </div>
        <div className="mt-1 h-px bg-border" aria-hidden />
      </div>

      <div
        className={
          compact
            ? // Hairline grid: bg-border shows through gap-px seams.
              "grid grid-cols-2 gap-px bg-border"
            : // Mobile/tablet: net spans full width, inflow/outflow share a
              // row, budget pace spans full width. Desktop: 4-col row.
              "grid grid-cols-2 gap-px bg-border lg:grid-cols-4"
        }
      >
        {/* Net figure — auto-shrinks as the number grows, never overflows */}
        <div
          className={`bg-surface px-5 py-5 sm:px-6 ${
            compact ? "col-span-2" : "col-span-2 lg:col-span-1"
          }`}
        >
          <p className="caps">Net cash flow</p>
          <div className={`figures mt-2 font-bold ${net < 0 ? "text-danger" : "text-text"}`}>
            <FitText basePx={compact ? 34 : 44} minPx={20} title="Net cash flow for this cycle">
              <span className="mr-1 text-base font-normal text-faint">{net < 0 ? "−" : "+"}</span>
              {formatted(Math.abs(net))}
            </FitText>
          </div>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-xs text-text-muted">
            <span>{todayLabel}</span>
            <span className="numeric font-bold text-text">{formatted(todayTotal)}</span>
            {delta && (
              <>
                <span
                  className={`numeric font-bold ${delta.positive ? "text-income" : "text-danger"}`}
                >
                  {delta.text}
                </span>
                <span className="text-faint">vs prev cycle</span>
              </>
            )}
          </p>
        </div>

        {/* Inflow */}
        <div className="bg-surface px-5 py-5 sm:px-6">
          <p className="caps">Inflow</p>
          <div className="figures mt-2 font-bold text-income">
            <FitText basePx={compact ? 26 : 22} minPx={13} title="Inflow">
              {formatted(income)}
            </FitText>
          </div>
          <div className="mt-4 h-1 w-full bg-surface-elevated">
            <div className="h-full bg-income" style={{ width: `${incomePct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-faint">{incomePct}% of total flow</p>
        </div>

        {/* Outflow */}
        <div className="bg-surface px-5 py-5 sm:px-6">
          <p className="caps">Outflow</p>
          <div className="figures mt-2 font-bold text-danger">
            <FitText basePx={compact ? 26 : 22} minPx={13} title="Outflow">
              {formatted(expense)}
            </FitText>
          </div>
          <div className="mt-4 h-1 w-full bg-surface-elevated">
            <div className="h-full bg-danger" style={{ width: `${outflowPct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-faint">{outflowPct}% of total flow</p>
        </div>

        {/* Budget pace */}
        <div
          className={`bg-surface px-5 py-5 sm:px-6 ${
            compact ? "col-span-2" : "col-span-2 lg:col-span-1"
          }`}
        >
          <p className="caps">Budget pace</p>
          {budget != null && budget > 0 ? (
            <>
              <p className="figures mt-2 text-[22px] font-bold leading-none text-text">
                {Math.round(pace.spentPct * 100)}%
                <span className="ml-1 text-sm font-normal text-faint">used</span>
              </p>
              <div className="relative mt-4 h-1 w-full bg-surface-elevated">
                <div
                  className={`h-full ${pace.onPace === false ? "bg-danger" : "bg-primary"}`}
                  style={{ width: `${Math.min(Math.round(pace.spentPct * 100), 100)}%` }}
                />
                {pace.expectedPct != null && (
                  <div
                    className="absolute top-[-2px] h-[9px] w-px bg-text"
                    style={{ left: `${Math.min(Math.round(pace.expectedPct * 100), 100)}%` }}
                    aria-hidden
                  />
                )}
              </div>
              <p className="mt-3 text-[11px] text-faint">
                Day {pace.daysElapsed}/{pace.daysTotal}
                {pace.projected != null && (
                  <>
                    {" · projects "}
                    <span className={`numeric font-bold ${pace.onPace === false ? "text-danger" : "text-income"}`}>
                      {formatted(pace.projected)}
                    </span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-faint">
              No budget set — pacing unavailable.
            </p>
          )}
        </div>
      </div>

      {/* End of statement */}
      <div className="end-rule flex items-center justify-between px-5 py-2 sm:px-6">
        <span className="stamp">End of summary</span>
        <span className="stamp">
          {entries != null ? `${entries} entries · ` : ""}printed{" "}
          {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}
        </span>
      </div>
    </section>
  );
}
