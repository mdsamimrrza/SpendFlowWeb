"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter, useBudget, useDisplayRate } from "@/hooks/useRates";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { Skeleton } from "@/components/ui/Skeleton";
import { FlowChartCard } from "@/components/charts/FlowChartCard";
import { CategoryBars, type CategorySlice } from "@/components/charts/CategoryBars";
import { FitText } from "@/components/ui/FitText";
import { formatMoney, getCycleWindow, cycleDaysElapsed, cycleDaysTotal, cycleStatementNo, toISODate } from "@/utils/format";

/**
 * Analytics — one continuous ANALYTICAL STATEMENT sheet (ledger aesthetic):
 * masthead → summary band → burn analysis → diagnostics → composition →
 * end-of-statement footer. All formulas are ported 1:1 from the APK
 * components (FinancialHealthScoreCard, BudgetAnalyticsCard):
 *  - Health composite 0–100: budget adherence 35 (canonical USD), daily
 *    volatility 25, category concentration 20, weekend surge 20, savings
 *    bonus 0–10; grades at 90/75/60/45.
 *  - Burn: daily allowance, actual pace, projected close (projection % in
 *    canonical USD), projected income, over/high-burn verdicts.
 */

interface Factor {
  label: string;
  points: number;
  max: number;
}

interface Insight {
  tone: "good" | "warn" | "info";
  title: string;
  desc: string;
}

export default function AnalyticsPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  // rows feed the converter so NPR dates resolve via their INR rate (peg parity).
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const budget = useBudget();
  const displayRate = useDisplayRate(profile?.preferred_currency);
  const supabase = getSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { rows: fresh } = await listExpenses(supabase, user.id, 0, {}, { field: "date", direction: "desc" }, 5000);
        if (!cancelled) setRows(fresh);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const unsubscribe = subscribeToExpenseChanges(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, supabase, t]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );

  const stats = useMemo(() => {
    const startISO = toISODate(cycle.start);
    const endISO = toISODate(cycle.end);
    // Inclusive day counts (mobile parity): a 31 Aug – 29 Sep cycle is 30 days.
    const daysTotal = cycleDaysTotal(cycle);
    const daysElapsed = cycleDaysElapsed(cycle, new Date());

    let spent = 0;
    let income = 0;
    let peak = 0;
    let expenseCount = 0;
    let spentUsd = 0;
    let weekendSpend = 0;
    const dailyMap = new Map<string, number>();
    const byMethod = new Map<string, { total: number; count: number }>();
    const byWeekday = Array.from({ length: 7 }, () => 0);
    const byCategory = new Map<string, CategorySlice>();

    for (const row of rows) {
      if (row.date < startISO || row.date > endISO) continue;
      const v = convert(row);
      const isIncome = row.type === "income";
      const snap = row.exchange_rate_to_usd && row.exchange_rate_to_usd > 0 ? row.exchange_rate_to_usd : null;

      if (isIncome) {
        income += v;
        continue;
      }
      spent += v;
      spentUsd += snap ? Number(row.amount) * snap : 0;
      expenseCount += 1;
      peak = Math.max(peak, v);
      dailyMap.set(row.date, (dailyMap.get(row.date) ?? 0) + v);
      const wd = new Date(`${row.date}T00:00:00`).getDay();
      byWeekday[wd] += v;
      if (wd === 0 || wd === 6) weekendSpend += v;
      const m = byMethod.get(row.payment_method) ?? { total: 0, count: 0 };
      m.total += v;
      m.count += 1;
      byMethod.set(row.payment_method, m);
      const name = row.categories?.name ?? "Other";
      const slice = byCategory.get(name) ?? {
        label: name,
        value: 0,
        color: row.categories?.color ?? "#8B978F",
      };
      slice.value += v;
      byCategory.set(name, slice);
    }

    return {
      net: income - spent,
      spent,
      income,
      peak,
      expenseCount,
      daysElapsed,
      daysTotal,
      dailyVelocity: spent / daysElapsed,
      avgTicket: expenseCount > 0 ? spent / expenseCount : 0,
      spentUsd,
      weekendSpend,
      activeDays: dailyMap.size,
      dailyValues: Array.from(dailyMap.values()),
      byMethod: Array.from(byMethod.entries()).sort((a, b) => b[1].total - a[1].total),
      byWeekday,
      categories: Array.from(byCategory.values()).sort((a, b) => b.value - a.value),
    };
  }, [rows, cycle, convert]);

  const health = useMemo(() => {
    const insights: Insight[] = [];
    const factors: Factor[] = [];

    // 1. Savings rate & cash flow (bonus 0–10)
    let savingsBonus = 0;
    const netSavings = stats.income - stats.spent;
    const savingsRate = stats.income > 0 ? netSavings / stats.income : null;
    if (savingsRate != null && savingsRate >= 0.2) {
      savingsBonus = 10;
      insights.push({ tone: "good", title: "Strong savings rate", desc: `Retaining ${Math.round(savingsRate * 100)}% of income after expenses.` });
    } else if (savingsRate != null && savingsRate > 0) {
      savingsBonus = 5;
      insights.push({ tone: "info", title: "Positive cash flow", desc: `Net +${fmt(netSavings)} maintained this cycle.` });
    } else if (savingsRate != null) {
      insights.push({ tone: "warn", title: "Cash flow deficit", desc: `Outflow exceeds income by ${fmt(Math.abs(netSavings))}.` });
    }
    factors.push({ label: "Savings", points: savingsBonus, max: 10 });

    // 2. Budget adherence (0–35, canonical USD — display-currency invariant)
    let budgetPoints = 30; // APK default when no budget is on file
    const expectedRatio = stats.daysElapsed / stats.daysTotal;
    const budgetUsd = budget != null && displayRate ? budget * displayRate : 0;
    if (budgetUsd > 0 && stats.spentUsd > 0) {
      const usedRatio = stats.spentUsd / budgetUsd;
      if (usedRatio <= expectedRatio) {
        budgetPoints = 35;
        insights.push({ tone: "good", title: "Optimal burn rate", desc: `Spending safely within your ${fmt(budget ?? 0)} cycle ceiling.` });
      } else if (usedRatio <= 1) {
        const excess = Math.round((usedRatio - expectedRatio) * 100);
        budgetPoints = Math.max(10, 35 - excess * 0.6);
        insights.push({ tone: "warn", title: "Elevated spend pace", desc: `Running ${excess}% ahead of the cycle schedule.` });
      } else {
        budgetPoints = 5;
        insights.push({ tone: "warn", title: "Budget ceiling exceeded", desc: "Outflow has crossed 100% of the cycle budget." });
      }
    } else if (budget == null) {
      insights.push({ tone: "info", title: "No budget on file", desc: "Set a budget in Profit & Loss to unlock adherence scoring." });
    }
    factors.push({ label: "Budget adherence", points: Math.round(budgetPoints), max: 35 });

    // 3. Daily volatility (0–25) — CV of active-day totals
    let volatilityPoints = 20; // APK default under 3 active days
    if (stats.dailyValues.length >= 3) {
      const avgDaily = stats.spent / stats.dailyValues.length;
      const variance = stats.dailyValues.reduce((sum, v) => sum + Math.pow(v - avgDaily, 2), 0) / stats.dailyValues.length;
      const cv = Math.sqrt(variance) / Math.max(avgDaily, 1);
      if (cv < 0.6) {
        volatilityPoints = 25;
        insights.push({ tone: "good", title: "Stable daily rhythm", desc: "Day-to-day amounts are well balanced without wild swings." });
      } else if (cv < 1.2) {
        volatilityPoints = 18;
      } else {
        volatilityPoints = 10;
        insights.push({ tone: "warn", title: "Irregular spike pattern", desc: "Large sudden purchases are driving daily volatility." });
      }
    }
    factors.push({ label: "Stability", points: volatilityPoints, max: 25 });

    // 4. Category concentration (0–20)
    let categoryPoints = 20;
    const top = stats.categories[0];
    if (top && stats.spent > 0) {
      const topRatio = top.value / stats.spent;
      if (topRatio > 0.6 && stats.categories.length > 1) {
        categoryPoints = 10;
        insights.push({ tone: "warn", title: "High category concentration", desc: `${top.label} accounts for ${Math.round(topRatio * 100)}% of total spend.` });
      } else {
        insights.push({ tone: "good", title: "Diversified allocation", desc: "Healthy spread across categories." });
      }
    }
    factors.push({ label: "Category spread", points: categoryPoints, max: 20 });

    // 5. Weekend surge (0–20)
    let weekendPoints = 20;
    const weekendRatio = stats.spent > 0 ? stats.weekendSpend / stats.spent : 0;
    if (weekendRatio > 0.55 && stats.expenseCount >= 4) {
      weekendPoints = 10;
      insights.push({ tone: "warn", title: "Weekend outflow surge", desc: `${Math.round(weekendRatio * 100)}% of spending happens on Sat & Sun.` });
    }
    factors.push({ label: "Weekend control", points: weekendPoints, max: 20 });

    const baseScore = factors.reduce((s, f) => s + f.points, 0);
    const score = Math.min(100, Math.max(10, Math.round(baseScore + savingsBonus)));
    let grade = "D";
    if (score >= 90) grade = "A+";
    else if (score >= 75) grade = "A";
    else if (score >= 60) grade = "B";
    else if (score >= 45) grade = "C";
    const status = score >= 75 ? "Excellent" : score >= 60 ? "Good" : score >= 45 ? "Fair" : "Needs work";

    return { score, grade, status, factors, insights: insights.slice(0, 5) };
  }, [stats, budget, displayRate, fmt]);

  const burn = useMemo(() => {
    const isBudgetSet = budget != null && budget > 0;
    const dailyAllowance = isBudgetSet ? budget / stats.daysTotal : 0;
    const actualPace = stats.spent / stats.daysElapsed;
    const projected = actualPace * stats.daysTotal;
    const isOver = isBudgetSet && stats.spent > budget;
    const isHighBurn = isBudgetSet && actualPace > dailyAllowance;
    const budgetUsd = budget != null && displayRate ? budget * displayRate : 0;
    const projectedUsd = (stats.spentUsd / stats.daysElapsed) * stats.daysTotal;
    const projectedPct =
      budgetUsd > 0 && stats.daysElapsed > 0 ? Math.round((projectedUsd / budgetUsd) * 100) : null;
    const projectedIncome = (stats.income / stats.daysElapsed) * stats.daysTotal;
    return { isBudgetSet, dailyAllowance, actualPace, projected, isOver, isHighBurn, projectedPct, projectedIncome };
  }, [budget, stats, displayRate]);

  const weekdayNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 2023-10-01 was a Sunday — stable anchor for index 0.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 9, 1 + i)));
  }, [locale]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1200px]">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-4 h-72 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </main>
    );
  }

  const methodTotal = stats.byMethod.reduce((s, [, m]) => s + m.total, 0);
  const weekdayMax = Math.max(...stats.byWeekday, 1);
  const printed = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const cycleLabel = `${shortDate(cycle.start, locale)} – ${shortDate(cycle.end, locale)}`;
  const scoreTone =
    health.score >= 60 ? "var(--sf-income)" : health.score >= 45 ? "var(--sf-brass)" : "var(--sf-danger)";

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">
            {profile?.display_name ?? "Member"} · {profile?.email}
          </p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">
            {t("analytics")}
            <span className="caps ml-2 !text-primary-strong">{displayCurrency}</span>
          </h1>
        </div>
      </header>

      {error ? (
        <p className="border border-danger px-4 py-3 text-sm text-danger">{error}</p>
      ) : (
        <div className="space-y-4">
          {/* ═══ THE ANALYTICAL STATEMENT — one continuous sheet ═══ */}
          <section className="panel">
            {/* Masthead */}
            <div className="border-b-2 border-primary px-5 py-2.5 sm:px-6">
              <div className="flex items-center justify-between">
                <span className="caps !text-primary-strong">Analytical statement</span>
                <span className="caps">{cycleLabel}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="stamp">Tri-flow analysis · {displayCurrency}</span>
                <span className="stamp">No. {cycleStatementNo(cycle)}</span>
              </div>
              <div className="mt-1 h-px bg-border" aria-hidden />
            </div>

            {/* Section: summary band */}
            <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] md:divide-x md:divide-y-0 divide-y divide-border">
              <div className="px-5 py-5 sm:px-6">
                <p className="caps">Net savings — this cycle</p>
                <p className={`figures mt-2 font-bold leading-none ${stats.net >= 0 ? "text-income" : "text-danger"}`}>
                  <FitText basePx={38} minPx={22}>
                    <span className="mr-1 text-base font-normal text-faint">
                      {stats.net >= 0 ? "+" : "−"}
                    </span>
                    {fmt(Math.abs(stats.net))}
                  </FitText>
                </p>
                <p className="mt-3 text-xs text-text-muted">
                  {stats.daysElapsed} of {stats.daysTotal} days elapsed · {stats.expenseCount} expense
                  {stats.expenseCount === 1 ? "" : "s"} · {stats.activeDays} active days
                </p>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <p className="caps">
                  <span className="mr-1.5 inline-block h-2 w-2 translate-y-[-1px] bg-income" />
                  Inflow
                </p>
                <p className="figures mt-2 text-xl font-bold text-income">
                  <FitText basePx={20} minPx={13}>{fmt(stats.income)}</FitText>
                </p>
                <div className="mt-3 h-1 w-full bg-surface-elevated">
                  {/* One rounded figure, complement derived — the pair sums to 100%. */}
                  <div
                    className="h-full bg-income"
                    style={{
                      width: `${stats.income + stats.spent > 0 ? Math.round((stats.income / (stats.income + stats.spent)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <p className="caps">
                  <span className="mr-1.5 inline-block h-2 w-2 translate-y-[-1px] bg-danger" />
                  Outflow
                </p>
                <p className="figures mt-2 text-xl font-bold text-danger">
                  <FitText basePx={20} minPx={13}>{fmt(stats.spent)}</FitText>
                </p>
                <div className="mt-3 h-1 w-full bg-surface-elevated">
                  <div
                    className="h-full bg-danger"
                    style={{
                      width: `${stats.income + stats.spent > 0 ? 100 - Math.round((stats.income / (stats.income + stats.spent)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Section: fine metrics */}
            <div className="grid grid-cols-2 divide-y divide-border border-t border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <MetricCell label="Daily velocity" value={fmt(stats.dailyVelocity)} sub="outflow per day" />
              <MetricCell label="Peak entry" value={fmt(stats.peak)} sub="single largest" />
              <MetricCell label="Average ticket" value={fmt(stats.avgTicket)} sub="per expense" />
              <MetricCell label="Savings rate" value={stats.income > 0 ? `${Math.round(((stats.income - stats.spent) / stats.income) * 100)}%` : "—"} sub="income retained" />
            </div>

            {/* Section: cash flow chart (embedded) */}
            <div className="panel-rule border-t border-border">
              <FlowChartCard label="Cash flow — by range" bare />
            </div>

            {/* Section: burn analysis */}
            <div className="border-t border-border">
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="caps">Burn analysis</span>
                {burn.isBudgetSet && (
                  <span
                    className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      burn.isOver
                        ? "border-danger text-danger"
                        : burn.isHighBurn
                          ? "border-brass text-brass"
                          : "border-income text-income"
                    }`}
                  >
                    {burn.isOver ? "Over budget" : burn.isHighBurn ? "High burn" : "On track"}
                  </span>
                )}
              </div>
              <div className="p-5 pt-3">
                {burn.isBudgetSet ? (
                  <>
                    <BurnAxis
                      spentPct={budget ? (stats.spent / budget) * 100 : 0}
                      projectedPct={burn.projectedPct}
                      budgetLabel={fmt(budget ?? 0)}
                      projectedLabel={fmt(burn.projected)}
                      currency={displayCurrency}
                    />
                    <div className="mt-5 grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                      <MetricCell label="Daily allowance" value={fmt(burn.dailyAllowance)} sub="budget ÷ days" />
                      <MetricCell
                        label="Actual pace"
                        value={fmt(burn.actualPace)}
                        sub={burn.isHighBurn ? "above allowance" : "within allowance"}
                      />
                      <MetricCell label="Projected close" value={fmt(burn.projected)} sub={`of ${fmt(budget ?? 0)}`} />
                      <MetricCell label="Projected income" value={fmt(burn.projectedIncome)} sub="at current pace" />
                    </div>
                  </>
                ) : (
                  <p className="border border-dashed border-border px-3 py-10 text-center">
                    <span className="caps">Set a budget in Profit &amp; Loss to unlock burn analysis</span>
                  </p>
                )}
              </div>
            </div>

            {/* Section: health factors + diagnostics */}
            <div className="grid grid-cols-1 divide-y divide-border border-t border-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-5">
                <p className="caps mb-3">
                  Health score —{" "}
                  <span className="figures font-bold" style={{ color: scoreTone }}>
                    {health.score}/100 · {health.grade}
                  </span>
                </p>
                <div>
                  {health.factors.map((f) => {
                    const ratio = f.max > 0 ? f.points / f.max : 0;
                    const tone = ratio >= 0.7 ? "var(--sf-income)" : ratio >= 0.4 ? "var(--sf-brass)" : "var(--sf-danger)";
                    return (
                      <div key={f.label} className="border-b border-border/60 py-2.5 last:border-0">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-semibold text-text">{f.label}</span>
                          <span className="numeric text-xs font-bold text-text-muted">
                            {f.points}
                            <span className="text-faint">/{f.max}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1 w-full bg-surface-elevated">
                          <div className="h-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: tone }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-border p-5 lg:border-l lg:border-t-0">
                <p className="caps mb-3">Diagnostics</p>
                {health.insights.length === 0 ? (
                  <p className="border border-dashed border-border px-3 py-8 text-center">
                    <span className="caps">Log entries to generate diagnostics</span>
                  </p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {health.insights.map((ins) => (
                      <div key={ins.title} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span
                          aria-hidden
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 border ${
                            ins.tone === "good"
                              ? "border-income bg-income/20"
                              : ins.tone === "warn"
                                ? "border-danger bg-danger/20"
                                : "border-info bg-info/20"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-bold text-text">{ins.title}</p>
                          <p className="mt-0.5 text-xs leading-snug text-text-muted">{ins.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section: composition */}
            <div className="grid grid-cols-1 divide-y divide-border border-t border-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              <div className="p-5">
                <p className="caps mb-3">By category</p>
                <CategoryBars
                  slices={stats.categories}
                  totalValue={fmt(stats.spent)}
                  totalLabel={t("spent")}
                  formatValue={fmt}
                />
              </div>
              <div className="border-t border-border p-5 lg:border-l lg:border-t-0">
                <p className="caps mb-3">By payment method</p>
                {stats.byMethod.length === 0 ? (
                  <p className="border border-dashed border-border px-3 py-8 text-center">
                    <span className="caps">No data</span>
                  </p>
                ) : (
                  <ul>
                    {stats.byMethod.map(([method, m]) => {
                      const pct = methodTotal > 0 ? Math.round((m.total / methodTotal) * 100) : 0;
                      return (
                        <li key={method} className="border-b border-border/60 py-2.5 last:border-0">
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-semibold text-text">{method}</span>
                            <span className="numeric text-sm font-bold text-text">{fmt(m.total)}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3">
                            <div className="h-1 flex-1 bg-surface-elevated">
                              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="numeric w-8 text-right text-[11px] text-faint">{pct}%</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="border-t border-border p-5 lg:border-l lg:border-t-0">
                <p className="caps mb-3">Weekday rhythm</p>
                <ul>
                  {stats.byWeekday.map((v, i) => (
                    <li key={i} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                      <span className="caps w-8 shrink-0">{weekdayNames[i]}</span>
                      <div className="h-2.5 flex-1 bg-surface-elevated">
                        <div
                          className={`h-full transition-all ${i === 0 || i === 6 ? "bg-brass" : "bg-primary"}`}
                          style={{ width: `${Math.round((v / weekdayMax) * 100)}%` }}
                        />
                      </div>
                      <span className="numeric w-20 shrink-0 text-right text-xs font-bold text-text">{fmt(v)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-faint">Brass rows mark weekends.</p>
              </div>
            </div>

            {/* End of statement */}
            <div className="end-rule flex items-center justify-between px-5 py-2 sm:px-6">
              <span className="stamp">End of analysis</span>
              <span className="stamp">
                {rows.length} entries · printed {printed}
              </span>
            </div>
          </section>

          <p className="text-[11px] text-faint">
            Covers your latest 1,000 entries for the current cycle. Adherence and projection
            percentages are computed in canonical USD so they never drift when you switch display
            currency.
          </p>
        </div>
      )}
    </main>
  );
}

function MetricCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-5 py-4">
      <p className="caps">{label}</p>
      <div className="figures mt-1.5 font-bold text-text">
        <FitText basePx={18} minPx={12} title={label}>
          {value}
        </FitText>
      </div>
      <p className="mt-0.5 text-[11px] text-faint">{sub}</p>
    </div>
  );
}

/* ── Burn axis: 0 → scale end with spent fill, budget tick, projection marker ── */
function BurnAxis({
  spentPct,
  projectedPct,
  budgetLabel,
  projectedLabel,
  currency,
}: {
  spentPct: number;
  projectedPct: number | null;
  budgetLabel: string;
  projectedLabel: string;
  currency: string;
}) {
  const scaleEnd = Math.max(110, (projectedPct ?? 0) + 10);
  const at = (pct: number) => `${Math.min((pct / scaleEnd) * 100, 100)}%`;
  const over = (projectedPct ?? 0) > 100;

  return (
    <div>
      <div className="relative h-2.5 w-full bg-surface-elevated">
        <div
          className={`absolute inset-y-0 left-0 ${spentPct > 100 ? "bg-danger" : "bg-primary"}`}
          style={{ width: at(spentPct) }}
        />
        <div className="absolute inset-y-[-3px] w-0.5 bg-text" style={{ left: at(100) }} aria-hidden />
        {projectedPct != null && (
          <div
            className={`absolute top-[-5px] h-[22px] w-[3px] ${over ? "bg-danger" : "bg-warning"}`}
            style={{ left: at(projectedPct) }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="stamp">0 · spent {Math.round(spentPct)}%</span>
        <span className="stamp">
          Budget {budgetLabel} · {currency}
        </span>
      </div>
      {projectedPct != null && (
        <p
          className="numeric mt-1 text-[11px] font-bold"
          style={{ color: over ? "var(--sf-danger)" : "var(--sf-brass)" }}
        >
          {over ? "▲" : "▼"} Projected {projectedPct}% — {projectedLabel}
        </p>
      )}
    </div>
  );
}

function shortDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
