"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Banknote,
  CalendarDays,
  ChevronDown,
  Clock,
  Coins,
  CreditCard,
  Flame,
  Gauge,
  Landmark,
  Layers,
  LayoutGrid,
  Lightbulb,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Tags,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter, useBudget, useDisplayRate } from "@/hooks/useRates";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { FlowChartCard } from "@/components/charts/FlowChartCard";
import { MonthBars } from "@/components/charts/MonthBars";
import { HeatCalendar } from "@/components/charts/HeatCalendar";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { FitText } from "@/components/ui/FitText";
import { categoryGlyph } from "@/components/ui/Glyph";
import { formatMoney, getCycleWindow, cycleDaysElapsed, cycleDaysTotal, cycleStatementNo, toISODate, isValidISODate } from "@/utils/format";

/**
 * Analytics — section-wise fintech layout mirroring the mobile app
 * (docs/00-EXISTING-APP-AUDIT.md §Analytics): a period dropdown
 * (Today/Week/Month/Year/Custom/All) + section-focus dropdown
 * (Overview/Categories/Habits/All) above grouped cards.
 *  · Overview group: consistent full-width bands — tri-flow "Income, Expense
 *    & Budget" card → derived-KPI strip → Financial Health Score card (with
 *    the Habit Diagnostics & Advisory grid beside it on wide screens) →
 *    cash-flow chart → top outflows.
 *  · Categories group: category breakdown with monthly caps → allocation
 *    donut → payment channels.
 *  · Habits group: budget performance & pacing forecast → weekday rhythm →
 *    time-of-day pattern → 12-month rhythm → spending calendar.
 * All formulas are ported 1:1 from the APK components
 * (FinancialHealthScoreCard, BudgetAnalyticsCard):
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

/* Period selector — mirrors the APK's dropdown (utils/format.ts
   filterExpensesByPeriod): today / week (Mon–Sun) / month (= the salary
   cycle, the APK's "Month") / year / custom / all. Burn analysis stays
   cycle-pinned regardless (the APK's BudgetAnalyticsCard filters to the
   cycle window internally even when a different period is selected). */
type PeriodKey = "today" | "week" | "cycle" | "year" | "custom" | "all";

const PERIODS: { key: PeriodKey; labelKey: TranslationKey; title: string }[] = [
  { key: "today", labelKey: "anPeriodToday", title: "today" },
  { key: "week", labelKey: "anPeriodWeek", title: "this week" },
  { key: "cycle", labelKey: "anPeriodMonth", title: "this cycle" },
  { key: "year", labelKey: "anPeriodYear", title: "this year" },
  { key: "custom", labelKey: "anPeriodCustom", title: "your range" },
  { key: "all", labelKey: "anPeriodAll", title: "all time" },
];

/* Section tabs — which group the statement shows (tab-rule nav under the
   masthead, mirroring the app header's language). */
type SectionKey = "overview" | "categories" | "habits";

const SECTION_TABS: { key: SectionKey; labelKey: TranslationKey; Icon: typeof LayoutGrid }[] = [
  { key: "overview", labelKey: "anSecOverview", Icon: LayoutGrid },
  { key: "categories", labelKey: "anSecCategories", Icon: Tags },
  { key: "habits", labelKey: "anSecHabits", Icon: CalendarDays },
];

/* Category breakdown shows the top 5 rows collapsed — with 100 funded
   categories the panel must stay scannable; the rest sit behind a
   "Show all" expander. (The donut's top-6 + Other fold is separate,
   mobile CategoryBreakdown parity.) */
const CATS_PREVIEW = 5;

/* Design-preview seam: /preview-analytics passes mock rows/profile/budget so
   the statement renders without auth. Undefined in production — the page then
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
  /** Category monthly caps (name → amount) for the preview seam — the live
   *  page reads them from useCategories instead. */
  limits?: Record<string, number>;
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
  const displayRate = useDisplayRate(profile?.preferred_currency);
  const supabase = getSupabaseBrowserClient();
  // Category monthly limits (budget_monthly) drive the spend-vs-limit bars.
  const { categories: allCategories } = useCategories(user?.id);
  const limitByName = useMemo(() => {
    const m = new Map<string, number>();
    if (inject?.limits) {
      for (const [name, v] of Object.entries(inject.limits)) if (v > 0) m.set(name, v);
      return m;
    }
    for (const c of allCategories) {
      if (c.type === "expense" && Number(c.budget_monthly) > 0) m.set(c.name, Number(c.budget_monthly));
    }
    return m;
  }, [allCategories, inject]);

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
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );
  const cycleFrom = toISODate(cycle.start);
  const cycleTo = toISODate(cycle.end);

  const [period, setPeriod] = useState<PeriodKey>("cycle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Section tabs — Overview / Categories / Habits.
  const [section, setSection] = useState<SectionKey>("overview");

  const periodWindow = useMemo(() => {
    const now = new Date();
    const todayS = toISODate(now);
    switch (period) {
      case "today":
        return { from: todayS, to: todayS };
      case "week": {
        // Mobile parity: Monday-anchored week.
        const dist = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const mon = new Date(now);
        mon.setDate(now.getDate() - dist);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        return { from: toISODate(mon), to: toISODate(sun) };
      }
      case "cycle":
        return { from: cycleFrom, to: cycleTo };
      case "year":
        return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
      case "custom":
        return {
          from: isValidISODate(customFrom) ? customFrom : "0001-01-01",
          to: isValidISODate(customTo) ? customTo : "9999-12-31",
        };
      default:
        return { from: "0001-01-01", to: "9999-12-31" };
    }
  }, [period, cycleFrom, cycleTo, customFrom, customTo]);

  // Inclusive day counts for the selected window. Open-ended ends (this
  // week/year before Sunday/Dec 31) count elapsed days only to today.
  const periodDays = useMemo(() => {
    if (period === "cycle") {
      return {
        total: cycleDaysTotal(cycle),
        elapsed: cycleDaysElapsed(cycle, new Date()),
        from: cycleFrom,
        to: cycleTo,
      };
    }
    const todayS = toISODate(new Date());
    const earliest = rows.length
      ? rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date)
      : todayS;
    const start = period === "all" || (period === "custom" && !isValidISODate(customFrom)) ? earliest : periodWindow.from;
    const end = period === "all" || (period === "custom" && !isValidISODate(customTo)) ? todayS : periodWindow.to;
    const daysIn = (a: string, b: string) =>
      Math.max(
        1,
        Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1,
      );
    return {
      total: daysIn(start, end),
      elapsed: daysIn(start, end > todayS ? todayS : end),
      from: start,
      to: end > todayS ? todayS : end,
    };
  }, [period, periodWindow, cycle, cycleFrom, cycleTo, rows, customFrom, customTo]);

  // Window aggregate builder — called twice: once for the selected period
  // (summary/KPIs/composition) and once for the cycle (burn analysis +
  // budget adherence). The APK splits the same way: its KPI tiles follow the
  // period dropdown while BudgetAnalyticsCard filters to the cycle internally.
  const buildStats = useCallback(
    (fromISO: string, toISO: string, total: number, elapsed: number) => {
      let spent = 0;
      let income = 0;
      let peak = 0;
      let expenseCount = 0;
      let entries = 0;
      let spentUsd = 0;
      let weekendSpend = 0;
      let timedEntries = 0;
      const dailyMap = new Map<string, number>();
      const byMethod = new Map<string, { total: number; count: number }>();
      const byWeekday = Array.from({ length: 7 }, () => 0);
      const byTimeOfDay = [0, 0, 0, 0]; // morning · afternoon · evening · night
      const topEntries: {
        id: string;
        date: string;
        amount: number;
        label: string;
        method: string;
        categoryId: string | null;
      }[] = [];
      const byCategory = new Map<
        string,
        { label: string; value: number; color: string; id: string | null; count: number; icon?: string }
      >();

      for (const row of rows) {
        if (row.date < fromISO || row.date > toISO) continue;
        entries += 1;
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
        // Chrono bucket from the entry's logged time (expenses.time, mobile
        // FinancialInsights chrono-parity): 4–11 morning, 12–16 afternoon,
        // 17–20 evening, otherwise night. Untimed rows stay unbucketed.
        if (row.time) {
          const h = Number(row.time.slice(0, 2));
          const bucket = h >= 4 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : h >= 17 && h < 21 ? 2 : 3;
          byTimeOfDay[bucket] += v;
          timedEntries += 1;
        }
        topEntries.push({
          id: row.id,
          date: row.date,
          amount: v,
          label: row.description || row.categories?.name || "Expense",
          method: row.payment_method,
          categoryId: row.category_id,
        });
        const name = row.categories?.name ?? "Other";
        const slice = byCategory.get(name) ?? {
          label: name,
          value: 0,
          color: row.categories?.color ?? "#8B978F",
          id: row.category_id,
          count: 0,
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
        peak,
        expenseCount,
        entries,
        daysElapsed: elapsed,
        daysTotal: total,
        dailyVelocity: spent / Math.max(elapsed, 1),
        avgTicket: expenseCount > 0 ? spent / expenseCount : 0,
        spentUsd,
        weekendSpend,
        activeDays: dailyMap.size,
        dailyValues: Array.from(dailyMap.values()),
        dailyByDate: Object.fromEntries(dailyMap) as Record<string, number>,
        byMethod: Array.from(byMethod.entries()).sort((a, b) => b[1].total - a[1].total),
        byWeekday,
        byTimeOfDay,
        timedEntries,
        topEntries: topEntries.sort((a, b) => b.amount - a.amount).slice(0, 5),
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
    () =>
      buildStats(cycleFrom, cycleTo, cycleDaysTotal(cycle), cycleDaysElapsed(cycle, new Date())),
    [buildStats, cycle, cycleFrom, cycleTo],
  );

  // USD-per-display rate for the cycle: the live display rate, or — until the
  // rates fetch lands — the effective rate implied by the cycle's frozen row
  // snapshots. Without this fallback the budget-adherence branch silently
  // defaults to 30 pts on first paint and the health score visibly jumps
  // once rates load (snapshot math converges to the same figure anyway).
  const usdRate =
    displayRate ??
    (cycleStats.spent > 0 && cycleStats.spentUsd > 0 ? cycleStats.spentUsd / cycleStats.spent : null);

  // KPI calculation-explainer modal (mobile parity: every KPI tile opens an
  // explainer with its live formula).
  const [kpi, setKpi] = useState<null | "outflow" | "velocity" | "peak" | "ticket">(null);

  // Category breakdown expander — collapsed to the top CATS_PREVIEW rows.
  const [catsOpen, setCatsOpen] = useState(false);

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

    // 2. Budget adherence (0–35, canonical USD — display-currency invariant).
    // Budget is a monthly/cycle figure → pinned to the cycle window even when
    // the statement's other sections follow the period selector (APK parity:
    // the burn card filters to the cycle internally).
    let budgetPoints = 30; // APK default when no budget is on file
    const expectedRatio = cycleStats.daysElapsed / cycleStats.daysTotal;
    const budgetUsd = budget != null && usdRate ? budget * usdRate : 0;
    if (budgetUsd > 0 && cycleStats.spentUsd > 0) {
      const usedRatio = cycleStats.spentUsd / budgetUsd;
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

    // Total (mobile parity): the four factor groups sum to 100 and the savings
    // bonus rides on top, capped — the savings row is added here exactly once,
    // so the printed score always equals the sum of the displayed sub-scores.
    const baseScore = factors.reduce((s, f) => s + f.points, 0);
    const score = Math.min(100, Math.max(10, Math.round(baseScore)));
    let grade = "D";
    if (score >= 90) grade = "A+";
    else if (score >= 75) grade = "A";
    else if (score >= 60) grade = "B";
    else if (score >= 45) grade = "C";
    const status = score >= 75 ? "Excellent" : score >= 60 ? "Good" : score >= 45 ? "Fair" : "Needs work";

    return { score, grade, status, factors, insights: insights.slice(0, 5) };
  }, [stats, cycleStats, budget, usdRate, fmt]);

  // Burn analysis — ALWAYS the salary cycle window (APK parity: the burn card
  // ignores the period dropdown; budget pacing only makes sense against the
  // cycle the budget was set for).
  const burn = useMemo(() => {
    const isBudgetSet = budget != null && budget > 0;
    const dailyAllowance = isBudgetSet ? budget / cycleStats.daysTotal : 0;
    const actualPace = cycleStats.spent / cycleStats.daysElapsed;
    const projected = actualPace * cycleStats.daysTotal;
    const isOver = isBudgetSet && cycleStats.spent > budget;
    const isHighBurn = isBudgetSet && actualPace > dailyAllowance;
    const budgetUsd = budget != null && usdRate ? budget * usdRate : 0;
    const projectedUsd = (cycleStats.spentUsd / cycleStats.daysElapsed) * cycleStats.daysTotal;
    const projectedPct =
      budgetUsd > 0 && cycleStats.daysElapsed > 0 ? Math.round((projectedUsd / budgetUsd) * 100) : null;
    const projectedIncome = (cycleStats.income / cycleStats.daysElapsed) * cycleStats.daysTotal;
    return { isBudgetSet, dailyAllowance, actualPace, projected, isOver, isHighBurn, projectedPct, projectedIncome };
  }, [budget, cycleStats, usdRate]);

  const weekdayNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 2023-10-01 was a Sunday — stable anchor for index 0.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 9, 1 + i)));
  }, [locale]);

  const timeOfDayNames = useMemo(
    () => [t("analyticsMorning"), t("analyticsAfternoon"), t("analyticsEvening"), t("analyticsNight")],
    [t],
  );

  // Allocation donut: top 6 categories, remainder folded into "Other"
  // (mobile CategoryBreakdown parity).
  const donutSlices = useMemo(() => {
    const top = stats.categories.slice(0, 6);
    const restSum = stats.categories.slice(6).reduce((s, c) => s + c.value, 0);
    const slices = top.map((c) => ({ label: c.label, value: c.value, color: c.color }));
    if (restSum > 0) slices.push({ label: "Other", value: restSum, color: "#8B978F" });
    return slices;
  }, [stats.categories]);

  const peakEntry = stats.topEntries[0] ?? null;
  const savingsRatePct = stats.income > 0 ? `${Math.round(((stats.income - stats.spent) / stats.income) * 100)}%` : "—";

  const router = useRouter();

  // Monthly income/expense buckets (trailing 12 months) — the MonthBars
  // section's series. Raw rows, FX-converted, independent of the period
  // selector: month context is inherently a 12-month window.
  const monthPoints = useMemo(() => {
    const agg = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      const key = row.date.slice(0, 7);
      const slot = agg.get(key) ?? { income: 0, expense: 0 };
      const v = convert(row);
      if (row.type === "income") slot.income += v;
      else slot.expense += v;
      agg.set(key, slot);
    }
    const out: { date: string; income: number; expense: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const slot = agg.get(key) ?? { income: 0, expense: 0 };
      out.push({ date: `${key}-01`, ...slot });
    }
    return out;
  }, [rows, convert]);

  // ── Tri-flow card (mobile IncomeExpenseBudgetCard 1:1) ──
  const savingsRateNum = stats.income > 0 ? Math.max(-100, Math.round(((stats.income - stats.spent) / stats.income) * 100)) : 0;
  const cashflowHealthy = stats.net >= 0;
  const expenseToIncome = stats.income > 0 ? Math.round((stats.spent / stats.income) * 100) : 0;
  const budgetSet = budget != null && budget > 0;
  const budgetVal = budget ?? 0;
  const utilization = budgetSet ? Math.round((stats.spent / budgetVal) * 100) : 0;
  const overBudget = budgetSet && stats.spent > budgetVal;
  const nearBudget = budgetSet && !overBudget && utilization >= 85;
  const insight = overBudget && !cashflowHealthy
    ? tr(t("triFlowInsightCritical"), { a: fmt(stats.spent - budgetVal), b: fmt(Math.abs(stats.net)) })
    : overBudget && cashflowHealthy
      ? tr(t("triFlowInsightOverPositive"), { a: fmt(stats.spent - budgetVal), b: fmt(stats.net) })
      : stats.income > 0 && !cashflowHealthy
        ? tr(t("triFlowInsightDeficit"), { a: fmt(Math.abs(stats.net)) })
        : stats.income > 0 && cashflowHealthy
          ? tr(t("triFlowInsightHealthy"), { a: fmt(stats.net), r: String(savingsRateNum) })
          : tr(t("triFlowInsightTracking"), { a: fmt(stats.spent), n: String(stats.expenseCount) });

  const KPI_CONTENT: Record<NonNullable<typeof kpi>, { title: string; def: string; calc: string; tip?: string }> = {
    outflow: {
      title: t("analyticsKpiOutflowTitle"),
      def: t("analyticsKpiOutflowDef"),
      calc: tr(t("analyticsKpiOutflowCalc"), { n: String(stats.expenseCount), total: fmt(stats.spent) }),
    },
    velocity: {
      title: t("analyticsKpiVelocityTitle"),
      def: t("analyticsKpiVelocityDef"),
      calc: tr(t("analyticsKpiVelocityCalc"), { v: fmt(stats.dailyVelocity) }),
      tip: tr(t("analyticsKpiVelocityTip"), { v: fmt(stats.dailyVelocity), p: fmt(stats.dailyVelocity * 30) }),
    },
    peak: {
      title: t("analyticsKpiPeakTitle"),
      def: t("analyticsKpiPeakDef"),
      calc: peakEntry
        ? `${fmt(peakEntry.amount)} — ${peakEntry.label} · ${shortDate(new Date(`${peakEntry.date}T00:00:00`), locale)} · ${peakEntry.method}`
        : t("analyticsNoOutflows"),
    },
    ticket: {
      title: t("analyticsKpiTicketTitle"),
      def: t("analyticsKpiTicketDef"),
      calc: tr(t("analyticsKpiTicketCalc"), { total: fmt(stats.spent), n: String(stats.expenseCount), v: fmt(stats.avgTicket) }),
    },
  };

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
  const timeOfDayMax = Math.max(...stats.byTimeOfDay, 1);
  const printed = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const scoreTone =
    health.score >= 60 ? "var(--sf-income)" : health.score >= 45 ? "var(--sf-brass)" : "var(--sf-danger)";
  const statusTone =
    health.score >= 75
      ? "border-income/40 bg-income/10 text-income"
      : health.score >= 60
        ? "border-primary-strong/40 bg-primary-light text-primary-strong"
        : health.score >= 45
          ? "border-brass/40 bg-brass/10 text-brass"
          : "border-danger/40 bg-danger/10 text-danger";
  const gradeTone =
    health.grade === "A+" || health.grade === "A"
      ? "var(--sf-income)"
      : health.grade === "B" || health.grade === "C"
        ? "var(--sf-brass)"
        : "var(--sf-danger)";
  const healthVerdict =
    health.score >= 75
      ? t("anVerdictExcellent")
      : health.score >= 60
        ? t("anVerdictGood")
        : health.score >= 45
          ? t("anVerdictFair")
          : t("anVerdictPoor");

  // Section-tab derived values.
  const periodLabel = t(PERIODS.find((p) => p.key === period)?.labelKey ?? "anPeriodMonth");
  const showOverview = section === "overview";
  const showCategories = section === "categories";
  const showHabits = section === "habits";
  const activeCaps = stats.categories.reduce((n, c) => n + (limitByName.has(c.label) ? 1 : 0), 0);
  const cycleDaysLeft = Math.max(0, cycleStats.daysTotal - cycleStats.daysElapsed);
  const cycleUsedPct = budget != null && budget > 0 ? Math.round((cycleStats.spent / budget) * 100) : 0;
  const burnVerdict = burn.isOver
    ? { tone: "warn" as const, title: t("anExceededTitle"), desc: tr(t("anExceededBy"), { amt: fmt(cycleStats.spent - (budget ?? 0)) }) }
    : burn.isHighBurn
      ? {
          tone: "warn" as const,
          title: t("anHighBurnTitle"),
          desc: `${fmt(Math.max(0, burn.actualPace - burn.dailyAllowance))} ${t("anPaceAbove")} · ${tr(t("anDaysLeftShort"), { n: String(cycleDaysLeft) })}`,
        }
      : {
          tone: "good" as const,
          title: t("anOnTrackTitle"),
          desc: `${t("anSafePace")} · ${tr(t("anPctRemaining"), { n: String(Math.max(0, 100 - cycleUsedPct)) })} · ${tr(t("anDaysLeftShort"), { n: String(cycleDaysLeft) })}`,
        };
  const chronoIcons = [Sunrise, Sun, Sunset, Moon];
  // Payment-channel glyph — matches the method labels the app offers
  // (Cash / Card / UPI / Mobile wallet / Bank transfer / Other).
  const methodGlyph = (m: string) => {
    const s = m.toLowerCase();
    if (s.includes("card")) return CreditCard;
    if (s.includes("cash")) return Banknote;
    if (s.includes("bank")) return Landmark;
    if (s.includes("upi") || s.includes("wallet") || s.includes("mobile") || s.includes("pay")) return Smartphone;
    return Wallet;
  };
  const incomeCount = stats.entries - stats.expenseCount;

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <header className="mb-4">
        <p className="caps !text-text-muted">{t("anKicker")}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{t("anTitle")}</h1>
          <span className="caps shrink-0 !text-primary-strong pb-1">{displayCurrency}</span>
        </div>
      </header>

      {/* Section tabs — the same tab-rule language as the app header; the
          active underline sits on the rule and the bar sticks under it while
          the sheet scrolls. */}
      <nav
        aria-label={t("anSectionsAria")}
        className="sticky top-16 z-30 -mx-4 mb-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6"
      >
        <div className="scroll-x flex items-stretch gap-1 overflow-x-auto">
          {SECTION_TABS.map(({ key, labelKey, Icon }) => {
            const active = section === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-pressed={active}
                className={`flex h-12 shrink-0 items-center gap-2 border-b-2 px-3.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:border-border hover:text-text"
                }`}
              >
                <Icon size={15} aria-hidden />
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Period chips — Today/Week/Month(cycle)/Year/Custom/All; burn analysis
          stays cycle-pinned regardless (APK parity). */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("anPeriodAria")}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            aria-pressed={period === p.key}
            className={`min-h-9 rounded-full border px-3.5 text-xs font-bold transition-colors active:scale-[0.97] ${
              period === p.key
                ? "border-primary bg-primary text-white dark:text-background"
                : "border-border bg-surface text-text-muted hover:text-text"
            }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
        {period === "custom" && (
          <div className="mt-1.5 flex w-full items-center gap-1.5 sm:mt-0 sm:w-auto">
            <input
              type="date"
              aria-label="From date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-input px-2 text-xs text-text sm:flex-none"
            />
            <ArrowRight size={14} className="shrink-0 text-faint" aria-hidden />
            <input
              type="date"
              aria-label="To date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-input px-2 text-xs text-text sm:flex-none"
            />
          </div>
        )}
      </div>

      {error ? (
        <p className="border border-danger px-4 py-3 text-sm text-danger">{error}</p>
      ) : (
        <div className="space-y-7">
          {/* ═══ OVERVIEW ═══ */}
          {showOverview && (
            <section aria-label={t("anSecOverview")} className="space-y-4">
              {/* Hero — the window at a glance on brand emerald: net figure +
                  saved badge, income/expense/budget columns, consumption +
                  ceiling bars and the smart-insight verdict in one statement
                  (replaces the old tri-flow card; same figures, same rules). */}
              <section className="rounded-2xl bg-primary p-5 text-white shadow-soft dark:text-background sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="caps !text-white/70 dark:!text-background/70">
                      {t("cfNet")} · {periodLabel}
                    </p>
                    <div className="figures mt-1.5 font-extrabold leading-none">
                      <FitText basePx={34} minPx={22}>
                        <span className="mr-1 text-lg font-bold opacity-70">{cashflowHealthy ? "+" : "−"}</span>
                        {fmt(Math.abs(stats.net))}
                      </FitText>
                    </div>
                    {stats.income > 0 && (
                      <span
                        className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${
                          cashflowHealthy ? "bg-white/15 dark:bg-background/10" : "bg-danger text-white"
                        }`}
                      >
                        {cashflowHealthy ? `+${savingsRateNum}% ${t("triFlowSaved")}` : t("triFlowDeficit")}
                      </span>
                    )}
                  </div>

                  {/* income · expense · budget — expense opens its formula
                      modal (mobile KPI-explainer parity). Full-width row on
                      phones so the figures never push the card sideways. */}
                  <div className="grid w-full min-w-0 shrink-0 grid-cols-3 gap-3 sm:w-auto sm:gap-x-8">
                    <div className="min-w-0 text-right">
                      <p className="caps !text-white/70 dark:!text-background/70">{t("triFlowIncomeTile")}</p>
                      <p className="figures mt-1 font-extrabold">
                        <FitText basePx={16} minPx={11} title={t("triFlowIncomeTile")}>{fmt(stats.income)}</FitText>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/60 dark:text-background/60">
                        {incomeCount} {incomeCount === 1 ? t("anEntrySingular") : t("triFlowEntries")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setKpi("outflow")}
                      aria-label={t("analyticsKpiOutflowTitle")}
                      className="min-w-0 text-right transition hover:opacity-80 active:scale-[0.98]"
                    >
                      <p className="caps !text-white/70 dark:!text-background/70">{t("triFlowExpenseTile")}</p>
                      <p className="figures mt-1 font-extrabold">
                        <FitText basePx={16} minPx={11} title={t("triFlowExpenseTile")}>{fmt(stats.spent)}</FitText>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/60 dark:text-background/60">
                        {stats.expenseCount} {t("triFlowTransactions")}
                      </p>
                    </button>
                    <div className="min-w-0 text-right">
                      <p className="caps !text-white/70 dark:!text-background/70">{t("triFlowBudgetTile")}</p>
                      <p className="figures mt-1 font-extrabold">
                        <FitText basePx={16} minPx={11} title={t("triFlowBudgetTile")}>{budgetSet ? fmt(budgetVal) : t("triFlowNotSet")}</FitText>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/60 dark:text-background/60">
                        {budgetSet ? `${utilization}% ${t("triFlowUsed")}` : t("triFlowSetHint")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* consumption + ceiling bars (mobile parity) */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {stats.income > 0 && (
                    <div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-bold text-white/80 dark:text-background/80">{t("triFlowConsumption")}</span>
                        <span className="numeric text-xs font-bold">
                          {expenseToIncome}% {t("triFlowSpent")} ({fmt(stats.spent)})
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-white/25 dark:bg-background/20">
                        <div
                          className={`h-full rounded-full ${expenseToIncome > 100 ? "bg-danger" : "bg-white dark:bg-background"}`}
                          style={{ width: `${Math.min(100, expenseToIncome)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {budgetSet ? (
                    <div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-bold text-white/80 dark:text-background/80">{t("triFlowCeiling")}</span>
                        <span className="numeric text-xs font-bold">
                          {utilization}% ({fmt(budgetVal - stats.spent)} {t("triFlowRemaining")})
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-white/25 dark:bg-background/20">
                        <div
                          className={`h-full rounded-full ${overBudget ? "bg-danger" : "bg-white dark:bg-background"}`}
                          style={{ width: `${Math.min(100, utilization)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Link
                      href="/profit-loss"
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-white/15 px-3 py-3 transition hover:bg-white/25 dark:bg-background/10 dark:hover:bg-background/20"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-xs">
                        <Lightbulb size={14} className="shrink-0" aria-hidden />
                        {t("triFlowSetHint")}
                      </span>
                      <span className="caps shrink-0 !text-white dark:!text-background">{t("triFlowSetCta")}</span>
                    </Link>
                  )}
                </div>

                {/* smart insight box (mobile's five verdicts, composed with live figures) */}
                <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-white/15 px-3 py-2.5 dark:bg-background/10">
                  <span aria-hidden className="mt-0.5 shrink-0 opacity-80">
                    {overBudget ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  </span>
                  <p className="text-xs leading-snug">{insight}</p>
                </div>
              </section>

              {/* KPI tiles — every figure tappable to its live formula
                  (mobile parity). Income/expense/budget and the saved-%
                  badge live in the hero above, so these carry only the
                  derived metrics that appear nowhere else. */}
              <div className="grid w-full grid-cols-3 gap-3">
                <KpiTile
                  icon={<Gauge size={16} />}
                  label={t("anDailyVelocity")}
                  value={fmt(stats.dailyVelocity)}
                  sub={t("anBurnPerDay")}
                  onClick={() => setKpi("velocity")}
                />
                <KpiTile
                  icon={<Zap size={16} />}
                  tone="text-brass"
                  label={t("anPeakExpense")}
                  value={fmt(stats.peak)}
                  sub={
                    peakEntry
                      ? `${peakEntry.label} · ${shortDate(new Date(`${peakEntry.date}T00:00:00`), locale)}`
                      : t("anPeakSub")
                  }
                  onClick={() => setKpi("peak")}
                />
                <KpiTile
                  icon={<Sparkles size={16} />}
                  tone="text-info"
                  label={t("anAvgTicket")}
                  value={fmt(stats.avgTicket)}
                  sub={t("anPerExpense")}
                  onClick={() => setKpi("ticket")}
                />
              </div>

              {/* Cash flow chart */}
              <div className="panel w-full overflow-hidden">
                <FlowChartCard label={t("cashFlow")} bare compact rows={rows} />
              </div>

              {/* Health score | Habit diagnostics — a balanced bento pair:
                  the ring card beside the advisory list. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
                <section className="panel p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-strong" aria-hidden>
                        <Award size={18} />
                      </span>
                      <p className="text-[15px] font-extrabold leading-tight text-text">{t("anHealthTitle")}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${statusTone}`}>
                      <ShieldCheck size={12} aria-hidden />
                      {health.status}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-4 sm:gap-6">
                    <ProgressRing
                      pct={health.score / 100}
                      size={104}
                      strokeWidth={10}
                      color={scoreTone}
                      ariaLabel={`${t("anHealthTitle")} ${health.score} of 100, grade ${health.grade}`}
                    >
                      <span className="figures text-2xl font-extrabold leading-none" style={{ color: scoreTone }}>
                        {health.score}
                      </span>
                      <span className="caps-faint mt-1 !text-[9px]">{t("anScoreWord")}</span>
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white"
                          style={{ backgroundColor: gradeTone }}
                          aria-hidden
                        >
                          {health.grade}
                        </span>
                        <p className="min-w-0 truncate text-[15px] font-extrabold text-text">{health.status}</p>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">{tr(t("anCalcAcross"), { n: String(stats.entries) })}</p>
                      {stats.income > 0 && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-brass/40 bg-brass/10 px-2.5 py-1 text-[11px] font-bold text-brass">
                          <Sparkles size={12} aria-hidden />
                          {tr(t("anSavingsRatePill"), { r: savingsRatePct })}
                        </span>
                      )}
                      <p className="mt-2 text-xs leading-snug text-text-muted">{healthVerdict}</p>
                    </div>
                  </div>
                </section>

                {/* Habit Diagnostics & Advisory — compact ledger rows with
                    tone-keyed icons (was embedded in the health card). */}
                <section className="panel p-4 sm:p-5">
                  <p className="caps inline-flex items-center gap-2">
                    <Lightbulb size={14} className="text-primary-strong" aria-hidden />
                    {t("anDiagnostics")}
                  </p>
                  {health.insights.length === 0 ? (
                    <p className="mt-3 border border-dashed border-border px-3 py-8 text-center">
                      <span className="caps">{t("histNoData")}</span>
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border">
                      {health.insights.map((ins) => {
                        const InsIcon = ins.tone === "good" ? ShieldCheck : ins.tone === "warn" ? Flame : Coins;
                        const insTone =
                          ins.tone === "good" ? "text-income" : ins.tone === "warn" ? "text-danger" : "text-info";
                        return (
                          <li key={ins.title} className="flex items-start gap-3 py-3 first:pt-2 last:pb-0">
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated/60 ${insTone}`}
                              aria-hidden
                            >
                              <InsIcon size={15} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-text">{ins.title}</p>
                              <p className="mt-0.5 text-xs leading-snug text-text-muted">{ins.desc}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>

              {/* Largest individual outflows of the window */}
              <section className="panel w-full p-5">
                <p className="caps mb-3 inline-flex items-center gap-2">
                  <Clock size={14} className="text-primary-strong" aria-hidden />
                  {t("analyticsTopOutflows")}
                </p>
                {/* Two-up rows on sm+ — the card is full-width, so the
                    labels never squeeze into truncation. */}
                {stats.topEntries.length === 0 ? (
                  <p className="border border-dashed border-border px-3 py-8 text-center">
                    <span className="caps">{t("analyticsNoOutflows")}</span>
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {stats.topEntries.map((e, i) => {
                      const share = stats.spent > 0 ? Math.round((e.amount / stats.spent) * 100) : 0;
                      return (
                        <li key={e.id}>
                          {/* Drill: same History filters the composition rows read. */}
                          <Link
                            href={`/history?category=${e.categoryId ?? ""}&type=expense&from=${periodDays.from}&to=${periodDays.to}`}
                            title={`${shortDate(new Date(`${e.date}T00:00:00`), locale)} · ${e.method} — open in History`}
                            className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60"
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold ${
                                i === 0 ? "bg-brass/15 text-brass" : "bg-surface-elevated text-text-muted"
                              }`}
                              aria-hidden
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-text">{e.label}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-faint">
                                {shortDate(new Date(`${e.date}T00:00:00`), locale)} · {e.method}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="numeric block text-sm font-extrabold text-text">{fmt(e.amount)}</span>
                              <span className="numeric block text-[10px] text-faint">{share}%</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </section>
          )}

          {/* ═══ CATEGORY & PAYMENT CHANNELS ═══ */}
          {showCategories && (
            <section aria-label={t("anSecCategories")} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
                {/* Category breakdown with monthly caps — avatar-led rows */}
                <section className="panel p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-strong" aria-hidden>
                        <Tags size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-extrabold leading-tight text-text">{t("anSecCategories")}</p>
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {tr(t("anActiveCaps"), { n: String(activeCaps), total: String(limitByName.size) })}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/categories"
                      className="shrink-0 rounded-full border border-primary/30 bg-primary-light px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-primary-strong transition hover:bg-primary/10 active:scale-[0.97]"
                    >
                      {t("anAdjustCaps")}
                    </Link>
                  </div>
                  {stats.categories.length === 0 ? (
                    <p className="mt-4 border border-dashed border-border px-3 py-8 text-center">
                      <span className="caps">{t("histNoData")}</span>
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-2.5">
                      {(catsOpen ? stats.categories : stats.categories.slice(0, CATS_PREVIEW)).map((c) => {
                        const pct = stats.spent > 0 ? Math.round((c.value / stats.spent) * 100) : 0;
                        const limit = limitByName.get(c.label) ?? null;
                        const limitPct = limit ? Math.round((c.value / limit) * 100) : null;
                        const tone =
                          limitPct == null
                            ? "var(--sf-primary)"
                            : limitPct >= 100
                              ? "var(--sf-danger)"
                              : limitPct >= 75
                                ? "var(--sf-brass)"
                                : "var(--sf-income)";
                        const remaining = limit != null ? limit - c.value : null;
                        // Stored emoji → Lucide (web renders no emoji).
                        const CatIcon = categoryGlyph(c.icon);
                        return (
                          <li key={c.label}>
                            {/* Drill: same filters the History register reads. */}
                            <Link
                              href={`/history?category=${c.id}&type=expense&from=${cycleFrom}&to=${cycleTo}`}
                              title={`${c.count} entries — open in History`}
                              className="block rounded-xl border border-border/60 px-3 py-3 transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                  style={{ backgroundColor: `color-mix(in srgb, ${c.color} 16%, transparent)` }}
                                  aria-hidden
                                >
                                  <CatIcon size={16} style={{ color: c.color }} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold text-text">{c.label}</span>
                                  <span className="mt-0.5 block truncate text-[11px] text-faint">
                                    {c.count} {c.count === 1 ? t("anEntrySingular") : t("triFlowEntries")} · {pct}% {t("analyticsPeakOf")}
                                  </span>
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="numeric block text-sm font-extrabold text-text">{fmt(c.value)}</span>
                                  {limitPct != null && (
                                    <span className="numeric block text-[10px] font-bold" style={{ color: tone }}>
                                      {limitPct}%
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="mt-2.5 h-1.5 w-full rounded-full bg-surface-elevated">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                              </div>
                              {limitPct != null && limit != null && (
                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-[10px]">
                                  <span className="caps-faint" title={`${t("triFlowBudgetTile")} ${fmt(limit)}`}>
                                    {t("triFlowBudgetTile")} {fmt(limit)}
                                  </span>
                                  <span className="numeric shrink-0 font-bold" style={{ color: tone }}>
                                    {remaining != null && remaining > 0
                                      ? `${fmt(remaining)} ${t("anLeft")}`
                                      : `${limitPct}% ${t("anSpentOf")} ${fmt(limit)}`}
                                  </span>
                                </div>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {stats.categories.length > CATS_PREVIEW && (
                    <button
                      type="button"
                      onClick={() => setCatsOpen((o) => !o)}
                      aria-expanded={catsOpen}
                      className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-border text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60 active:scale-[0.99]"
                    >
                      {catsOpen ? t("anShowLess") : tr(t("anShowAll"), { n: String(stats.categories.length) })}
                      <ChevronDown size={14} className={`transition-transform ${catsOpen ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                  )}
                </section>

                {/* Allocation — hero figure, 100% stacked bar and breakdown
                    rows (tap to pin a slice; the bar + rows highlight
                    together). Top-6 + Other fold kept (mobile parity). */}
                <section className="panel flex flex-col justify-center p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-strong" aria-hidden>
                      <Layers size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold leading-tight text-text">{t("analyticsAllocation")}</p>
                      <p className="mt-0.5 truncate text-[11px] text-text-muted">
                        {tr(t("anNCategories"), { n: String(donutSlices.length) })}
                      </p>
                    </div>
                  </div>
                  {donutSlices.length === 0 ? (
                    <p className="mt-4 border border-dashed border-border px-3 py-8 text-center">
                      <span className="caps">{t("histNoData")}</span>
                    </p>
                  ) : (
                    <AllocationBars
                      slices={donutSlices}
                      total={stats.spent}
                      fmt={fmt}
                      currency={displayCurrency}
                      clearLabel={t("clear")}
                      totalLabel={t("anTotalSpending")}
                    />
                  )}
                </section>
              </div>

              {/* Payment channels — per-method icon cards */}
              <section className="panel p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-strong" aria-hidden>
                    <CreditCard size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold leading-tight text-text">{t("paymentChannel")}</p>
                    <p className="mt-0.5 truncate text-[11px] text-text-muted">
                      {tr(t("anMethodsUsed"), { n: String(stats.byMethod.length) })}
                    </p>
                  </div>
                </div>
                {stats.byMethod.length === 0 ? (
                  <p className="mt-4 border border-dashed border-border px-3 py-8 text-center">
                    <span className="caps">{t("histNoData")}</span>
                  </p>
                ) : (
                  <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {stats.byMethod.map(([method, m]) => {
                      const pct = methodTotal > 0 ? Math.round((m.total / methodTotal) * 100) : 0;
                      const MIcon = methodGlyph(method);
                      return (
                        <li key={method}>
                          <Link
                            href={`/history?method=${encodeURIComponent(method)}&type=expense&from=${cycleFrom}&to=${cycleTo}`}
                            title={`${m.count} entries — open in History`}
                            className="block rounded-xl border border-border/60 px-3 py-3 transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted" aria-hidden>
                                <MIcon size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-text">{method}</span>
                                <span className="mt-0.5 block truncate text-[11px] text-faint">
                                  {m.count === 1 ? `${m.count} ${t("anTxSingular")}` : tr(t("anTxCount"), { n: String(m.count) })}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="numeric block text-sm font-extrabold text-text">{fmt(m.total)}</span>
                                <span className="numeric block text-[10px] text-faint">{pct}%</span>
                              </span>
                            </div>
                            <div className="mt-2.5 h-1.5 w-full rounded-full bg-surface-elevated">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </section>
          )}

          {/* ═══ BEHAVIORAL PATTERNS & PACING FORECAST ═══ */}
          {showHabits && (
            <section aria-label={t("anSecHabits")} className="space-y-4">
              {/* Budget performance — ALWAYS the salary cycle window (APK
                  parity: pacing only makes sense against the cycle the budget
                  was set for). */}
              <section className="panel p-5">
                <p className="caps inline-flex items-center gap-2">
                  <Gauge size={14} className="text-primary-strong" aria-hidden />
                  {t("anBudgetPerf")}
                </p>
                {burn.isBudgetSet ? (
                  <>
                    <AdvisoryCard tone={burnVerdict.tone} title={burnVerdict.title} desc={burnVerdict.desc} className="mt-4" />
                    <div className="mt-5">
                      <BurnAxis
                        spentPct={budget ? (cycleStats.spent / budget) * 100 : 0}
                        projectedPct={burn.projectedPct}
                        budgetLabel={fmt(budget ?? 0)}
                        projectedLabel={fmt(burn.projected)}
                      />
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <KpiTile icon={<Landmark size={16} />} label={t("homeDailyAllowance")} value={fmt(burn.dailyAllowance)} sub={t("anTargetTile")} />
                      <KpiTile
                        icon={<Activity size={16} />}
                        tone={burn.isHighBurn ? "text-danger" : "text-income"}
                        label={t("anActualPaceTile")}
                        value={fmt(burn.actualPace)}
                        sub={burn.isHighBurn ? t("anPaceAbove") : t("anSafePace")}
                      />
                      <KpiTile
                        icon={<Zap size={16} />}
                        label={t("homeProjectedClose")}
                        value={fmt(burn.projected)}
                        sub={`${t("anSpentOf")} ${fmt(budget ?? 0)}`}
                      />
                      <KpiTile icon={<Coins size={16} />} label={t("anProjectedIncome")} value={fmt(burn.projectedIncome)} sub={t("homeOnPace")} />
                    </div>
                  </>
                ) : (
                  <Link
                    href="/profit-loss"
                    className="mt-4 flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-4 transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted"><Lightbulb size={14} className="shrink-0 text-brass" aria-hidden />{t("triFlowSetHint")}</span>
                    <span className="caps shrink-0 !text-primary-strong">{t("triFlowSetCta")}</span>
                  </Link>
                )}
              </section>

              {/* Day-of-week + time-of-day behavioral rhythms */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
                <section className="panel p-5">
                  <p className="caps mb-3 inline-flex items-center gap-2">
                    <CalendarDays size={14} className="text-primary-strong" aria-hidden />
                    {t("anDayRhythm")}
                  </p>
                  <ul>
                    {stats.byWeekday.map((v, i) => (
                      <li key={i} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                        <span className="caps w-10 shrink-0">{weekdayNames[i]}</span>
                        <div className="h-2.5 flex-1 rounded-full bg-surface-elevated">
                          <div
                            className={`h-full rounded-full transition-all ${i === 0 || i === 6 ? "bg-brass" : "bg-primary"}`}
                            style={{ width: `${Math.round((v / weekdayMax) * 100)}%` }}
                          />
                        </div>
                        <span className="numeric w-24 shrink-0 text-right text-xs font-bold text-text sm:w-28">{fmt(v)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="panel p-5">
                  <p className="caps mb-3 inline-flex items-center gap-2">
                    <Clock size={14} className="text-primary-strong" aria-hidden />
                    {t("anTimePattern")}
                  </p>
                  {stats.timedEntries === 0 ? (
                    <p className="border border-dashed border-border px-3 py-8 text-center">
                      <span className="caps">{t("analyticsTimeUntimed")}</span>
                    </p>
                  ) : (
                    <>
                      <ul>
                        {stats.byTimeOfDay.map((v, i) => {
                          const ChronoIcon = chronoIcons[i];
                          return (
                            <li key={i} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                              <span className="inline-flex w-28 shrink-0 items-center gap-1.5 text-sm font-semibold text-text sm:w-32">
                                <ChronoIcon size={14} className="shrink-0 text-faint" aria-hidden />
                                <span className="truncate">{timeOfDayNames[i]}</span>
                              </span>
                              <div className="h-2.5 flex-1 rounded-full bg-surface-elevated">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.round((v / timeOfDayMax) * 100)}%`, backgroundColor: "var(--sf-primary)" }}
                                />
                              </div>
                              <span className="numeric w-24 shrink-0 text-right text-xs font-bold text-text sm:w-28">{fmt(v)}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-2 text-[11px] text-faint">{t("analyticsTimeUntimed")}</p>
                    </>
                  )}
                </section>
              </div>

              {/* 12-month rhythm + calendar heat — grouped bars and a
                  contribution-style density calendar over the window's spend. */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-start">
                <section className="panel p-5">
                  <p className="caps mb-3 inline-flex items-center gap-2">
                    <BarChart3 size={14} className="text-primary-strong" aria-hidden />
                    {t("anMonthRhythm")}
                  </p>
                  <MonthBars
                    points={monthPoints}
                    locale={locale}
                    formatValue={fmt}
                    height={150}
                    onMonthTap={(key) =>
                      router.push(`/history?from=${key}-01&to=${monthEnd(key)}&type=expense`)
                    }
                  />
                </section>
                <section className="panel flex flex-col justify-center p-5">
                  <p className="caps mb-3 inline-flex items-center gap-2">
                    <CalendarDays size={14} className="text-primary-strong" aria-hidden />
                    {t("anCalendarHeat")}
                  </p>
                  {/* Compact calendar — width-capped so the month grid stays
                      small (the 12-month bars carry the trend story). */}
                  <div className="mx-auto w-full max-w-[250px] sm:max-w-[290px]">
                    <HeatCalendar
                      values={stats.dailyByDate}
                      locale={locale}
                      formatValue={fmt}
                      onDayTap={(iso) => router.push(`/history?from=${iso}&to=${iso}&type=expense`)}
                    />
                  </div>
                </section>
              </div>
            </section>
          )}

          {/* KPI calculation explainer (mobile parity: tap a tile → live formula) */}
          <Modal open={kpi != null} onClose={() => setKpi(null)} title={kpi ? KPI_CONTENT[kpi].title : ""} maxWidth="max-w-md">
            {kpi && (
              <div className="space-y-3 px-5 pt-4">
                <p className="text-sm leading-relaxed text-text-muted">{KPI_CONTENT[kpi].def}</p>
                <div className="border border-border bg-surface-elevated/40 p-3">
                  <p className="caps !text-primary-strong">{t("analyticsKpiHow")}</p>
                  <p className="numeric mt-1.5 break-words text-xs leading-relaxed text-text">{KPI_CONTENT[kpi].calc}</p>
                </div>
                {KPI_CONTENT[kpi].tip && (
                  <div className="border border-brass/50 bg-brass/10 p-3">
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-brass">
                      <Lightbulb size={13} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="numeric">{KPI_CONTENT[kpi].tip}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </Modal>

          <p className="text-[11px] leading-relaxed text-faint">
            Covers your latest 5,000 entries for the current cycle. Adherence and projection
            percentages are computed in canonical USD so they never drift when you switch display
            currency. Category and channel rows open History pre-filtered to the same range — top
            outflow rows drill the same way.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span className="stamp">No. {cycleStatementNo(cycle)}</span>
            <span className="stamp">
              {stats.entries} {t("triFlowEntries")} · {printed}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── KPI tile: label left · icon right, FitText figure, sub note; tappable
    explainers (mobile parity) ── */
function KpiTile({
  icon,
  label,
  value,
  sub,
  tone,
  onClick,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="caps min-w-0 leading-snug">{label}</p>
        <span className={`shrink-0 ${tone ?? "text-text-muted"}`} aria-hidden>
          {icon}
        </span>
      </div>
      <div className="figures mt-2 font-extrabold text-text">
        <FitText basePx={19} minPx={12} title={label}>
          {value}
        </FitText>
      </div>
      {sub && (
        <p className="mt-1 truncate text-[11px] text-faint" title={sub}>
          {sub}
        </p>
      )}
    </>
  );
  const cls = `panel min-w-0 p-4 text-left sm:p-5 ${className}`;
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${cls} block w-full transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60 active:scale-[0.99]`}
    >
      {inner}
    </button>
  );
}

/* ── Advisory card: tone-keyed diagnostic/verdict block ── */
function AdvisoryCard({
  tone,
  title,
  desc,
  className = "",
}: {
  tone: "good" | "warn" | "info";
  title: string;
  desc: string;
  className?: string;
}) {
  const Icon = tone === "good" ? ShieldCheck : tone === "warn" ? Flame : Coins;
  const toneCls =
    tone === "good"
      ? "border-income/40 text-income"
      : tone === "warn"
        ? "border-danger/40 text-danger"
        : "border-info/40 text-info";
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${toneCls} bg-surface-elevated/30 p-4 ${className}`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-surface ${toneCls}`} aria-hidden>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text">{title}</p>
        <p className="mt-1 text-xs leading-snug text-text-muted">{desc}</p>
      </div>
    </div>
  );
}

/* ── Allocation breakdown: hero figure + 100% stacked bar + rows. Tapping a
    bar segment or a row pins that slice everywhere (hero flips to its figure,
    others dim); tap again or Clear to release. ── */
function AllocationBars({
  slices,
  total,
  fmt,
  currency,
  clearLabel,
  totalLabel,
}: {
  slices: { label: string; value: number; color: string }[];
  total: number;
  fmt: (n: number) => string;
  currency: string;
  clearLabel: string;
  totalLabel: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  const active = sel ? slices.find((s) => s.label === sel) ?? null : null;
  const toggle = (label: string) => setSel((cur) => (cur === label ? null : label));
  return (
    <div className="mt-4">
      {/* hero figure — total, or the pinned slice */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="figures font-extrabold text-text">
            <FitText basePx={26} minPx={16}>{fmt(active ? active.value : total)}</FitText>
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
            {active ? (
              <>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: active.color }} aria-hidden />
                <span className="truncate">
                  {active.label} · {Math.round((active.value / sum) * 100)}%
                </span>
              </>
            ) : (
              <span className="truncate">
                {currency} · {totalLabel}
              </span>
            )}
          </p>
        </div>
        {active && (
          <button type="button" onClick={() => setSel(null)} className="caps shrink-0 !text-primary-strong hover:underline">
            {clearLabel}
          </button>
        )}
      </div>

      {/* 100% stacked bar — rounded ends via the clipping container */}
      <div
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / sum) * 100)}%`).join(", ")}
      >
        {slices.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => toggle(s.label)}
            aria-pressed={sel === s.label}
            aria-label={`${s.label} ${Math.round((s.value / sum) * 100)}%`}
            className={`h-full transition-opacity ${sel && sel !== s.label ? "opacity-25" : ""}`}
            style={{ width: `${(s.value / sum) * 100}%`, backgroundColor: s.color }}
          />
        ))}
      </div>

      {/* breakdown rows — share only (the amounts live in the Categories
          panel; no duplicated figures inside the group) */}
      <ul className="mt-4 space-y-1">
        {slices.map((s) => {
          const pct = Math.round((s.value / sum) * 100);
          return (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => toggle(s.label)}
                aria-pressed={sel === s.label}
                className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left transition ${
                  sel === s.label ? "bg-surface-elevated" : "hover:bg-surface-elevated/60"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">{s.label}</span>
                <span className="h-1 w-16 shrink-0 rounded-full bg-surface-elevated">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                </span>
                <span className="numeric w-8 shrink-0 text-right text-[11px] text-faint">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** {token} substitution — i18n fragments composed with live figures. */
function tr(s: string, map: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? "");
}

/* ── Burn axis: 0 → scale end with spent fill, budget tick, projection marker ── */
function BurnAxis({
  spentPct,
  projectedPct,
  budgetLabel,
  projectedLabel,
}: {
  spentPct: number;
  projectedPct: number | null;
  budgetLabel: string;
  projectedLabel: string;
}) {
  const scaleEnd = Math.max(110, (projectedPct ?? 0) + 10);
  const at = (pct: number) => `${Math.min((pct / scaleEnd) * 100, 100)}%`;
  const over = (projectedPct ?? 0) > 100;

  return (
    <div>
      <div className="relative h-2.5 w-full rounded-full bg-surface-elevated">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${spentPct > 100 ? "bg-danger" : "bg-primary"}`}
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
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
        <span className="stamp shrink-0">Spent {Math.round(spentPct)}%</span>
        <span className="stamp truncate" title={`Budget ${budgetLabel}`}>
          Budget {budgetLabel}
        </span>
      </div>
      {projectedPct != null && (
        <p
          className="mt-1 flex items-center gap-1 text-[11px] font-bold"
          style={{ color: over ? "var(--sf-danger)" : "var(--sf-brass)" }}
        >
          {over ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
          <span className="numeric">
            Projected {projectedPct}% — {projectedLabel}
          </span>
        </p>
      )}
    </div>
  );
}

function shortDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

/** Last calendar day of a "YYYY-MM" month key (local time, no TZ drift). */
function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}
