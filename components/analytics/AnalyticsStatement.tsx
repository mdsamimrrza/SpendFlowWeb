"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  Calendar,
  ChevronRight,
  Inbox,
  PieChart,
  Sparkles,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter, useBudget } from "@/hooks/useRates";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { Skeleton } from "@/components/ui/Skeleton";
import { CalendarModal } from "@/components/ui/CalendarModal";
import { FloatingSelect, SelectRow } from "@/components/ui/FloatingSelect";
import { categoryGlyph } from "@/components/ui/Glyph";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { ShareDonut } from "@/components/charts/ShareDonut";
import { HeatGrid } from "@/components/graphs/HeatGrid";
import { FlowChart, type FlowPoint } from "@/components/graphs/FlowChart";
import { DashCard, DeltaChip, StatCard } from "@/components/dash/primitives";
import {
  formatMoney,
  formatShortDate,
  getCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  toISODate,
} from "@/utils/format";

/**
 * Analytics – v3 (2026-10-13). Two invented compositions were rejected by
 * the user ("except one part" = the Income-vs-expense bar card; then "more
 * crap"), so this version composes the page ENTIRELY from components the
 * user already iterated to acceptance on the overview dashboard, plus that
 * bar card:
 *  · StatCard KPI row (icon chip + figure + delta chip vs the preceding
 *    like-for-like window in the caption).
 *  · FlowChart cash-flow card (the overview's approved smoothed lines +
 *    crosshair) following the selected period window.
 *  · ShareDonut "Where money goes" (curated pastel ramp, interactive
 *    legend) – no stored rainbow colors, no list rows.
 *  · MonthlyBars Income-vs-expense (the liked anchor, wide slot).
 *  · Largest-expense drill-ins + HeatGrid spending calendar (styled
 *    tooltips) + the mobile-parity health band.
 * All figures flow through the privacy mask; colors through --sf-* tokens.
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

type PeriodKey = "cycle" | "d30" | "d90" | "year" | "month";

const PERIODS: { key: PeriodKey; labelKey: TranslationKey }[] = [
  { key: "cycle", labelKey: "anThisCycle" },
  { key: "d30", labelKey: "anLast30" },
  { key: "d90", labelKey: "anLast90" },
  { key: "year", labelKey: "anThisYear" },
  { key: "month", labelKey: "anCustomMonth" },
];

interface Insight {
  tone: "success" | "warning" | "info";
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
  const router = useRouter();

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
  const tickFmt = useMemo(
    () =>
      (n: number) =>
        new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n),
    [locale],
  );
  // Full grouped numerals for the cash-flow chart axis (no "40K" shorthand).
  const axisFmt = useMemo(
    () => (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n),
    [locale],
  );

  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );
  const cycleFrom = toISODate(cycle.start);
  const cycleTo = toISODate(cycle.end);

  /* ── Screen state ── */
  const [period, setPeriod] = useState<PeriodKey>("cycle");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // Custom analysis window (start-to-end) picked on the calendar - defaults
  // to the current month so far.
  const [customRange, setCustomRange] = useState(() => {
    const n = new Date();
    const mm = String(n.getMonth() + 1).padStart(2, "0");
    return {
      from: `${n.getFullYear()}-${mm}-01`,
      to: toISODate(n),
    };
  });
  const customRangeLabel =
    customRange.from === customRange.to
      ? formatShortDate(customRange.from, locale)
      : `${formatShortDate(customRange.from, locale)} - ${formatShortDate(customRange.to, locale)}`;
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  // Spending calendar navigation: never past the current month.
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  // Period windows computed like the flow cards: cycle via getCycleWindow,
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
      case "month":
        return { from: customRange.from, to: customRange.to };
    }
  }, [period, cycleFrom, cycleTo, customRange]);

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
    return {
      total: daysBetween(periodWindow.from, end),
      elapsed: daysBetween(periodWindow.from, end),
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
  // largest entries, health inputs), the preceding comparison window (deltas)
  // and the cycle (budget adherence).
  const buildStats = useCallback(
    (fromISO: string, toISO: string) => {
      let spent = 0;
      let income = 0;
      let expenseCount = 0;
      let entries = 0;
      let weekendSpend = 0;
      const byCategory = new Map<string, { label: string; value: number; count: number; color?: string | null }>();

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
          count: 0,
          color: row.categories?.color,
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
        categories: Array.from(byCategory.values()).sort((a, b) => b.value - a.value),
      };
    },
    [rows, convert],
  );

  const stats = useMemo(() => buildStats(periodDays.from, periodDays.to), [buildStats, periodDays]);

  // The previous like-for-like window: the equal-length span immediately
  // before this one (Copilot's month-to-date comparison - cycle 1-20 vs the
  // preceding cycle's last 20 days, trailing 30 vs the 30 before it).
  const prevWindow = useMemo(() => {
    const len = Math.max(1, daysBetween(periodDays.from, periodDays.to));
    return { from: shiftDays(periodDays.from, -len), to: shiftDays(periodDays.from, -1), len };
  }, [periodDays.from, periodDays.to]);
  const prevStats = useMemo(
    () => buildStats(prevWindow.from, prevWindow.to),
    [buildStats, prevWindow],
  );

  const cycleStats = useMemo(() => buildStats(cycleFrom, cycleTo), [buildStats, cycleFrom, cycleTo]);

  /* ── Financial Health Score - mobile FinancialHealthScoreCard, 1:1 ── */
  const health = useMemo(() => {
    const expenseItems = periodRows.filter((e) => e.type !== "income");
    const incomeItems = periodRows.filter((e) => e.type === "income");

    if (expenseItems.length === 0 && incomeItems.length === 0) {
      return {
        score: 75,
        grade: "B+",
        status: t("anStatusNeutral"),
        color: "var(--sf-brass)",
        savingsRate: null as number | null,
        insights: [
          {
            tone: "info" as const,
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
          title: t("anInsSavingsTitle"),
          desc: tr(t("anInsSavingsDesc"), { r: String(computedSavingsRate) }),
        });
      } else if (rate > 0) {
        savingsBonus = 5;
        insights.push({
          tone: "info",
          title: t("anInsPosTitle"),
          desc: tr(t("anInsPosDesc"), { amt: fmt(netSavings) }),
        });
      } else {
        insights.push({
          tone: "warning",
          title: t("anInsDeficitTitle"),
          desc: tr(t("anInsDeficitDesc"), { amt: fmt(Math.abs(netSavings)) }),
        });
      }
    }

    // 2. Budget adherence (0-35) - budget is a cycle figure, pinned to the
    // cycle window regardless of the period dropdown (mobile parity).
    if (budget != null && budget > 0) {
      const budgetUsedRatio = cycleStats.spent / budget;
      const expectedRatio = cycleDaysElapsed(cycle, new Date()) / cycleDaysTotal(cycle);
      if (budgetUsedRatio <= expectedRatio) {
        budgetPoints = 35;
        insights.push({
          tone: "success",
          title: t("anInsOptimalTitle"),
          desc: tr(t("anInsOptimalDesc"), { amt: fmt(budget) }),
        });
      } else if (budgetUsedRatio <= 1.0) {
        const excess = Math.round((budgetUsedRatio - expectedRatio) * 100);
        budgetPoints = Math.max(10, 35 - excess * 0.6);
        insights.push({
          tone: "warning",
          title: t("anInsElevatedTitle"),
          desc: tr(t("anInsElevatedDesc"), { x: String(excess) }),
        });
      } else {
        budgetPoints = 5;
        insights.push({
          tone: "warning",
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
          title: t("anInsStableTitle"),
          desc: t("anInsStableDesc"),
        });
      } else if (cv < 1.2) {
        volatilityPoints = 18;
      } else {
        volatilityPoints = 10;
        insights.push({
          tone: "warning",
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
          title: t("anInsConcTitle"),
          desc: tr(t("anInsConcDesc"), { c: topCat.label, p: String(Math.round(topRatio * 100)) }),
        });
      } else {
        categoryPoints = 20;
        insights.push({
          tone: "success",
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
      color = "var(--sf-brass)";
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
  }, [stats, cycleStats, cycle, budget, periodRows, convert, fmt, t]);

  /* ── Chart series (all derived from the same rows/convert aggregates) ── */

  // Last 6 calendar months incl. the current one (independent of the period
  // dropdown - a month-over-month comparison needs its own fixed window).
  // Income vs expense: bucket by salary-cycle windows, not calendar months -
  // a custom 29th-to-26th cycle splits across two calendar months, so a
  // calendar bar mixes two of the user's months. The timeline starts at the
  // FIRST entry's cycle and empty windows are skipped entirely (a Feb 2025
  // first entry followed by a Mar 2026 second shows two bars, not fourteen
  // blanks). With the default day-1 cycle the windows are calendar months.
  const monthlyMonths = useMemo(() => {
    const startDay = profile?.cycle_start_day ?? 1;
    const endDay = profile?.cycle_end_day ?? null;

    // Walk back from the current cycle to the one containing the first entry.
    const firstDate = rows.length
      ? rows.reduce<string>((min, r) => (r.date < min ? r.date : min), rows[0].date)
      : null;
    const firstCycleStart = firstDate
      ? getCycleWindow(new Date(`${firstDate}T00:00:00`), startDay, endDay).start
      : null;
    const wins: { from: string; to: string }[] = [];
    let ref = new Date();
    for (let i = 0; i < 500; i++) {
      const w = getCycleWindow(ref, startDay, endDay);
      wins.push({ from: toISODate(w.start), to: toISODate(w.end) });
      if (firstCycleStart === null || w.start <= firstCycleStart) break;
      ref = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() - 1);
    }

    // Aggregate, then keep only windows where money actually moved.
    // wins were collected newest-first walking back; flip to oldest-first.
    wins.reverse();
    const buckets = wins
      .map((w) => {
        let income = 0;
        let expense = 0;
        for (const row of rows) {
          if (row.date < w.from || row.date > w.to) continue;
          if (row.type === "income") income += convert(row);
          else expense += convert(row);
        }
        return { ...w, income, expense };
      })
      .filter((b) => b.income > 0 || b.expense > 0);

    if (buckets.length === 0) {
      // No entries at all: keep the familiar trailing-6 skeleton (zeros).
      const labelFmt = new Intl.DateTimeFormat(locale, { month: "short" });
      const now = new Date();
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { label: labelFmt.format(d), income: 0, expense: 0, isCurrent: i === 5 };
      });
    }

    // Short month labels; if a gap makes two labels collide (Feb 2025 vs
    // Feb 2026), every bar switches to "Feb '25" style to stay unambiguous.
    const labelFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    const labelYearFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" });
    const labels = buckets.map((b) => labelFmt.format(new Date(`${b.from}T00:00:00`)));
    const needsYear = new Set(labels).size !== labels.length;
    const rangeFmt = (iso: string) => formatShortDate(iso, locale);
    return buckets.map((b, i) => ({
      label: needsYear
        ? labelYearFmt.format(new Date(`${b.from}T00:00:00`))
        : labels[i],
      sub: `${rangeFmt(b.from)} - ${rangeFmt(b.to)}`,
      income: b.income,
      expense: b.expense,
      isCurrent: i === buckets.length - 1,
    }));
  }, [rows, convert, locale, profile?.cycle_start_day, profile?.cycle_end_day]);

  // Daily income/expense flow across the selected window (the FlowChart
  // buckets - clamped to today so the lines never flatline into the future).
  const flowPoints = useMemo<FlowPoint[]>(() => {
    const byDay = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      if (row.date < periodDays.from || row.date > periodDays.to) continue;
      const bucket = byDay.get(row.date) ?? { income: 0, expense: 0 };
      const v = convert(row);
      if (row.type === "income") bucket.income += v;
      else bucket.expense += v;
      byDay.set(row.date, bucket);
    }
    const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric" });
    const out: FlowPoint[] = [];
    for (let d = periodDays.from, i = 0; d <= periodDays.to && i < 500; d = shiftDays(d, 1), i++) {
      const b = byDay.get(d) ?? { income: 0, expense: 0 };
      out.push({ label: dayFmt.format(new Date(`${d}T00:00:00`)), ...b });
    }
    return out;
  }, [rows, periodDays.from, periodDays.to, convert, locale]);

  // Daily expense map for the HeatGrid calendar (all months, nav is local).
  const daySpend = useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of rows) {
      if (row.type === "income") continue;
      m[row.date] = (m[row.date] ?? 0) + convert(row);
    }
    return m;
  }, [rows, convert]);

  // Donut: top 5 slices + "Other" remainder - the curated ShareDonut ramp
  // frames the chart; stored category colors stay data.
  const donutSlices = useMemo(() => {
    const top = stats.categories.slice(0, 5).map((c) => ({
      label: c.label,
      value: c.value,
    }));
    const rest = stats.categories.slice(5).reduce((s, c) => s + c.value, 0);
    if (rest > 0) top.push({ label: t("analyticsOther"), value: rest });
    return top;
  }, [stats.categories, t]);

  // Largest single outflows of the selected window (drill-in to the entry).
  const largest = useMemo(
    () =>
      rows
        .filter((r) => r.date >= periodDays.from && r.date <= periodDays.to && r.type !== "income")
        .map((r) => ({ row: r, value: convert(r) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    [rows, periodDays.from, periodDays.to, convert],
  );

  // Masthead figures + one-line insight.
  const savingsRate = stats.income > 0 ? Math.round((stats.net / stats.income) * 100) : null;
  const budgetSet = budget != null && budget > 0;
  const overBudget = budgetSet && stats.spent > (budget ?? 0);
  const healthy = stats.net >= 0;
  const avgPerDay = stats.spent / Math.max(1, periodDays.elapsed);
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

  // KPI delta chip vs the previous window. Direction-of-goodness depends on
  // the metric: more spending is bad, more income / net is good. No prior
  // data or an exact tie renders as a quiet neutral pill.
  const kpiDelta = (pct: number | null, abs: number, goodWhenUp: boolean) => {
    if (pct == null || pct === 0) {
      return (
        <span
          className="numeric inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold text-faint"
          style={{ backgroundColor: "var(--sf-track)" }}
        >
          {pct == null ? t("anNoPrev") : "0%"}
        </span>
      );
    }
    return (
      <span title={`${abs >= 0 ? "+" : "−"}${fmt(Math.abs(abs))} · ${t("anVsPrev")}`}>
        <DeltaChip text={`${Math.abs(pct)}%`} positive={(abs > 0) === goodWhenUp} />
      </span>
    );
  };
  const deltas = {
    income: pctDelta(stats.income, prevStats.income),
    spent: pctDelta(stats.spent, prevStats.spent),
    net: pctDelta(stats.net, prevStats.net),
  };

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
        <Skeleton className="h-36 w-full" />
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Skeleton className="h-72 w-full lg:col-span-7" />
          <Skeleton className="h-72 w-full lg:col-span-5" />
          <Skeleton className="h-56 w-full lg:col-span-12" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-4 sm:px-6">
      {/* ── 1. MASTHEAD (unboxed): identity left, period selector right ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="caps-faint">{t("anKicker")}</p>
          <h1 className="mt-0.5 text-[22px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[26px]">
            {t("anTitle")}
          </h1>
        </div>
        <div className="relative z-40 sm:w-[240px] sm:shrink-0">
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
            label={period === "month" ? customRangeLabel : t(PERIODS.find((p) => p.key === period)?.labelKey ?? "anThisCycle")}
            open={periodOpen}
            onToggle={() => setPeriodOpen((v) => !v)}
          >
            {PERIODS.map((opt) => (
              <SelectRow
                key={opt.key}
                selected={period === opt.key}
                label={opt.key === "month" && period === "month" ? customRangeLabel : t(opt.labelKey)}
                onSelect={() => {
                  if (opt.key === "month") {
                    setMonthPickerOpen(true);
                  } else {
                    setPeriod(opt.key);
                  }
                  setPeriodOpen(false);
                }}
              />
            ))}
          </FloatingSelect>
        </div>
      </div>

      {error ? <p className="mt-3 border border-danger p-4 text-sm text-danger">{error}</p> : null}

      {!error && rows.length === 0 && (
        <section className="panel mt-3 flex flex-col items-center gap-2 p-10 text-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ backgroundColor: "var(--sf-track)" }}
            aria-hidden
          >
            <Inbox size={20} className="text-faint" />
          </span>
          <p className="mt-1 text-sm font-bold text-text">{t("anAwaitTitle")}</p>
          <p className="max-w-[360px] text-[12.5px] leading-[18px] text-faint">{t("anAwaitDesc")}</p>
        </section>
      )}

      {!error && rows.length > 0 && (
        <>
          {/* ── 2. KPI ROW: the overview's approved StatCard, delta chips in
              the caption slot ── */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={ArrowDownLeft}
              tone="beige"
              label={t("homeInflow")}
              value={fmt(stats.income)}
              caption={
                <>
                  {kpiDelta(deltas.income.pct, deltas.income.abs, true)}
                  <span className="truncate">
                    {savingsRate != null ? tr(t("anSavingsRatePill"), { r: String(savingsRate) }) : "\u00A0"}
                  </span>
                </>
              }
            />
            <StatCard
              icon={ArrowUpRight}
              tone="rose"
              label={t("homeOutflow")}
              value={fmt(stats.spent)}
              caption={
                <>
                  {kpiDelta(deltas.spent.pct, deltas.spent.abs, false)}
                  <span className="truncate">
                    {t("homeAvgDaily")}: {fmt(avgPerDay)}
                  </span>
                </>
              }
            />
            <StatCard
              icon={Wallet}
              tone="sage"
              label={t("cfNet")}
              value={
                <span>
                  <span className="mr-0.5 text-[0.6em] text-faint">{stats.net < 0 ? "−" : "+"}</span>
                  {fmt(Math.abs(stats.net))}
                </span>
              }
              caption={
                <>
                  {kpiDelta(deltas.net.pct, deltas.net.abs, true)}
                  <span className="truncate">
                    {budgetSet
                      ? overBudget
                        ? tr(t("anBudgetOver"), { over: fmt(stats.spent - (budget ?? 0)), total: fmt(budget ?? 0) })
                        : tr(t("anBudgetLeft"), { left: fmt((budget ?? 0) - stats.spent), total: fmt(budget ?? 0) })
                      : "\u00A0"}
                  </span>
                </>
              }
            />
          </div>
          <p className="mt-2 text-[12px] leading-[18px] text-faint">
            {triFlowInsight}
            {!budgetSet && <span> · {t("triFlowNotSet")}</span>}
          </p>

          {/* ── 3. DASHCARD GRID: flow | donut, monthly bars | largest,
              calendar | health ── */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
            {/* Cash-flow lines over the selected window (overview hero chart) */}
            <DashCard className="lg:col-span-7" title={t("homeNetCashFlow")}>
              <p className="-mt-2.5 mb-3 text-[11.5px] text-faint">
                {t("anVsPrev")} {formatShortDate(prevWindow.from, locale)} – {formatShortDate(prevWindow.to, locale)}
              </p>
              <div className="h-[260px] sm:h-[300px]">
                <FlowChart
                  points={flowPoints}
                  format={fmt}
                  tickFormat={axisFmt}
                  labels={{
                    income: t("flowIncome"),
                    expense: t("flowExpenses"),
                    empty: t("anNoPeriodTx"),
                  }}
                />
              </div>
            </DashCard>

            {/* Category share donut - curated pastel ramp, interactive legend */}
            <DashCard className="lg:col-span-5" title={t("anWhereMoneyGoes")}>
              <p className="-mt-2.5 mb-3 text-[11.5px] text-faint">{t("anShareSub")}</p>
              {donutSlices.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-faint">{t("anNoCategoryData")}</p>
              ) : (
                <ShareDonut slices={donutSlices} formatted={fmt} centerLabel={t("triFlowSpent")} />
              )}
            </DashCard>

            {/* Month-by-month income vs expense columns - the liked anchor */}
            <DashCard className="lg:col-span-7" title={t("anMonthlyBars")}>
              <p className="-mt-2.5 mb-3 text-[11.5px] text-faint">{t("anMonthlyBarsSub")}</p>
              <p className="numeric mb-2 whitespace-nowrap text-[11.5px] text-text-muted">
                <span className="font-semibold text-income">IN {fmt(monthlyMonths.reduce((s, m) => s + m.income, 0))}</span>
                <span className="mx-1.5 text-faint">·</span>
                <span className="font-semibold text-danger">OUT {fmt(monthlyMonths.reduce((s, m) => s + m.expense, 0))}</span>
              </p>
              <MonthlyBars months={monthlyMonths} formatted={fmt} compact={tickFmt} />
            </DashCard>

            {/* Largest single outflows, drill-in to the entry */}
            <DashCard className="lg:col-span-5" title={t("anLargestTitle")}>
              <p className="-mt-2.5 mb-1 text-[11.5px] text-faint">{t("anLargestSub")}</p>
              {largest.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-faint">{t("anNoPeriodTx")}</p>
              ) : (
                <div className="divide-y divide-border">
                  {largest.map(({ row, value }, i) => {
                    const Glyph = categoryGlyph(row.categories?.icon);
                    return (
                      <Link
                        key={row.id}
                        href={`/expense/${row.id}`}
                        className="flex min-h-[52px] items-center gap-3 py-2 transition hover:opacity-75"
                      >
                        <span className="numeric w-4 shrink-0 text-[11px] font-bold text-faint">{i + 1}</span>
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border"
                          style={{ backgroundColor: "var(--sf-surface-elevated)" }}
                          aria-hidden
                        >
                          <Glyph size={15} className="text-text-muted" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-text">
                            {row.description || row.categories?.name || "—"}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-faint">
                            {row.categories?.name ?? "—"} · {formatShortDate(row.date, locale)}
                          </span>
                        </span>
                        <span className="figures shrink-0 text-[13.5px] font-semibold text-danger">{fmt(value)}</span>
                        <ChevronRight size={14} className="hidden shrink-0 text-faint sm:block" aria-hidden />
                      </Link>
                    );
                  })}
                </div>
              )}
            </DashCard>

            {/* Spending calendar - the overview's HeatGrid (styled tooltips) */}
            <DashCard className="lg:col-span-7" title={t("anCalendarHeat")}>
              <p className="-mt-2.5 mb-3 text-[11.5px] text-faint">{t("anDailySpendSub")}</p>
              <HeatGrid
                year={calMonth.year}
                month={calMonth.month}
                spend={daySpend}
                formatted={fmt}
                locale={locale}
                onPrevMonth={calPrev}
                onNextMonth={calNext}
                canNextMonth={!calIsCurrent}
                onDayTap={(iso) => router.push(`/history?from=${iso}&to=${iso}`)}
                totalLabel={t("anMonthTotal")}
              />
            </DashCard>

            {/* Financial health - mobile parity formulas */}
            <HealthBand health={health} t={t} entries={stats.entries} onOpen={() => setHealthModalOpen(true)} />
          </div>
        </>
      )}

      {/* ── CUSTOM RANGE PICKER (period selector) ── */}
      <CalendarModal
        open={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        mode="range"
        initial={customRange}
        onApply={(r) => {
          if (r.from && r.to) setCustomRange({ from: r.from, to: r.to });
          setPeriod("month");
          setMonthPickerOpen(false);
        }}
      />

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
            className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-primary-ink transition active:scale-[0.99]"
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

/** Inclusive day count between two ISO dates. */
function daysBetween(a: string, b: string): number {
  return (
    Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1
  );
}

/** Signed change between two window totals; null % when there is no baseline. */
function pctDelta(cur: number, prev: number): { pct: number | null; abs: number } {
  const abs = cur - prev;
  if (prev === 0) return { pct: null, abs };
  return { pct: Math.round((abs / Math.abs(prev)) * 100), abs };
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

/* ── Financial health band: score ring + grade, verdict, top diagnostics and
   the calculation explainer (mobile formulas, 1:1) ── */
function HealthBand({
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
    <DashCard
      className="lg:col-span-5"
      title={t("anHealthTitle")}
      action={
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-7 shrink-0 items-center rounded-full border border-border px-3 text-[11.5px] font-semibold text-text-muted transition hover:text-text"
        >
          {t("anHowCalc")}
        </button>
      }
    >
      <p className="-mt-2.5 mb-3 text-[11.5px] text-faint">{tr(t("anCalcAcross"), { n: String(entries) })}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("anHowCalc")}
          className="flex shrink-0 items-center gap-4 self-start text-left transition active:scale-[0.99] sm:self-center"
        >
          <ProgressRing
            pct={health.score / 100}
            size={88}
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
          <span>
            <span className="block text-[28px] font-bold leading-none tracking-[-0.01em]" style={{ color: health.color }}>
              {health.grade}
            </span>
            <span className="mt-1 block text-[12.5px] font-semibold text-text">{health.status}</span>
          </span>
        </button>

        <div className="min-w-0 flex-1 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <p className="text-[12.5px] leading-[18px] text-text-muted">
            {health.score >= 75 ? t("anVerdictTop") : t("anVerdictOpt")}
          </p>
          {health.insights.length > 0 && (
            <div className="mt-2.5 space-y-2.5">
              {health.insights.slice(0, 2).map((ins, i) => (
                <div key={i}>
                  <p className={`text-[13px] font-semibold leading-snug ${ins.tone === "warning" ? "text-danger" : "text-text"}`}>
                    {ins.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-faint">{ins.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashCard>
  );
}
