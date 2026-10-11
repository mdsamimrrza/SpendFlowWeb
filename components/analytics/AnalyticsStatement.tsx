"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  Calendar,
  CheckCircle2,
  Flame,
  PieChart,
  PiggyBank,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter, useBudget } from "@/hooks/useRates";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { listExpenses, type ExpenseRow } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { Skeleton } from "@/components/ui/Skeleton";
import { FloatingSelect, SelectRow } from "@/components/ui/FloatingSelect";
import { FitText } from "@/components/ui/FitText";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { ShareDonut } from "@/components/charts/ShareDonut";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { TrendArea } from "@/components/charts/TrendArea";
import { RankedBars } from "@/components/charts/RankedBars";
import { CalendarHeatmap } from "@/components/charts/CalendarHeatmap";
import {
  formatMoney,
  getCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  toISODate,
} from "@/utils/format";

/**
 * Analytics - Reports view (2026-10-11 structural redesign, market pattern:
 * Monarch Money Reports / Copilot Money insights). Same data engine (rows,
 * useRowConverter, health-score formulas), new chart composition:
 *  · Header: kicker + title + period selector (This cycle / Last 30 / Last
 *    90 / This year - windows computed like FlowChartCard's).
 *  · KPI band: Net / Inflow / Outflow / Savings rate, live with the period,
 *    with the TriFlow insight as a compact strip underneath.
 *  · MonthlyBars (6-month income-vs-expense columns) + ShareDonut "where
 *    money goes" (center total, token-hue slices).
 *  · TrendArea "net over time" (cumulative area) + Financial Health ring.
 *  · RankedBars "top categories" + CalendarHeatmap "daily spending".
 * All figures flow through the privacy mask; all colors through --sf-* tokens.
 */

/* mobile VIBRANT_PALETTE (components/expense/Charts.tsx) - fixed DATA colors
   (mobile renders the same hexes), also consumed by the cycle-report page. */
export const VIBRANT_PALETTE = [
  "#4F46E5", // Indigo
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
] as const;

type PeriodKey = "cycle" | "d30" | "d90" | "year";

const PERIODS: { key: PeriodKey; labelKey: TranslationKey }[] = [
  { key: "cycle", labelKey: "anThisCycle" },
  { key: "d30", labelKey: "anLast30" },
  { key: "d90", labelKey: "anLast90" },
  { key: "year", labelKey: "anThisYear" },
];

interface Insight {
  tone: "success" | "warning" | "info";
  Icon: typeof ShieldCheck;
  title: string;
  desc: string;
}

/* Design-preview seam: /preview-analytics passes mock rows/profile/budget so
   the screen renders without auth. Undefined in production - the page then
   reads everything from its own hooks exactly as before. */
export interface AnalyticsInject {
  rows: Awaited<ReturnType<typeof listExpenses>>["rows"];
  profile?: {
    display_name?: string | null;
    email?: string | null;
    preferred_currency?: string;
    cycle_start_day?: number;
    cycle_end_day?: number | null;
  } | null;
  budget?: number | null;
}

export function AnalyticsStatement({ inject }: { inject?: AnalyticsInject }) {
  const { user, profile: authProfile } = useAuth();
  const profile = inject?.profile ?? authProfile;
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  // rows feed the converter so NPR dates resolve via their INR rate (peg parity).
  const [fetchedRows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>(inject?.rows ?? []);
  const rows = inject ? inject.rows : fetchedRows;
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const authBudget = useBudget();
  const budget = inject ? (inject.budget ?? null) : authBudget;
  const supabase = getSupabaseBrowserClient();

  const [loading, setLoading] = useState(!inject);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inject) {
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 2500);

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
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [user, supabase, t, inject]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = useCallback(
    (n: number) => mask(formatMoney(n, displayCurrency, locale)),
    [mask, displayCurrency, locale],
  );
  const compactFmt = useMemo(() => {
    const f = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    return (n: number) => f.format(n);
  }, [locale]);

  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );
  const cycleFrom = toISODate(cycle.start);
  const cycleTo = toISODate(cycle.end);

  /* ── Screen state ── */
  const [period, setPeriod] = useState<PeriodKey>("cycle");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  // Period windows computed like FlowChartCard: cycle via getCycleWindow,
  // trailing day spans, calendar year.
  const periodWindow = useMemo(() => {
    const now = new Date();
    const todayS = toISODate(now);
    switch (period) {
      case "cycle":
        return { from: cycleFrom, to: cycleTo };
      case "d30":
        return { from: shiftDays(todayS, -29), to: todayS };
      case "d90":
        return { from: shiftDays(todayS, -89), to: todayS };
      case "year":
        return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
  }, [period, cycleFrom, cycleTo]);

  // Inclusive day counts for the selected window; the visible end clamps to
  // today so future windows never render an empty projected tail.
  const periodDays = useMemo(() => {
    const todayS = toISODate(new Date());
    if (period === "cycle") {
      return {
        total: cycleDaysTotal(cycle),
        elapsed: cycleDaysElapsed(cycle, new Date()),
        from: cycleFrom,
        to: cycleTo < todayS ? cycleTo : todayS,
      };
    }
    const end = periodWindow.to < todayS ? periodWindow.to : todayS;
    const daysIn = (a: string, b: string) =>
      Math.max(
        1,
        Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1,
      );
    return {
      total: daysIn(periodWindow.from, end),
      elapsed: daysIn(periodWindow.from, end),
      from: periodWindow.from,
      to: end,
    };
  }, [period, periodWindow, cycle, cycleFrom, cycleTo]);

  // Rows inside the selected period window.
  const periodRows = useMemo(
    () => rows.filter((r) => r.date >= periodDays.from && r.date <= periodDays.to),
    [rows, periodDays.from, periodDays.to],
  );

  // Window aggregate builder - called for the selected period (KPIs, donut,
  // ranked bars, health inputs) and for the cycle (budget adherence).
  const buildStats = useCallback(
    (fromISO: string, toISO: string, total: number, elapsed: number) => {
      let spent = 0;
      let income = 0;
      let expenseCount = 0;
      let entries = 0;
      let weekendSpend = 0;
      const byCategory = new Map<
        string,
        { label: string; value: number; id: string | null; count: number; color?: string | null; icon?: string | null }
      >();

      for (const row of rows) {
        if (row.date < fromISO || row.date > toISO) continue;
        entries += 1;
        const v = convert(row);
        if (row.type === "income") {
          income += v;
          continue;
        }
        spent += v;
        expenseCount += 1;
        const wd = new Date(`${row.date}T00:00:00`).getDay();
        if (wd === 0 || wd === 6) weekendSpend += v;
        const name = row.categories?.name ?? "Other";
        const slice = byCategory.get(name) ?? {
          label: name,
          value: 0,
          id: row.category_id,
          count: 0,
          color: row.categories?.color,
          icon: row.categories?.icon,
        };
        slice.value += v;
        slice.count += 1;
        byCategory.set(name, slice);
      }

      return {
        net: income - spent,
        spent,
        income,
        expenseCount,
        entries,
        weekendSpend,
        daysElapsed: elapsed,
        daysTotal: total,
        categories: Array.from(byCategory.values()).sort((a, b) => b.value - a.value),
      };
    },
    [rows, convert],
  );

  const stats = useMemo(
    () => buildStats(periodDays.from, periodDays.to, periodDays.total, periodDays.elapsed),
    [buildStats, periodDays],
  );
  const cycleStats = useMemo(
    () => buildStats(cycleFrom, cycleTo, cycleDaysTotal(cycle), cycleDaysElapsed(cycle, new Date())),
    [buildStats, cycle, cycleFrom, cycleTo],
  );

  /* ── Financial Health Score - mobile FinancialHealthScoreCard, 1:1 ── */
  const health = useMemo(() => {
    const expenseItems = periodRows.filter((e) => e.type !== "income");
    const incomeItems = periodRows.filter((e) => e.type === "income");

    if (expenseItems.length === 0 && incomeItems.length === 0) {
      return {
        score: 75,
        grade: "B+",
        status: t("anStatusNeutral"),
        color: "var(--sf-hue-sky)",
        savingsRate: null as number | null,
        insights: [
          {
            tone: "info" as const,
            Icon: ShieldCheck,
            title: t("anAwaitTitle"),
            desc: t("anAwaitDesc"),
          },
        ],
      };
    }

    let budgetPoints = 30; // max 35 - default when no budget on file
    let volatilityPoints = 20; // max 25
    let categoryPoints = 18; // max 20
    let weekendPoints = 16; // max 20
    let savingsBonus = 0; // max 10
    const insights: Insight[] = [];

    let computedSavingsRate: number | null = null;

    // 1. Savings rate & cash-flow diagnostic (bonus 0-10)
    if (stats.income > 0) {
      const netSavings = stats.income - stats.spent;
      const rate = netSavings / stats.income;
      computedSavingsRate = Math.round(rate * 100);

      if (rate >= 0.2) {
        savingsBonus = 10;
        insights.push({
          tone: "success",
          Icon: Sparkles,
          title: t("anInsSavingsTitle"),
          desc: tr(t("anInsSavingsDesc"), { r: String(computedSavingsRate) }),
        });
      } else if (rate > 0) {
        savingsBonus = 5;
        insights.push({
          tone: "info",
          Icon: ShieldCheck,
          title: t("anInsPosTitle"),
          desc: tr(t("anInsPosDesc"), { amt: fmt(netSavings) }),
        });
      } else {
        insights.push({
          tone: "warning",
          Icon: AlertTriangle,
          title: t("anInsDeficitTitle"),
          desc: tr(t("anInsDeficitDesc"), { amt: fmt(Math.abs(netSavings)) }),
        });
      }
    }

    // 2. Budget adherence (0-35) - budget is a cycle figure, pinned to the
    // cycle window regardless of the period dropdown (mobile parity).
    if (budget != null && budget > 0) {
      const budgetUsedRatio = cycleStats.spent / budget;
      const expectedRatio = cycleStats.daysElapsed / cycleStats.daysTotal;
      if (budgetUsedRatio <= expectedRatio) {
        budgetPoints = 35;
        insights.push({
          tone: "success",
          Icon: CheckCircle2,
          title: t("anInsOptimalTitle"),
          desc: tr(t("anInsOptimalDesc"), { amt: fmt(budget) }),
        });
      } else if (budgetUsedRatio <= 1.0) {
        const excess = Math.round((budgetUsedRatio - expectedRatio) * 100);
        budgetPoints = Math.max(10, 35 - excess * 0.6);
        insights.push({
          tone: "warning",
          Icon: AlertTriangle,
          title: t("anInsElevatedTitle"),
          desc: tr(t("anInsElevatedDesc"), { x: String(excess) }),
        });
      } else {
        budgetPoints = 5;
        insights.push({
          tone: "warning",
          Icon: Flame,
          title: t("anInsCeilingTitle"),
          desc: t("anInsCeilingDesc"),
        });
      }
    }

    // 3. Spending volatility & spikes (0-25) - CV of active-day totals
    const dailyMap = new Map<string, number>();
    for (const e of expenseItems) {
      dailyMap.set(e.date, (dailyMap.get(e.date) ?? 0) + convert(e));
    }
    const dailyValues = Array.from(dailyMap.values());
    if (dailyValues.length >= 3) {
      const avgDaily = stats.spent / Math.max(dailyValues.length, 1);
      const variance = dailyValues.reduce((sum, v) => sum + Math.pow(v - avgDaily, 2), 0) / dailyValues.length;
      const cv = Math.sqrt(variance) / Math.max(avgDaily, 1);
      if (cv < 0.6) {
        volatilityPoints = 25;
        insights.push({
          tone: "success",
          Icon: Sparkles,
          title: t("anInsStableTitle"),
          desc: t("anInsStableDesc"),
        });
      } else if (cv < 1.2) {
        volatilityPoints = 18;
      } else {
        volatilityPoints = 10;
        insights.push({
          tone: "warning",
          Icon: TrendingUp,
          title: t("anInsSpikeTitle"),
          desc: t("anInsSpikeDesc"),
        });
      }
    }

    // 4. Category concentration & diversity (0-20)
    if (stats.categories.length > 0) {
      const topCat = stats.categories[0];
      const topRatio = topCat.value / Math.max(stats.spent, 1);
      if (topRatio > 0.6 && stats.categories.length > 1) {
        categoryPoints = 10;
        insights.push({
          tone: "warning",
          Icon: AlertTriangle,
          title: t("anInsConcTitle"),
          desc: tr(t("anInsConcDesc"), { c: topCat.label, p: String(Math.round(topRatio * 100)) }),
        });
      } else {
        categoryPoints = 20;
        insights.push({
          tone: "success",
          Icon: ShieldCheck,
          title: t("anInsDiversifiedTitle"),
          desc: t("anInsDiversifiedDesc"),
        });
      }
    }

    // 5. Weekend vs weekday surge ratio (0-20)
    const weekendRatio = stats.spent > 0 ? stats.weekendSpend / Math.max(stats.spent, 1) : 0;
    if (weekendRatio > 0.55 && stats.expenseCount >= 4) {
      weekendPoints = 10;
      insights.push({
        tone: "warning",
        Icon: TrendingDown,
        title: t("anInsWeekendTitle"),
        desc: tr(t("anInsWeekendDesc"), { p: String(Math.round(weekendRatio * 100)) }),
      });
    } else {
      weekendPoints = 20;
    }

    // Total score 0-100 (mobile: floor 10, cap 100)
    const baseScore = budgetPoints + volatilityPoints + categoryPoints + weekendPoints;
    const totalScore = Math.min(100, Math.max(10, Math.round(baseScore + savingsBonus)));

    let grade = "D";
    let status = t("anStatusOver");
    let color = "var(--sf-hue-red)";
    if (totalScore >= 90) {
      grade = "A+";
      status = t("anStatusElite");
      color = "var(--sf-hue-emerald)";
    } else if (totalScore >= 75) {
      grade = "A";
      status = t("anStatusStrong");
      color = "var(--sf-hue-sky)";
    } else if (totalScore >= 60) {
      grade = "B";
      status = t("anStatusModerate");
      color = "var(--sf-hue-amber)";
    } else if (totalScore >= 45) {
      grade = "C";
      status = t("anStatusRisk");
      color = "var(--sf-hue-orange)";
    }

    return {
      score: totalScore,
      grade,
      status,
      color,
      savingsRate: computedSavingsRate,
      insights: insights.slice(0, 3),
    };
  }, [stats, cycleStats, budget, periodRows, convert, fmt, t]);

  /* ── Chart series (all derived from the same rows/convert aggregates) ── */

  // Last 6 calendar months incl. the current one (independent of the period
  // dropdown - a month-over-month comparison needs its own fixed window).
  const monthlyMonths = useMemo(() => {
    const now = new Date();
    const labelFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    const agg = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      const key = row.date.slice(0, 7);
      const slot = agg.get(key) ?? { income: 0, expense: 0 };
      if (row.type === "income") slot.income += convert(row);
      else slot.expense += convert(row);
      agg.set(key, slot);
    }
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const slot = agg.get(key) ?? { income: 0, expense: 0 };
      return { label: labelFmt.format(d), income: slot.income, expense: slot.expense, isCurrent: i === 5 };
    });
  }, [rows, convert, locale]);

  // Cumulative net per day across the selected window (ends today - future
  // days carry no entries, so the line would just flatline into them).
  const trendPoints = useMemo(() => {
    const agg = new Map<string, number>();
    for (const row of rows) {
      if (row.date < periodDays.from || row.date > periodDays.to) continue;
      const signed = row.type === "income" ? convert(row) : -convert(row);
      agg.set(row.date, (agg.get(row.date) ?? 0) + signed);
    }
    const out: { date: string; net: number }[] = [];
    let run = 0;
    for (let d = periodDays.from, i = 0; d <= periodDays.to && i < 500; d = shiftDays(d, 1), i++) {
      run += agg.get(d) ?? 0;
      out.push({ date: d, net: run });
    }
    return out;
  }, [rows, periodDays.from, periodDays.to, convert]);

  // Daily expense map for the calendar heatmap (all months, navigation is local).
  const daySpend = useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of rows) {
      if (row.type === "income") continue;
      m[row.date] = (m[row.date] ?? 0) + convert(row);
    }
    return m;
  }, [rows, convert]);

  // Donut: top 5 slices + "Other" remainder. Category colors come from the
  // stored data; the donut falls back to token hues when a category has none.
  const donutSlices = useMemo(() => {
    const top = stats.categories.slice(0, 5).map((c) => ({
      label: c.label,
      value: c.value,
      color: c.color ?? null,
    }));
    const rest = stats.categories.slice(5).reduce((s, c) => s + c.value, 0);
    if (rest > 0) top.push({ label: t("analyticsOther"), value: rest, color: "var(--sf-faint)" });
    return top;
  }, [stats.categories, t]);

  const rankedRows = useMemo(
    () =>
      stats.categories.slice(0, 6).map((c) => ({
        label: c.label,
        value: c.value,
        color: c.color ?? null,
      })),
    [stats.categories],
  );

  // KPI band + TriFlow insight strip figures.
  const totalFlow = stats.income + stats.spent;
  const incomePct = totalFlow > 0 ? Math.round((stats.income / totalFlow) * 100) : 50;
  const outflowPct = 100 - incomePct;
  const savingsRate = stats.income > 0 ? Math.round((stats.net / stats.income) * 100) : null;
  const budgetSet = budget != null && budget > 0;
  const overBudget = budgetSet && stats.spent > (budget ?? 0);
  const utilization = budgetSet ? Math.round((stats.spent / (budget ?? 0)) * 100) : 0;
  const healthy = stats.net >= 0;
  const triFlowInsight =
    overBudget && !healthy
      ? tr(t("triFlowInsightCritical"), { a: fmt(stats.spent - (budget ?? 0)), b: fmt(Math.abs(stats.net)) })
      : overBudget && healthy
        ? tr(t("triFlowInsightOverPositive"), { a: fmt(stats.spent - (budget ?? 0)), b: fmt(stats.net) })
        : stats.income > 0 && !healthy
          ? tr(t("triFlowInsightDeficit"), { a: fmt(Math.abs(stats.net)) })
          : stats.income > 0 && healthy
            ? tr(t("triFlowInsightHealthy"), { a: fmt(stats.net), r: String(savingsRate) })
            : tr(t("triFlowInsightTracking"), { a: fmt(stats.spent), n: String(stats.expenseCount) });

  // Calendar navigation: never past the current month.
  const nowCal = new Date();
  const calIsCurrent =
    calMonth.year === nowCal.getFullYear() && calMonth.month === nowCal.getMonth();
  const calPrev = () =>
    setCalMonth((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }));
  const calNext = () =>
    setCalMonth((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }));

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <Skeleton className="mb-6 h-9 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-4 h-28 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-4 sm:px-6">
      <div className="space-y-3">
        {/* ── 1. HEADER ── */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-faint">{t("anKicker")}</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
              {t("anTitle")}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PrivacyEyeButton />
            {/* Mobile shows the shell's global toggle (user request 2026-09-16). */}
            <ThemeToggle className="hidden p-2 sm:grid" />
          </div>
        </header>

        {/* ── 2. PERIOD SELECTOR ── */}
        <div className="relative z-40 max-w-[280px]">
          {periodOpen && (
            <button
              type="button"
              aria-label={t("anCloseMenus")}
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setPeriodOpen(false)}
            />
          )}
          <FloatingSelect
            className="relative z-50"
            icon={<Calendar size={14} className="shrink-0 text-primary" aria-hidden />}
            label={t(PERIODS.find((p) => p.key === period)?.labelKey ?? "anThisCycle")}
            open={periodOpen}
            onToggle={() => setPeriodOpen((v) => !v)}
          >
            {PERIODS.map((opt) => (
              <SelectRow
                key={opt.key}
                selected={period === opt.key}
                label={t(opt.labelKey)}
                onSelect={() => {
                  setPeriod(opt.key);
                  setPeriodOpen(false);
                }}
              />
            ))}
          </FloatingSelect>
        </div>

        {error ? <p className="border border-danger p-4 text-sm text-danger">{error}</p> : null}

        {!error && (
          <>
            {/* ── 3. KPI BAND (MoneyPulseHero pattern, live with the period) ── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label={t("homeNetCashFlow")} icon={<Scale size={14} aria-hidden />}>
                <div className={`figures-display mt-2 ${stats.net < 0 ? "text-danger" : "text-text"}`}>
                  <FitText basePx={30} minPx={12} title={t("homeNetCashFlow")}>
                    <span className="mr-0.5 text-[0.55em] text-faint">{stats.net < 0 ? "−" : "+"}</span>
                    {fmt(Math.abs(stats.net))}
                  </FitText>
                </div>
                <p className="numeric mt-2.5 text-[11px] text-faint">
                  {stats.entries} {t("homeEntriesWord")}
                </p>
              </KpiCard>

              <KpiCard
                label={t("homeInflow")}
                icon={<ArrowDownLeft size={14} aria-hidden />}
                iconTone="bg-income/10 text-income"
              >
                <div className="figures-display mt-2 text-income">
                  <FitText basePx={30} minPx={12} title={t("homeInflow")}>
                    {fmt(stats.income)}
                  </FitText>
                </div>
                <div className="mt-auto pt-2.5">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full bg-income transition-[width] duration-500" style={{ width: `${incomePct}%` }} />
                  </div>
                  <p className="numeric mt-1 text-[11px] text-faint">{incomePct}%</p>
                </div>
              </KpiCard>

              <KpiCard
                label={t("homeOutflow")}
                icon={<ArrowUpRight size={14} aria-hidden />}
                iconTone="bg-rust-tint text-danger"
              >
                <div className="figures-display mt-2 text-danger">
                  <FitText basePx={30} minPx={12} title={t("homeOutflow")}>
                    {fmt(stats.spent)}
                  </FitText>
                </div>
                <div className="mt-auto pt-2.5">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${outflowPct}%`, backgroundColor: "var(--sf-expense-series)" }} />
                  </div>
                  <p className="numeric mt-1 text-[11px] text-faint">{outflowPct}%</p>
                </div>
              </KpiCard>

              <KpiCard
                label={t("homeSavingsRate")}
                icon={<PiggyBank size={14} aria-hidden />}
                iconTone="bg-income/10 text-income"
              >
                <div
                  className={`figures-display mt-2 ${
                    savingsRate == null ? "text-faint" : savingsRate >= 20 ? "text-income" : "text-text"
                  }`}
                >
                  <FitText basePx={30} minPx={12} title={t("homeSavingsRate")}>
                    {savingsRate != null ? `${savingsRate}%` : "-"}
                  </FitText>
                </div>
                <p className="mt-auto pt-2.5 text-[11px] text-faint">{t("homeKeptOfIncome")}</p>
              </KpiCard>
            </div>

            {/* ── 4. TriFlow insight as a compact strip ── */}
            <div
              className="flex items-center gap-2 rounded-xl border border-border p-3"
              style={{
                backgroundColor: overBudget
                  ? "var(--sf-tile-expense-bg)"
                  : stats.income > 0 && healthy
                    ? "var(--sf-tile-income-bg)"
                    : "var(--sf-surface)",
              }}
            >
              {overBudget ? (
                <TrendingUp size={16} className="shrink-0 text-danger" aria-hidden />
              ) : stats.income > 0 && healthy ? (
                <TrendingDown size={16} className="shrink-0 text-income" aria-hidden />
              ) : (
                <Zap size={16} className="shrink-0 text-primary" aria-hidden />
              )}
              <p
                className="min-w-0 flex-1 text-[11.5px] leading-4"
                style={{
                  color: overBudget || (stats.income > 0 && !healthy) ? "var(--sf-danger)" : "var(--sf-text)",
                }}
              >
                {triFlowInsight}
              </p>
              {!budgetSet && (
                <span className="numeric shrink-0 text-[11px] font-bold text-faint">{t("triFlowNotSet")}</span>
              )}
            </div>

            {/* ── 5. Row: monthly comparison + category-share donut ── */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-start">
              <section className="panel p-4 sm:p-5 lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="caps">{t("anMonthlyBars")}</p>
                  <span className="numeric text-[11.5px] text-text-muted">
                    <span className="font-semibold text-income">IN {fmt(monthlyMonths.reduce((s, m) => s + m.income, 0))}</span>
                    <span className="mx-1.5 text-faint">·</span>
                    <span className="font-semibold" style={{ color: "var(--sf-expense-series)" }}>
                      OUT {fmt(monthlyMonths.reduce((s, m) => s + m.expense, 0))}
                    </span>
                  </span>
                </div>
                <MonthlyBars months={monthlyMonths} formatted={fmt} compact={compactFmt} />
              </section>

              <section className="panel p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="caps">{t("anWhereMoneyGoes")}</p>
                  <p className="stamp">{t(PERIODS.find((p) => p.key === period)?.labelKey ?? "anThisCycle")}</p>
                </div>
                <ShareDonut slices={donutSlices} formatted={fmt} centerLabel={t("triFlowSpent")} />
              </section>
            </div>

            {/* ── 6. Row: net trend + financial health ── */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-start">
              <section className="panel p-4 sm:p-5 lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="caps">{t("anNetTrend")}</p>
                  <span
                    className={`figures text-sm font-bold ${stats.net >= 0 ? "text-income" : "text-danger"}`}
                  >
                    {stats.net >= 0 ? "+" : "−"}
                    {fmt(Math.abs(stats.net))}
                  </span>
                </div>
                <TrendArea points={trendPoints} formatted={fmt} locale={locale} />
              </section>

              <HealthScoreCard health={health} t={t} entries={stats.entries} onOpen={() => setHealthModalOpen(true)} />
            </div>

            {/* ── 7. Row: top categories + daily-spending calendar ── */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
              <section className="panel p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="caps">{t("anTopCategories")}</p>
                  <span className="stamp">
                    {t("anTotalSpending")}: <span className="numeric font-bold text-text">{fmt(stats.spent)}</span>
                  </span>
                </div>
                <RankedBars rows={rankedRows} formatted={fmt} />
              </section>

              <section className="panel p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="caps">{t("anDailySpend")}</p>
                </div>
                <CalendarHeatmap
                  year={calMonth.year}
                  month={calMonth.month}
                  spend={daySpend}
                  formatted={fmt}
                  onPrevMonth={calPrev}
                  onNextMonth={calNext}
                  canNextMonth={!calIsCurrent}
                  totalLabel={t("anMonthTotal")}
                />
              </section>
            </div>
          </>
        )}
      </div>

      {/* ── HEALTH SCORE CALCULATION EXPLAINER MODAL ── */}
      <CenterModal open={healthModalOpen} onClose={() => setHealthModalOpen(false)} maxWidth={440}>
        <div className="space-y-3.5">
          <ModalHead
            iconBg="var(--sf-tint-indigo)"
            icon={<Award size={20} className="text-primary" aria-hidden />}
            title={t("anHmTitle")}
            sub={t("anHmSub")}
            onClose={() => setHealthModalOpen(false)}
          />
          <div className="max-h-[55vh] space-y-3.5 overflow-y-auto pr-0.5">
            <p className="text-[13px] leading-[18px] text-text-muted">{t("anHmIntro")}</p>
            {(
              [
                { Icon: Target, c: "var(--sf-hue-emerald)", title: t("anHmP1"), pts: t("anHmP1Pts"), desc: t("anHmP1Desc") },
                { Icon: Activity, c: "var(--sf-hue-sky)", title: t("anHmP2"), pts: t("anHmP2Pts"), desc: t("anHmP2Desc") },
                { Icon: PieChart, c: "var(--sf-hue-indigo)", title: t("anHmP3"), pts: t("anHmP3Pts"), desc: t("anHmP3Desc") },
                { Icon: Calendar, c: "var(--sf-hue-amber)", title: t("anHmP4"), pts: t("anHmP4Pts"), desc: t("anHmP4Desc") },
                { Icon: Sparkles, c: "var(--sf-hue-emerald)", title: t("anHmP5"), pts: t("anHmP5Pts"), desc: t("anHmP5Desc") },
              ] as const
            ).map((p, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-border p-3" style={{ backgroundColor: "var(--sf-surface-elevated)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <p.Icon size={16} aria-hidden style={{ color: p.c }} />
                    <span className="truncate text-[13.5px] font-extrabold text-text">
                      {i + 1}. {p.title}
                    </span>
                  </span>
                  <span className="numeric shrink-0 text-xs font-extrabold" style={{ color: p.c }}>
                    {p.pts}
                  </span>
                </div>
                <p className="text-xs leading-4 text-text-muted">{p.desc}</p>
              </div>
            ))}
            <div className="space-y-2 pt-1">
              <p className="text-[13px] font-extrabold text-text">{t("anHmScale")}</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { txt: "90-100: A+ (Elite)", c: "var(--sf-hue-emerald)", bg: "var(--sf-tint-emerald-15)" },
                  { txt: "75-89: A (Strong)", c: "var(--sf-hue-sky)", bg: "var(--sf-tint-sky-15)" },
                  { txt: "60-74: B (Moderate)", c: "var(--sf-hue-amber)", bg: "var(--sf-tint-amber-15)" },
                  { txt: "45-59: C (Risk)", c: "var(--sf-hue-orange)", bg: "var(--sf-tint-orange-15)" },
                  { txt: "<45: D (Over limit)", c: "var(--sf-hue-red)", bg: "var(--sf-tint-red-15)" },
                ].map((g) => (
                  <span key={g.txt} className="numeric rounded-lg px-2 py-1 text-[11px] font-bold" style={{ backgroundColor: g.bg, color: g.c }}>
                    {g.txt}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHealthModalOpen(false)}
            className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white transition active:scale-[0.99]"
          >
            {t("anGotIt")}
          </button>
        </div>
      </CenterModal>
    </main>
  );
}

/* ══════════════════════ shared bits ══════════════════════ */

/** {token} substitution - i18n fragments composed with live figures. */
function tr(s: string, map: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? "");
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── KPI band card (MoneyPulseHero pattern) ── */
function KpiCard({
  label,
  icon,
  iconTone = "bg-surface-elevated text-text-muted",
  children,
}: {
  label: string;
  icon: ReactNode;
  iconTone?: string;
  children: ReactNode;
}) {
  return (
    <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="caps truncate">{label}</p>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${iconTone}`}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

/* ── Centered modal shell matching the mobile explainers ── */
function CenterModal({
  open,
  onClose,
  children,
  maxWidth = 420,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/[0.72] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-pop"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ModalHead({
  icon,
  iconBg,
  title,
  sub,
  onClose,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  sub: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg }}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-text">{title}</p>
          <p className="truncate text-[11.5px] text-text-muted">{sub}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated transition hover:opacity-80 active:scale-95"
      >
        <X size={15} className="text-text" aria-hidden />
      </button>
    </div>
  );
}

/* ── Financial Health Score card - mobile FinancialHealthScoreCard ── */
function HealthScoreCard({
  health,
  t,
  entries,
  onOpen,
}: {
  health: {
    score: number;
    grade: string;
    status: string;
    color: string;
    savingsRate: number | null;
    insights: Insight[];
  };
  t: (k: TranslationKey) => string;
  entries: number;
  onOpen: () => void;
}) {
  return (
    <section className="panel space-y-3 p-4 sm:p-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-1.5 text-left transition active:scale-[0.98]">
          <Award size={18} className="shrink-0 text-primary" aria-hidden />
          <span className="truncate text-[15px] font-semibold text-text">{t("anHealthTitle")}</span>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] transition active:scale-[0.97]"
          style={{ backgroundColor: "var(--sf-track)" }}
        >
          <ShieldCheck size={12} aria-hidden style={{ color: health.color }} />
          <span className="text-[11px] font-semibold" style={{ color: health.color }}>
            {health.status}
          </span>
        </button>
      </div>

      {/* radial dial + grade */}
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-[18px] text-left transition active:scale-[0.99]">
        <ProgressRing
          pct={health.score / 100}
          size={96}
          strokeWidth={8}
          color={health.color}
          trackColor="var(--sf-track-2)"
          ariaLabel={`${t("anHealthTitle")}: ${health.score}/100`}
        >
          <span className="numeric text-2xl font-bold" style={{ color: health.color }}>
            {health.score}
          </span>
          <span className="caps-faint !text-[9px]">{t("anScoreWord")}</span>
        </ProgressRing>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold text-white"
              style={{ backgroundColor: health.color }}
              aria-hidden
            >
              {health.grade}
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold leading-snug text-text">{health.status}</span>
              <span className="block text-[11px] leading-snug text-text-muted">{tr(t("anCalcAcross"), { n: String(entries) })}</span>
            </span>
          </span>
          {health.savingsRate !== null && (
            <span className="flex items-center">
              <span
                className="inline-flex items-center gap-1 rounded-md px-[7px] py-[2px] text-[11px] font-extrabold"
                style={{
                  backgroundColor: health.savingsRate >= 20 ? "var(--sf-tint-emerald-15)" : "var(--sf-tint-amber-15)",
                  color: health.savingsRate >= 20 ? "var(--sf-hue-emerald)" : "var(--sf-hue-amber)",
                }}
              >
                <Sparkles size={11} aria-hidden />
                {tr(t("anSavingsRatePill"), { r: String(health.savingsRate) })}
              </span>
            </span>
          )}
          <span className="block text-xs leading-4 text-text-muted">
            {health.score >= 75 ? t("anVerdictTop") : t("anVerdictOpt")}
          </span>
        </span>
      </button>

      {/* actionable diagnostics */}
      <div className="space-y-2.5 border-t border-border pt-3">
        <p className="text-[11px] font-semibold text-text-muted">{t("anDiagnostics")}</p>
        {health.insights.map((ins, i) => {
          const isWarn = ins.tone === "warning";
          return (
            <button
              key={i}
              type="button"
              onClick={onOpen}
              className="flex w-full items-start gap-2.5 rounded-lg border border-border p-2.5 text-left transition active:scale-[0.99]"
              style={{ backgroundColor: "var(--sf-surface-elevated)" }}
            >
              <span
                className="mt-px flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: isWarn ? "var(--sf-tint-amber-15)" : "var(--sf-chip-tint)" }}
                aria-hidden
              >
                <ins.Icon size={14} style={{ color: isWarn ? "var(--sf-hue-amber)" : "var(--sf-primary)" }} />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-[13px] font-bold text-text">{ins.title}</span>
                <span className="block text-[11px] leading-[15px] text-text-muted">{ins.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
