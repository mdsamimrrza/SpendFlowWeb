"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Banknote,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
  PieChart,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter, useBudget } from "@/hooks/useRates";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { listExpenses, type ExpenseRow } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { Skeleton } from "@/components/ui/Skeleton";
import { CalendarModal } from "@/components/ui/CalendarModal";
import { FitText } from "@/components/ui/FitText";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import { categoryGlyph } from "@/components/ui/Glyph";
import {
  formatMoney,
  formatDate,
  getCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  toISODate,
  isValidISODate,
} from "@/utils/format";

/**
 * Analytics — a 1:1 port of the mobile app's analytics screen
 * (SpendFlow/app/(tabs)/analytics.tsx + its card components). Same card
 * order, same structure, same color language:
 *  · Top bar: "Financial Intelligence" kicker + title + privacy eye + theme.
 *  · Dual in-place floating dropdowns: period (Day/Week/Month/Year/Custom/All)
 *    and section focus (Overview/Categories/Habits/All).
 *  · Overview: Income-Expense-Budget tri-flow card → 4-tile KPI grid (tappable
 *    calculation explainers) → 0–100 Financial Health Score card.
 *  · Categories: segmented flip breakdown (Categories → Payment → Income),
 *    category budget caps matrix, payment-method breakdown.
 *  · Habits: Day-of-Week rhythm with week navigation + flow flip, chrono
 *    Time-of-Day pattern, budget burn & pacing forecast.
 * Formulas follow the mobile components exactly (FinancialHealthScoreCard,
 * BudgetAnalyticsCard, FinancialInsights, IncomeExpenseBudgetCard). All UI
 * colors flow through the `--sf-*` tokens (globals.css) — mobile's fixed
 * accent hues are tokenized too, so nothing carries a raw hex.
 */

/* ── mobile VIBRANT_PALETTE (components/expense/Charts.tsx) — the breakdown
   ranks its top-6 slices with these fixed DATA colors, by position. They are
   data colors (mobile renders the same hexes), not UI chrome. ── */
const VIBRANT_PALETTE = [
  "#4F46E5", // Indigo
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
] as const;

/* mobile CalendarModal constants (ui/CalendarModal.tsx) — the app renders
   these English calendar labels in every language; mirrored exactly. */
const CAL_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CAL_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAL_CURRENT_YEAR = new Date().getFullYear();
const CAL_YEARS = Array.from({ length: CAL_CURRENT_YEAR - 2000 + 2 }, (_, i) => 2000 + i);

type PeriodKey = "today" | "week" | "cycle" | "year" | "custom" | "all";

const PERIODS: { key: PeriodKey; labelKey: TranslationKey }[] = [
  { key: "today", labelKey: "anPeriodToday" },
  { key: "week", labelKey: "anPeriodWeek" },
  { key: "cycle", labelKey: "anPeriodMonth" },
  { key: "year", labelKey: "anPeriodYear" },
  { key: "custom", labelKey: "anPeriodCustom" },
  { key: "all", labelKey: "anPeriodAll" },
];

type SectionKey = "overview" | "categories" | "habits" | "all";

const SECTION_TABS: { key: SectionKey; labelKey: TranslationKey; Icon: typeof LayoutGrid }[] = [
  { key: "overview", labelKey: "anSecOverview", Icon: LayoutGrid },
  { key: "categories", labelKey: "anSecCategories", Icon: PieChart },
  { key: "habits", labelKey: "anSecHabits", Icon: Activity },
  { key: "all", labelKey: "anSecAll", Icon: Layers },
];

/* The mobile screen's KPI tiles — tapping one opens its live formula. */
type KpiMetricKey = "total" | "velocity" | "peak" | "ticket";

type BreakdownView = "expense" | "payment" | "income";
const VIEW_ORDER: BreakdownView[] = ["expense", "payment", "income"];

interface Insight {
  tone: "success" | "warning" | "info";
  Icon: typeof ShieldCheck;
  title: string;
  desc: string;
}

/* Design-preview seam: /preview-analytics passes mock rows/profile/budget so
   the screen renders without auth. Undefined in production — the page then
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
  const { convert, convertToday } = useRowConverter(profile?.preferred_currency, rows);
  const authBudget = useBudget();
  const budget = inject ? (inject.budget ?? null) : authBudget;
  const supabase = getSupabaseBrowserClient();
  // Category monthly limits (budget_monthly) drive the caps matrix.
  const { categories: allCategories } = useCategories(user?.id);

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

  /* ── Screen state (mobile analytics.tsx parity) ── */
  const [period, setPeriod] = useState<PeriodKey>("cycle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [section, setSection] = useState<SectionKey>("overview");
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [kpiModal, setKpiModal] = useState<KpiMetricKey | null>(null);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [flowType, setFlowType] = useState<"expense" | "income">("expense");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [inspectRow, setInspectRow] = useState<ExpenseRow | null>(null);
  const [inspectAmount, setInspectAmount] = useState("");

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

  // Rows inside the selected period window (the mobile `filteredItems`).
  const periodRows = useMemo(
    () => rows.filter((r) => r.date >= periodDays.from && r.date <= periodDays.to),
    [rows, periodDays.from, periodDays.to],
  );

  // "At today's rate" counterpart for the Total-spending explainer (the
  // holdings view beside the frozen headline — brokerage cost/market pattern).
  const spentTodayRate = useMemo(() => {
    let sum = 0;
    for (const r of periodRows) {
      if (r.type === "income") continue;
      const v = convertToday(r);
      if (v == null) return null;
      sum += v;
    }
    return sum;
  }, [periodRows, convertToday]);

  // Window aggregate builder — called twice: once for the selected period
  // (KPIs/composition) and once for the cycle (burn analysis + budget
  // adherence). Mobile splits the same way: its KPI tiles follow the period
  // dropdown while BudgetAnalyticsCard filters to the cycle internally.
  const buildStats = useCallback(
    (fromISO: string, toISO: string, total: number, elapsed: number) => {
      let spent = 0;
      let income = 0;
      let peak = 0;
      let expenseCount = 0;
      let entries = 0;
      let weekendSpend = 0;
      const byMethod = new Map<string, { total: number; count: number }>();
      const topEntries: {
        id: string;
        date: string;
        amount: number;
        label: string;
        method: string;
        categoryId: string | null;
        icon?: string | null;
      }[] = [];
      const byCategory = new Map<string, { label: string; value: number; id: string | null; count: number; icon?: string | null }>();
      const byCategoryIncome = new Map<string, { label: string; value: number; id: string | null; count: number; icon?: string | null }>();

      for (const row of rows) {
        if (row.date < fromISO || row.date > toISO) continue;
        entries += 1;
        const v = convert(row);
        const isIncome = row.type === "income";

        if (isIncome) {
          income += v;
          const inName = row.categories?.name ?? "Other";
          const slot = byCategoryIncome.get(inName) ?? {
            label: inName,
            value: 0,
            id: row.category_id,
            count: 0,
            icon: row.categories?.icon,
          };
          slot.value += v;
          slot.count += 1;
          byCategoryIncome.set(inName, slot);
          continue;
        }
        spent += v;
        expenseCount += 1;
        peak = Math.max(peak, v);
        const wd = new Date(`${row.date}T00:00:00`).getDay();
        if (wd === 0 || wd === 6) weekendSpend += v;
        const m = byMethod.get(row.payment_method) ?? { total: 0, count: 0 };
        m.total += v;
        m.count += 1;
        byMethod.set(row.payment_method, m);
        topEntries.push({
          id: row.id,
          date: row.date,
          amount: v,
          label: row.description || row.categories?.name || "Expense",
          method: row.payment_method,
          categoryId: row.category_id,
          icon: row.categories?.icon,
        });
        const name = row.categories?.name ?? "Other";
        const slice = byCategory.get(name) ?? {
          label: name,
          value: 0,
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
        weekendSpend,
        byMethod: Array.from(byMethod.entries()).sort((a, b) => b[1].total - a[1].total),
        topEntries: topEntries.sort((a, b) => b.amount - a.amount).slice(0, 5),
        categories: Array.from(byCategory.values()).sort((a, b) => b.value - a.value),
        incomeCategories: Array.from(byCategoryIncome.values()).sort((a, b) => b.value - a.value),
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

  /* ── Financial Health Score — mobile FinancialHealthScoreCard, 1:1 ── */
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

    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthProgress = currentDay / daysInMonth;

    let budgetPoints = 30; // max 35 — default when no budget on file
    let volatilityPoints = 20; // max 25
    let categoryPoints = 18; // max 20
    let weekendPoints = 16; // max 20
    let savingsBonus = 0; // max 10
    const insights: Insight[] = [];

    let computedSavingsRate: number | null = null;

    // 1. Savings rate & cash-flow diagnostic (bonus 0–10)
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

    // 2. Budget adherence (0–35) — budget is a cycle figure, pinned to the
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

    // 3. Spending volatility & spikes (0–25) — CV of active-day totals
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

    // 4. Category concentration & diversity (0–20)
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

    // 5. Weekend vs weekday surge ratio (0–20)
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

    // Total score 0–100 (mobile: floor 10, cap 100)
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

  // Burn analysis — ALWAYS the salary cycle window (mobile parity: the burn
  // card ignores the period dropdown; pacing only makes sense against the
  // cycle the budget was set for).
  const burn = useMemo(() => {
    const isBudgetSet = budget != null && budget > 0;
    const dailyAllowance = isBudgetSet ? budget / cycleStats.daysTotal : 0;
    const actualPace = cycleStats.spent / cycleStats.daysElapsed;
    const projected = actualPace * cycleStats.daysTotal;
    const isOver = isBudgetSet && cycleStats.spent > budget;
    const isHighBurn = isBudgetSet && actualPace > dailyAllowance;
    const projectedPct = budget != null && budget > 0 ? Math.round((projected / budget) * 100) : 0;
    const incomeDailyPace = cycleStats.income / cycleStats.daysElapsed;
    const projectedIncome = incomeDailyPace * cycleStats.daysTotal;
    return { isBudgetSet, dailyAllowance, actualPace, projected, isOver, isHighBurn, projectedPct, incomeDailyPace, projectedIncome };
  }, [budget, cycleStats]);

  /* ── Week-by-week rhythm (mobile FinancialInsights: Monday-anchored week,
     navigated independently of the period dropdown, flows by `flowType`) ── */
  const week = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const diffToMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday + weekOffset * 7, 12, 0, 0);
    const startIso = toISODate(monday);
    const endIso = toISODate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12, 0, 0));

    const startStr = monday.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const endStr = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    });

    const fShort = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const fLong = new Intl.DateTimeFormat(locale, { weekday: "long" });
    const days = Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 12, 0, 0);
      return {
        iso: toISODate(cur),
        name: fShort.format(cur),
        full: fLong.format(cur),
        total: 0,
        count: 0,
        entries: [] as ExpenseRow[],
      };
    });

    const quadrants = [
      { key: "morning", label: t("analyticsMorning"), hours: "6 AM – 12 PM", total: 0, count: 0, color: "var(--sf-hue-amber)" },
      { key: "afternoon", label: t("analyticsAfternoon"), hours: "12 PM – 5 PM", total: 0, count: 0, color: "var(--sf-hue-sky)" },
      { key: "evening", label: t("analyticsEvening"), hours: "5 PM – 9 PM", total: 0, count: 0, color: "var(--sf-hue-indigo)" },
      { key: "night", label: t("analyticsNight"), hours: "9 PM – 6 AM", total: 0, count: 0, color: "var(--sf-hue-lilac)" },
    ];

    let weekTotal = 0;
    const activeWeek = rows.filter(
      (e) => e.date && e.date.slice(0, 10) >= startIso && e.date.slice(0, 10) <= endIso && (flowType === "income" ? e.type === "income" : e.type !== "income"),
    );
    for (const e of activeWeek) {
      const amt = convert(e);
      const day = days.find((d) => d.iso === e.date.slice(0, 10));
      if (day) {
        day.total += amt;
        day.count += 1;
        day.entries.push(e);
      }
      weekTotal += amt;
      // Mobile hour bands: 6–12 morning · 12–17 afternoon · 17–21 evening ·
      // else night. Untimed rows fall back to noon (afternoon band).
      let hour = 12;
      if (e.time) {
        const parsed = parseInt(e.time.slice(0, 2), 10);
        if (!isNaN(parsed)) hour = parsed;
      }
      const qi = hour >= 6 && hour < 12 ? 0 : hour >= 12 && hour < 17 ? 1 : hour >= 17 && hour < 21 ? 2 : 3;
      quadrants[qi].total += amt;
      quadrants[qi].count += 1;
    }

    const maxDaySpend = Math.max(...days.map((d) => d.total), 1);
    const peakDay = [...days].sort((a, b) => b.total - a.total)[0];
    const peakQuadrant = [...quadrants].sort((a, b) => b.total - a.total)[0];

    return {
      weekLabel: `${startStr} – ${endStr}`,
      isCurrentWeek: weekOffset === 0,
      days,
      maxDaySpend,
      peakDay: peakDay && peakDay.total > 0 ? peakDay : null,
      peakDayPct: peakDay && peakDay.total > 0 && weekTotal > 0 ? Math.round((peakDay.total / weekTotal) * 100) : 0,
      total: weekTotal,
      items: activeWeek,
      hasIncome: rows.some((e) => e.type === "income"),
      quadrants: quadrants.map((q) => ({ ...q, pct: weekTotal > 0 ? Math.round((q.total / weekTotal) * 100) : 0 })),
      peakQuadrant: peakQuadrant && peakQuadrant.total > 0 ? peakQuadrant : null,
    };
  }, [rows, weekOffset, flowType, convert, t, locale]);

  /* ── Flip-cycle breakdown (mobile CategoryBreakdown: Categories →
     Payment → Income) ── */
  const [view, setView] = useState<BreakdownView>("expense");
  const availableViews = useMemo<BreakdownView[]>(() => {
    const list: BreakdownView[] = ["expense"];
    if (stats.byMethod.length > 0) list.push("payment");
    if (stats.income > 0) list.push("income");
    return list;
  }, [stats.byMethod.length, stats.income]);
  useEffect(() => {
    if (!availableViews.includes(view)) setView("expense");
  }, [availableViews, view]);
  const nextView = () => {
    const idx = availableViews.indexOf(view);
    setView(availableViews[(idx + 1) % availableViews.length]);
    setSelectedCat(null);
  };

  const topExpenseSlices = useMemo(
    () =>
      stats.categories.slice(0, 6).map((c, i) => ({
        ...c,
        color: VIBRANT_PALETTE[i % VIBRANT_PALETTE.length],
        pct: stats.spent > 0 ? Math.round((c.value / stats.spent) * 100) : 0,
      })),
    [stats.categories, stats.spent],
  );
  const topIncomeSlices = useMemo(
    () =>
      stats.incomeCategories.slice(0, 6).map((c, i) => ({
        ...c,
        color: VIBRANT_PALETTE[i % VIBRANT_PALETTE.length],
        pct: stats.income > 0 ? Math.round((c.value / stats.income) * 100) : 0,
      })),
    [stats.incomeCategories, stats.income],
  );

  const paymentRows = useMemo(
    () =>
      stats.byMethod.map(([method, m]) => ({
        method,
        total: m.total,
        count: m.count,
        pct: stats.spent > 0 ? Math.round((m.total / stats.spent) * 100) : 0,
      })),
    [stats.byMethod, stats.spent],
  );

  /* ── Category budget caps matrix (mobile BudgetProgress) ── */
  interface CapRow {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    cap: number;
    spent: number;
    pct: number;
    count: number;
    txns: ExpenseRow[];
  }
  const capRows = useMemo<CapRow[]>(() => {
    let caps: { id: string; name: string; icon?: string | null; color?: string | null; cap: number }[];
    if (inject?.limits) {
      caps = Object.entries(inject.limits)
        .filter(([, v]) => v > 0)
        .map(([name, cap]) => {
          const row = rows.find((r) => r.categories?.name === name);
          return { id: name, name, icon: row?.categories?.icon, color: row?.categories?.color, cap };
        });
    } else {
      caps = allCategories
        .filter((c) => c.type === "expense" && c.budget_monthly != null && Number(c.budget_monthly) > 0)
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, cap: Number(c.budget_monthly) }));
    }
    return caps
      .map((c) => {
        const txns = periodRows.filter((r) => r.type !== "income" && (r.categories?.name ?? "Other") === c.name);
        const spent = txns.reduce((s, r) => s + convert(r), 0);
        const pct = c.cap > 0 ? Math.round((spent / c.cap) * 100) : 0;
        return { ...c, spent, pct, count: txns.length, txns };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [allCategories, inject, periodRows, rows, convert]);

  const totalAllocated = capRows.reduce((s, c) => s + c.cap, 0);
  const daysRemaining = Math.max(1, cycleStats.daysTotal - cycleStats.daysElapsed);
  const [capsExpanded, setCapsExpanded] = useState(false);
  const [openCapId, setOpenCapId] = useState<string | null>(null);

  // Selected category in the flip card's drawer.
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const slicesForView = view === "income" ? topIncomeSlices : topExpenseSlices;
  const selectedSlice = slicesForView.find((s) => s.label === selectedCat) ?? null;
  const drawerRows = useMemo(() => {
    if (!selectedSlice) return [];
    const ft = view === "income" ? "income" : "expense";
    return periodRows.filter(
      (e) => (ft === "income" ? e.type === "income" : e.type !== "income") && (e.categories?.name ?? "Other") === selectedSlice.label,
    );
  }, [selectedSlice, periodRows, view]);

  const showOverview = section === "overview" || section === "all";
  const showCategories = section === "categories" || section === "all";
  const showHabits = section === "habits" || section === "all";
  const incomeCount = stats.entries - stats.expenseCount;
  const peakEntry = stats.topEntries[0] ?? null;

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
        <Skeleton className="mb-6 h-9 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-4 h-28 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </main>
    );
  }

  const chartColor = flowType === "income" ? "var(--sf-income)" : "var(--sf-primary)";

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 pb-28 pt-4 sm:px-6 xl:max-w-[1200px]">
      <div className="space-y-4">
        {/* ── 1. TOP APP BAR ── */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-text-muted">{t("anKicker")}</p>
            <h1 className="mt-0.5 text-[28px] font-extrabold leading-9 tracking-[-0.3px] text-text">
              <FitText basePx={28} minPx={22} title={t("anTitle")}>
                {t("anTitle")}
              </FitText>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PrivacyEyeButton />
            {/* Mobile shows the shell's global toggle (user request 2026-09-16). */}
            <ThemeToggle className="hidden p-2 sm:grid" />
          </div>
        </header>

        {/* ── 2. DUAL SIDE-BY-SIDE FLOATING DROPDOWNS ── */}
        <div className="relative z-40 flex max-w-[560px] items-center gap-2.5">
          {(periodModalOpen || sectionModalOpen) && (
            <button
              type="button"
              aria-label={t("anCloseMenus")}
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => {
                setPeriodModalOpen(false);
                setSectionModalOpen(false);
              }}
            />
          )}

          <FloatingSelect
            className="relative z-50 flex-1"
            icon={<Calendar size={14} className="shrink-0 text-primary" aria-hidden />}
            label={t(PERIODS.find((p) => p.key === period)?.labelKey ?? "anPeriodMonth")}
            open={periodModalOpen}
            onToggle={() => {
              setPeriodModalOpen((v) => !v);
              setSectionModalOpen(false);
            }}
          >
            {PERIODS.map((opt) => {
              const selected = period === opt.key;
              return (
                <SelectRow
                  key={opt.key}
                  selected={selected}
                  label={t(opt.labelKey)}
                  onSelect={() => {
                    if (opt.key === "custom") {
                      setPeriodModalOpen(false);
                      setCalendarOpen(true);
                    } else {
                      setPeriod(opt.key);
                      setPeriodModalOpen(false);
                    }
                  }}
                />
              );
            })}
          </FloatingSelect>

          <FloatingSelect
            className="relative z-50 flex-1"
            icon={(() => {
              const Ic = SECTION_TABS.find((x) => x.key === section)?.Icon ?? LayoutGrid;
              return <Ic size={14} className="shrink-0 text-primary" aria-hidden />;
            })()}
            label={t(SECTION_TABS.find((x) => x.key === section)?.labelKey ?? "anSecOverview")}
            open={sectionModalOpen}
            onToggle={() => {
              setSectionModalOpen((v) => !v);
              setPeriodModalOpen(false);
            }}
          >
            {SECTION_TABS.map((tab) => {
              const selected = section === tab.key;
              return (
                <SelectRow
                  key={tab.key}
                  selected={selected}
                  label={t(tab.labelKey)}
                  leading={<tab.Icon size={13} className={selected ? "text-primary" : "text-text-muted"} aria-hidden />}
                  onSelect={() => {
                    setSection(tab.key);
                    setSectionModalOpen(false);
                  }}
                />
              );
            })}
          </FloatingSelect>
        </div>

        {error ? <p className="border border-danger p-4 text-sm text-danger">{error}</p> : null}

        {/* ═══ SECTION 1: OVERVIEW & PERFORMANCE ═══ */}
        {showOverview && !error && (
          <section aria-label={t("anSecOverview")} className="space-y-3">
            {section === "all" && <SectionHead Icon={LayoutGrid} label={t("anHeadOverview")} />}

            {/* Income, Expense & Budget analysis card */}
            <TriFlowCard
              t={t}
              fmt={fmt}
              income={stats.income}
              spent={stats.spent}
              net={stats.net}
              incomeCount={incomeCount}
              expenseCount={stats.expenseCount}
              budget={budget}
              savingsRateNum={
                stats.income > 0 ? Math.max(-100, Math.round(((stats.income - stats.spent) / stats.income) * 100)) : 0
              }
              expenseToIncome={stats.income > 0 ? Math.round((stats.spent / stats.income) * 100) : 0}
              utilization={budget != null && budget > 0 ? Math.round((stats.spent / budget) * 100) : 0}
            />

            {/* 4-tile executive KPI grid — tapping opens the explainer */}
            <div className="grid grid-cols-1 gap-2.5 min-[390px]:grid-cols-2 xl:grid-cols-4">
              <KpiTile
                label={t("anTotalSpending")}
                labelTone="text-primary"
                icon={<Wallet size={16} className="text-primary" aria-hidden />}
                value={fmt(stats.spent)}
                sub={
                  incomeCount > 0
                    ? tr(t("anTileExpensesIncome"), { e: String(stats.expenseCount), i: String(incomeCount) })
                    : tr(t("anTileExpensesOnly"), { n: String(stats.expenseCount) })
                }
                hero
                onClick={() => setKpiModal("total")}
              />
              <KpiTile
                label={t("anDailyVelocity")}
                icon={<Gauge size={16} className="text-primary" aria-hidden />}
                value={fmt(stats.dailyVelocity)}
                sub={t("anBurnRatePerDay")}
                onClick={() => setKpiModal("velocity")}
              />
              <KpiTile
                label={t("anPeakExpense")}
                icon={<Zap size={16} aria-hidden style={{ color: "var(--sf-hue-amber)" }} />}
                value={peakEntry ? fmt(peakEntry.amount) : "—"}
                sub={
                  peakEntry ? (
                    <span className="flex min-w-0 items-center gap-1">
                      {peakEntry.icon ? (() => { const G = categoryGlyph(peakEntry.icon); return <G size={12} className="shrink-0" aria-hidden />; })() : null}
                      <span className="truncate">{peakEntry.label}</span>
                    </span>
                  ) : (
                    t("anNoPurchases")
                  )
                }
                onClick={() => setKpiModal("peak")}
              />
              <KpiTile
                label={t("anAvgTicket")}
                icon={<Sparkles size={16} aria-hidden style={{ color: "var(--sf-hue-sky)" }} />}
                value={fmt(stats.avgTicket)}
                sub={t("anPerTxSize")}
                onClick={() => setKpiModal("ticket")}
              />
            </div>

            {/* 0–100 Financial Health Score card */}
            <HealthScoreCard health={health} t={t} entries={stats.entries} onOpen={() => setHealthModalOpen(true)} />
          </section>
        )}

        {/* ═══ SECTION 2: CATEGORY & PAYMENT CHANNELS ═══ */}
        {showCategories && !error && (
          <section aria-label={t("anSecCategories")} className="space-y-3">
            {section === "all" && <SectionHead Icon={PieChart} label={t("anHeadCategories")} className="pt-3" />}

            {/* Segmented flip breakdown: Categories → Payment → Income */}
            <BreakdownFlipCard
              t={t}
              fmt={fmt}
              view={view}
              availableViews={availableViews}
              onNextView={nextView}
              slices={slicesForView}
              paymentRows={paymentRows}
              selectedCat={selectedCat}
              onSelectCat={(c) => setSelectedCat((cur) => (cur === c ? null : c))}
              drawerRows={drawerRows}
              drawerTotal={selectedSlice?.value ?? 0}
              drawerPct={selectedSlice?.pct ?? 0}
              conv={convert}
              displayCurrency={displayCurrency}
              onInspect={(row, amount) => {
                setInspectRow(row);
                setInspectAmount(amount);
              }}
            />

            {/* Category budget caps matrix */}
            <CapsMatrixCard
              t={t}
              fmt={fmt}
              capRows={capRows}
              totalAllocated={totalAllocated}
              daysRemaining={daysRemaining}
              expanded={capsExpanded}
              onToggleExpand={() => setCapsExpanded((v) => !v)}
              openId={openCapId}
              onToggleCat={(id) => setOpenCapId((cur) => (cur === id ? null : id))}
              displayCurrency={displayCurrency}
            />

            {/* Payment Method Breakdown */}
            {paymentRows.length > 0 && (
              <section className="panel p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <CreditCard size={18} className="shrink-0 text-primary" aria-hidden />
                    <p className="text-[15px] font-extrabold text-text">{t("anPaymentBreakdown")}</p>
                  </div>
                  <p className="shrink-0 text-[11px] text-text-muted">{tr(t("anMethodsUsed"), { n: String(paymentRows.length) })}</p>
                </div>
                <div className="mt-4 space-y-3">
                  {paymentRows.map((pm) => {
                    const MIcon = methodGlyph(pm.method);
                    return (
                      <div key={pm.method} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-text-muted" aria-hidden>
                              <MIcon size={12} />
                            </span>
                            <span className="truncate text-[13px] font-bold text-text">{pm.method}</span>
                            <span className="shrink-0 text-[11px] text-text-muted">
                              ({pm.count} {pm.count === 1 ? t("anTxSingular") : t("anTxShortPlural")})
                            </span>
                          </span>
                          <span className="numeric min-w-0 shrink truncate text-right text-[11px] font-extrabold text-primary">
                            {fmt(pm.total)} ({pm.pct}%)
                          </span>
                        </div>
                        <div className="h-[5px] overflow-hidden rounded-[2.5px]" style={{ backgroundColor: "var(--sf-track)" }}>
                          <div className="h-full rounded-[2.5px] bg-primary" style={{ width: `${pm.pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </section>
        )}

        {/* ═══ SECTION 3: BEHAVIORAL HABITS & FORECAST ═══ */}
        {showHabits && !error && (
          <section aria-label={t("anSecHabits")} className="space-y-3">
            {section === "all" && <SectionHead Icon={Activity} label={t("anHeadHabits")} className="pt-3" />}

            {/* Day-of-Week Rhythm with week navigation + flow flip */}
            <WeekRhythmCard
              t={t}
              fmt={fmt}
              week={week}
              flowType={flowType}
              onFlipFlowType={() => {
                setFlowType((p) => (p === "income" ? "expense" : "income"));
                setSelectedDayIso(null);
              }}
              onPrevWeek={() => setWeekOffset((w) => w - 1)}
              onNextWeek={() => setWeekOffset((w) => Math.min(0, w + 1))}
              onSelectDay={setSelectedDayIso}
              chartColor={chartColor}
            />

            {/* Time-of-Day Chrono Pattern */}
            <TimeOfDayCard t={t} fmt={fmt} week={week} chartColor={chartColor} />

            {/* Budget Burn Velocity & Pacing Forecast */}
            <BurnPacingCard t={t} fmt={fmt} flowType={flowType} burn={burn} budget={budget} cycleStats={cycleStats} />
          </section>
        )}
      </div>

      {/* ── KPI METRIC CALCULATION EXPLAINER MODAL ── */}
      <CenterModal open={kpiModal !== null} onClose={() => setKpiModal(null)} maxWidth={420}>
        {kpiModal && (
          <div className="space-y-4">
            <ModalHead
              iconBg={
                kpiModal === "total" || kpiModal === "velocity"
                  ? "var(--sf-tint-emerald-15)"
                  : kpiModal === "peak"
                    ? "var(--sf-tint-amber-15)"
                    : "var(--sf-tint-sky-15)"
              }
              icon={
                kpiModal === "total" ? (
                  <Wallet size={20} className="text-primary" aria-hidden />
                ) : kpiModal === "velocity" ? (
                  <Gauge size={20} className="text-primary" aria-hidden />
                ) : kpiModal === "peak" ? (
                  <Zap size={20} aria-hidden style={{ color: "var(--sf-hue-amber)" }} />
                ) : (
                  <Sparkles size={20} aria-hidden style={{ color: "var(--sf-hue-sky)" }} />
                )
              }
              title={
                kpiModal === "total"
                  ? t("anKpiTotalModalTitle")
                  : kpiModal === "velocity"
                    ? t("anKpiVelocityModalTitle")
                    : kpiModal === "peak"
                      ? t("anKpiPeakModalTitle")
                      : t("anKpiTicketModalTitle")
              }
              sub={
                kpiModal === "total"
                  ? t("anKpiTotalModalSub")
                  : kpiModal === "velocity"
                    ? t("anKpiVelocityModalSub")
                    : kpiModal === "peak"
                      ? t("anKpiPeakModalSub")
                      : t("anKpiTicketModalSub")
              }
              onClose={() => setKpiModal(null)}
            />
            <div className="space-y-2.5">
              <p className="text-[13px] leading-[18px] text-text-muted">
                {kpiModal === "total"
                  ? tr(t("anKpiTotalDef"), { cur: displayCurrency })
                  : kpiModal === "velocity"
                    ? t("anKpiVelocityDef")
                    : kpiModal === "peak"
                      ? t("anKpiPeakDef")
                      : t("anKpiTicketDef")}
              </p>
              <div className="space-y-1 rounded-xl border border-border p-3" style={{ backgroundColor: "var(--sf-surface-elevated)" }}>
                <p className="text-xs font-extrabold uppercase tracking-[0.5px] text-primary">
                  {kpiModal === "peak" ? t("anKpiPeakCalcLabel") : t("analyticsKpiHow")}
                </p>
                <p className="numeric text-[12.5px] leading-[17px] text-text">
                  {kpiModal === "total"
                    ? tr(t("anKpiTotalCalc"), { n: String(stats.entries), total: fmt(stats.spent) })
                    : kpiModal === "velocity"
                      ? tr(t("anKpiVelocityCalc"), { v: fmt(stats.dailyVelocity) })
                      : kpiModal === "peak"
                        ? peakEntry
                          ? `${fmt(peakEntry.amount)} (${peakEntry.label})`
                          : t("anKpiPeakNone")
                        : tr(t("anKpiTicketCalc"), {
                            total: fmt(stats.spent),
                            n: String(stats.expenseCount),
                            v: fmt(stats.avgTicket),
                          })}
                </p>
              </div>
              {kpiModal === "total" && spentTodayRate != null && Math.abs(spentTodayRate - stats.spent) >= 0.01 && (
                <p className="text-[11px] leading-4 text-faint">
                  {t("curAtTodayRate")}:{" "}
                  <span className="figures text-text-muted">{fmt(spentTodayRate)}</span>
                </p>
              )}
              {kpiModal === "velocity" && (
                <div className="rounded-lg p-2.5" style={{ backgroundColor: "var(--sf-tint-sky-soft)" }}>
                  <p className="text-[12px] leading-4" style={{ color: "var(--sf-hue-sky-ink)" }}>
                    <span className="inline-flex items-center gap-1 align-bottom">
                      <Lightbulb size={12} className="shrink-0" aria-hidden />
                      <span className="font-bold">{t("anKpiVelocityTipLabel")}</span>
                    </span>{" "}
                    <span className="numeric">
                      {tr(t("anKpiVelocityTip"), { v: fmt(stats.dailyVelocity), p: fmt(stats.dailyVelocity * 30) })}
                    </span>
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setKpiModal(null)}
              className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white transition active:scale-[0.99]"
            >
              {t("anGotIt")}
            </button>
          </div>
        )}
      </CenterModal>

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
              <div key={i} className="space-y-1.5 rounded-[14px] border border-border p-3" style={{ backgroundColor: "var(--sf-surface-elevated)" }}>
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
                  { txt: "90–100: A+ (Elite)", c: "var(--sf-hue-emerald)", bg: "var(--sf-tint-emerald-15)" },
                  { txt: "75–89: A (Strong)", c: "var(--sf-hue-sky)", bg: "var(--sf-tint-sky-15)" },
                  { txt: "60–74: B (Moderate)", c: "var(--sf-hue-amber)", bg: "var(--sf-tint-amber-15)" },
                  { txt: "45–59: C (Risk)", c: "var(--sf-hue-orange)", bg: "var(--sf-tint-orange-15)" },
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

      {/* ── SELECTED DAY DETAIL MODAL ── */}
      <DayDetailModal
        open={selectedDayIso !== null}
        onClose={() => setSelectedDayIso(null)}
        day={week.days.find((d) => d.iso === selectedDayIso) ?? null}
        flowType={flowType}
        chartColor={chartColor}
        fmt={fmt}
        convert={convert}
        mask={mask}
        currency={displayCurrency}
        t={t}
        onInspect={(row, amount) => {
          setSelectedDayIso(null);
          setInspectRow(row);
          setInspectAmount(amount);
        }}
      />

      {/* ── CUSTOM RANGE CALENDAR — shared mobile CalendarModal (range mode) ── */}
      <CalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        mode="range"
        initial={{ from: customFrom, to: customTo }}
        onApply={({ from, to }) => {
          if (from) {
            setCustomFrom(from);
            setCustomTo(to || from);
            setPeriod("custom");
          }
          setCalendarOpen(false);
        }}
      />

      {/* Full record sheet (mobile ExpenseDetailModal parity) */}
      <ExpenseDetailSheet
        row={inspectRow}
        amount={inspectAmount}
        displayCurrency={displayCurrency}
        onClose={() => setInspectRow(null)}
      />
    </main>
  );
}

/* ══════════════════════ shared bits ══════════════════════ */

/** {token} substitution — i18n fragments composed with live figures. */
function tr(s: string, map: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? "");
}

// Payment method glyph — Lucide only (AGENTS: emoji are data, never icons).
function methodGlyph(m: string) {
  const s = m.toLowerCase();
  if (s.includes("card")) return CreditCard;
  if (s.includes("cash")) return Banknote;
  if (s.includes("bank")) return Landmark;
  if (s.includes("upi") || s.includes("wallet") || s.includes("mobile") || s.includes("pay")) return Smartphone;
  return Coins;
}

function SectionHead({ Icon, label, className = "" }: { Icon: typeof LayoutGrid; label: string; className?: string }) {
  return (
    <div className={`mt-1 flex items-center gap-1.5 ${className}`}>
      <Icon size={16} className="shrink-0 text-primary" aria-hidden />
      <p className="text-[11px] font-extrabold uppercase tracking-[0.8px] text-primary">{label}</p>
    </div>
  );
}

/* ── In-place floating dropdown (mobile parity) ── */
function FloatingSelect({
  className = "",
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex min-h-[44px] w-full items-center justify-between gap-1 rounded-2xl border-[1.2px] bg-surface-elevated px-3.5 py-2.5 transition-colors ${
          open ? "border-primary" : "border-border"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {icon}
          <span className="truncate text-[13px] font-bold text-text">{label}</span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open ? "rotate-180 text-primary" : "text-text-muted"}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="sf-pop absolute left-0 right-0 top-[52px] z-50 space-y-[3px] rounded-2xl border-[1.2px] border-border bg-surface p-[5px] shadow-pop"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function SelectRow({
  selected,
  label,
  leading,
  onSelect,
}: {
  selected: boolean;
  label: string;
  leading?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left transition active:scale-[0.99]"
      style={{ backgroundColor: selected ? "var(--sf-select-tint)" : "transparent" }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {leading}
        <span className={`truncate text-[12.5px] ${selected ? "font-extrabold text-primary" : "font-semibold text-text"}`}>
          {label}
        </span>
      </span>
      {selected && <Check size={14} className="shrink-0 text-primary" aria-hidden />}
    </button>
  );
}

/* ── Centered modal shell matching the mobile explainers ── */
function CenterModal({
  open,
  onClose,
  children,
  maxWidth = 420,
  dim = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  dim?: boolean;
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
      className={`fixed inset-0 z-[95] flex items-center justify-center p-4 ${dim ? "bg-black/[0.72]" : "bg-black/[0.85]"}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-3xl border-[1.2px] border-border bg-surface p-5 shadow-pop"
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

/* ── KPI tile — hero variant = the primary-bordered "Total Spending" card ── */
function KpiTile({
  label,
  icon,
  value,
  sub,
  hero = false,
  labelTone = "text-text-muted",
  onClick,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  sub: ReactNode;
  hero?: boolean;
  labelTone?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={`min-w-0 space-y-1 rounded-[10px] p-3.5 ${hero ? "border-2 border-primary" : "border border-border"}`}
      style={{ backgroundColor: hero ? "var(--sf-tile-hero)" : "var(--sf-surface-elevated)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.6px] ${labelTone}`}>{label}</p>
        {icon}
      </div>
      <div className="numeric min-w-0 text-xl font-extrabold leading-6 text-text">
        <FitText basePx={20} minPx={13} title={label}>
          {value}
        </FitText>
      </div>
      <p className="min-w-0 text-[11px] text-text-muted">{sub}</p>
    </div>
  );
  if (!onClick) return <div className="min-w-0">{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="block min-w-0 w-full text-left transition active:scale-[0.98]">
      {inner}
    </button>
  );
}

/* ── Tri-flow card — mobile IncomeExpenseBudgetCard, 1:1 ── */
function TriFlowCard({
  t,
  fmt,
  income,
  spent,
  net,
  incomeCount,
  expenseCount,
  budget,
  savingsRateNum,
  expenseToIncome,
  utilization,
}: {
  t: (k: TranslationKey) => string;
  fmt: (n: number) => string;
  income: number;
  spent: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  budget: number | null;
  savingsRateNum: number;
  expenseToIncome: number;
  utilization: number;
}) {
  const healthy = net >= 0;
  const overBudget = budget != null && budget > 0 && spent > budget;
  const nearBudget = budget != null && budget > 0 && utilization >= 85 && !overBudget;
  const budgetSet = budget != null && budget > 0;

  const insight = overBudget && !healthy
    ? tr(t("triFlowInsightCritical"), { a: fmt(spent - (budget ?? 0)), b: fmt(Math.abs(net)) })
    : overBudget && healthy
      ? tr(t("triFlowInsightOverPositive"), { a: fmt(spent - (budget ?? 0)), b: fmt(net) })
      : income > 0 && !healthy
        ? tr(t("triFlowInsightDeficit"), { a: fmt(Math.abs(net)) })
        : income > 0 && healthy
          ? tr(t("triFlowInsightHealthy"), { a: fmt(net), r: String(savingsRateNum) })
          : tr(t("triFlowInsightTracking"), { a: fmt(spent), n: String(expenseCount) });

  return (
    <section className="space-y-4 rounded-[10px] border-[1.2px] border-border bg-surface p-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: "var(--sf-icon-chip)" }}
            aria-hidden
          >
            <PieChart size={18} className="text-primary" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-[-0.2px] text-text">{t("triFlowTitle")}</p>
            <p className="truncate text-[11px] text-text-muted">{t("triFlowSub")}</p>
          </div>
        </div>
        {income > 0 && (
          <span
            className="shrink-0 rounded-lg border px-2 py-[3px] text-[10.5px] font-extrabold"
            style={{
              backgroundColor: healthy ? "var(--sf-tint-success)" : "var(--sf-tint-danger)",
              borderColor: healthy ? "var(--sf-income)" : "var(--sf-hue-red)",
              color: healthy ? "var(--sf-income)" : "var(--sf-hue-red)",
            }}
          >
            {healthy ? `+${savingsRateNum}% ${t("triFlowSaved")}` : t("triFlowDeficit")}
          </span>
        )}
      </div>

      {/* telemetry tiles */}
      <div className="grid grid-cols-1 gap-2.5 min-[390px]:grid-cols-3">
        <div
          className="min-w-0 space-y-1 rounded-[10px] border p-2.5"
          style={{ backgroundColor: "var(--sf-tile-income-bg)", borderColor: "var(--sf-tile-income-border)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.5px]" style={{ color: "var(--sf-income)" }}>
              {t("triFlowIncomeTile")}
            </p>
            <ArrowDownRight size={14} aria-hidden style={{ color: "var(--sf-income)" }} />
          </div>
          <p className="numeric min-w-0 text-base font-extrabold" style={{ color: "var(--sf-income)" }} title={t("triFlowIncomeTile")}>
            <FitText basePx={16} minPx={9} title={t("triFlowIncomeTile")}>
              {fmt(income)}
            </FitText>
          </p>
          <p className="text-[10.5px] text-text-muted">
            {incomeCount} {incomeCount === 1 ? t("anEntrySingularWord") : t("anEntriesWord")}
          </p>
        </div>
        <div
          className="min-w-0 space-y-1 rounded-[10px] border p-2.5"
          style={{ backgroundColor: "var(--sf-tile-expense-bg)", borderColor: "var(--sf-tile-expense-border)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.5px] text-danger">{t("triFlowExpenseTile")}</p>
            <ArrowUpRight size={14} className="text-danger" aria-hidden />
          </div>
          <p className="numeric min-w-0 text-base font-extrabold text-text" title={t("triFlowExpenseTile")}>
            <FitText basePx={16} minPx={9} title={t("triFlowExpenseTile")}>
              {fmt(spent)}
            </FitText>
          </p>
          <p className="text-[10.5px] text-text-muted">
            {expenseCount} {expenseCount === 1 ? t("anTxSingularEntry") : t("anTxPluralEntries")}
          </p>
        </div>
        <div
          className="min-w-0 space-y-1 rounded-[10px] border p-2.5"
          style={{
            backgroundColor: "var(--sf-surface-elevated)",
            borderColor: overBudget ? "var(--sf-danger)" : "var(--sf-border)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.5px] text-text-muted">{t("triFlowBudgetTile")}</p>
            <Target size={14} className="shrink-0 text-primary" aria-hidden />
          </div>
          <p className="numeric min-w-0 text-base font-extrabold text-text" title={t("triFlowBudgetTile")}>
            <FitText basePx={16} minPx={9} title={t("triFlowBudgetTile")}>
              {budgetSet ? fmt(budget ?? 0) : t("triFlowNotSet")}
            </FitText>
          </p>
          <p className="text-[10.5px] text-text-muted">
            {budgetSet ? `${utilization}% ${t("triFlowUsed")}` : t("anTapSettings")}
          </p>
        </div>
      </div>

      {/* comparative bars */}
      <div className="space-y-3 pt-1">
        {income > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs font-bold text-text">{t("triFlowConsumption")}</p>
              <p
                className="numeric shrink-0 text-xs font-extrabold"
                style={{ color: expenseToIncome > 100 ? "var(--sf-danger)" : "var(--sf-primary)" }}
              >
                {expenseToIncome}% {t("triFlowSpent")} ({fmt(spent)})
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--sf-track)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, expenseToIncome)}%`,
                  backgroundColor:
                    expenseToIncome > 100
                      ? "var(--sf-danger)"
                      : expenseToIncome > 80
                        ? "var(--sf-warning)"
                        : "var(--sf-income)",
                }}
              />
            </div>
          </div>
        )}
        {budgetSet ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs font-bold text-text">{t("triFlowCeiling")}</p>
              <p
                className="numeric shrink-0 text-xs font-extrabold"
                style={{
                  color: overBudget ? "var(--sf-danger)" : nearBudget ? "var(--sf-warning)" : "var(--sf-primary)",
                }}
              >
                {utilization}% ({fmt(Math.max(0, (budget ?? 0) - spent))} {t("triFlowRemaining")})
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--sf-track)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, utilization)}%`,
                  backgroundColor: overBudget ? "var(--sf-danger)" : nearBudget ? "var(--sf-warning)" : "var(--sf-primary)",
                }}
              />
            </div>
          </div>
        ) : (
          <Link
            href="/profit-loss"
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-md px-2.5 py-2.5 transition active:scale-[0.99]"
            style={{ backgroundColor: "var(--sf-surface-elevated)" }}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
              <Lightbulb size={13} className="shrink-0" aria-hidden />
              <span className="truncate">{t("triFlowSetHint")}</span>
            </span>
            <span className="shrink-0 text-xs font-extrabold text-primary">{t("triFlowSetCta")}</span>
          </Link>
        )}
      </div>

      {/* smart insight pill */}
      <div
        className="flex items-center gap-2 rounded-[10px] p-2.5"
        style={{
          backgroundColor: overBudget
            ? "var(--sf-tile-expense-bg)"
            : income > 0 && healthy
              ? "var(--sf-tile-income-bg)"
              : "var(--sf-icon-chip)",
        }}
      >
        {overBudget ? (
          <TrendingUp size={16} className="shrink-0 text-danger" aria-hidden />
        ) : income > 0 && healthy ? (
          <TrendingDown size={16} className="shrink-0" style={{ color: "var(--sf-income)" }} aria-hidden />
        ) : (
          <Zap size={16} className="shrink-0 text-primary" aria-hidden />
        )}
        <p
          className="min-w-0 text-[11.5px] leading-4"
          style={{
            color: overBudget
              ? "var(--sf-danger)"
              : income > 0 && !healthy
                ? "var(--sf-danger)"
                : income > 0
                  ? "var(--sf-income)"
                  : "var(--sf-text)",
          }}
        >
          {insight}
        </p>
      </div>
    </section>
  );
}

/* ── Financial Health Score card — mobile FinancialHealthScoreCard ── */
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
  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (health.score / 100) * circumference;

  return (
    <section className="space-y-3 rounded-[10px] border border-border bg-surface p-4">
      {/* header */}
      <div className="flex items-center justify-between gap-2">
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
        <span className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg width={96} height={96} viewBox="0 0 96 96" aria-hidden>
            <defs>
              <linearGradient id="sf-health-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={health.color} stopOpacity="1" />
                <stop offset="100%" stopColor="var(--sf-primary)" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <circle cx={48} cy={48} r={radius} stroke="var(--sf-track-2)" strokeWidth={strokeWidth} fill="transparent" />
            <circle
              cx={48}
              cy={48}
              r={radius}
              stroke="url(#sf-health-grad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              fill="transparent"
              transform="rotate(-90 48 48)"
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="numeric text-2xl font-bold" style={{ color: health.color }}>
              {health.score}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-text-muted">{t("anScoreWord")}</span>
          </span>
        </span>
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
              <span className="block truncate text-[14.5px] font-semibold text-text">{health.status}</span>
              <span className="block truncate text-[11px] text-text-muted">{tr(t("anCalcAcross"), { n: String(entries) })}</span>
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
        <p className="text-[10px] font-bold uppercase tracking-[0.6px] text-text-muted">{t("anDiagnostics")}</p>
        {health.insights.map((ins, i) => {
          const isWarn = ins.tone === "warning";
          return (
            <button
              key={i}
              type="button"
              onClick={onOpen}
              className="flex w-full items-start gap-2.5 rounded-[10px] border border-border p-2.5 text-left transition active:scale-[0.99]"
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

/* ── Category/Payment/Income flip card — mobile CategoryBreakdown ── */
function BreakdownFlipCard({
  t,
  fmt,
  view,
  availableViews,
  onNextView,
  slices,
  paymentRows,
  selectedCat,
  onSelectCat,
  drawerRows,
  drawerTotal,
  drawerPct,
  conv,
  displayCurrency,
  onInspect,
}: {
  t: (k: TranslationKey) => string;
  fmt: (n: number) => string;
  view: BreakdownView;
  availableViews: BreakdownView[];
  onNextView: () => void;
  slices: { label: string; value: number; color: string; icon?: string | null; pct: number }[];
  paymentRows: { method: string; total: number; count: number; pct: number }[];
  selectedCat: string | null;
  onSelectCat: (c: string | null) => void;
  drawerRows: ExpenseRow[];
  drawerTotal: number;
  drawerPct: number;
  conv: (r: ExpenseRow) => number;
  displayCurrency: string;
  onInspect: (row: ExpenseRow, amount: string) => void;
}) {
  const viewLabel: Record<BreakdownView, string> = {
    expense: t("anCatBreakdown"),
    payment: t("anPaymentBreakdown"),
    income: t("anIncomeStreams"),
  };
  const viewWord: Record<BreakdownView, string> = {
    expense: t("anViewCategories"),
    payment: t("anViewPayment"),
    income: t("anViewIncome"),
  };
  const next = availableViews[(availableViews.indexOf(view) + 1) % availableViews.length];
  const sliceTotal = slices.reduce((s, x) => s + x.value, 0);

  return (
    <section className="rounded-[10px] border border-border bg-surface p-3.5">
      <div key={view} className="sf-flip-in space-y-2.5">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {view === "payment" && <CreditCard size={16} className="shrink-0 text-primary" aria-hidden />}
            <span className="text-sm font-extrabold text-text">{viewLabel[view]}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {availableViews.length >= 2 && (
              <button
                type="button"
                onClick={onNextView}
                className="flex min-h-[32px] items-center gap-1 rounded-xl border-[1.2px] border-primary px-2 py-1 transition active:scale-[0.97]"
                style={{ backgroundColor: "var(--sf-chip-tint)" }}
              >
                <RefreshCw size={12} className="text-primary" aria-hidden />
                <span className="text-[11px] font-extrabold text-primary">{viewWord[next]}</span>
              </button>
            )}
            {selectedCat && view !== "payment" && (
              <button
                type="button"
                onClick={() => onSelectCat(null)}
                className="flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-[7px] py-[2px] transition active:scale-[0.97]"
              >
                <span className="text-[10.5px] font-bold text-primary">{selectedCat}</span>
                <X size={10} className="text-primary" aria-hidden />
              </button>
            )}
          </span>
        </div>

        {view === "payment" ? (
          <div className="space-y-3">
            {paymentRows.map((pm) => (
              <div key={pm.method} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-text">
                    <span className="truncate">{pm.method}</span>
                    <span className="shrink-0 text-[11px] font-normal text-text-muted">
                      ({pm.count} {pm.count === 1 ? t("anTxSingular") : t("anTxShortPlural")})
                    </span>
                  </span>
                  <span className="numeric shrink-0 text-right text-[11px] font-extrabold text-primary">
                    {fmt(pm.total)} ({pm.pct}%)
                  </span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-[2.5px]" style={{ backgroundColor: "var(--sf-track)" }}>
                  <div className="h-full rounded-[2.5px] bg-primary" style={{ width: `${pm.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : sliceTotal === 0 ? (
          <p className="py-1 text-xs text-text-muted">{t("anNoCategoryData")}</p>
        ) : (
          <>
            {/* compact category rows */}
            <div className="space-y-1">
              {slices.map((item) => {
                const isSelected = selectedCat === item.label;
                const G = item.icon ? categoryGlyph(item.icon) : null;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onSelectCat(isSelected ? null : item.label)}
                    className="w-full space-y-1 rounded-md px-1.5 py-[3px] text-left transition"
                    style={{ backgroundColor: isSelected ? "var(--sf-chip-tint)" : "transparent" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                        {G && <G size={14} aria-hidden style={{ color: item.color }} />}
                        <span className={`truncate text-[12.5px] ${isSelected ? "font-extrabold" : "font-semibold"} text-text`}>
                          {item.label}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="numeric text-[12.5px] font-bold text-text">{fmt(item.value)}</span>
                        <span
                          className="rounded-[4px] px-[5px] py-px text-[10px] font-extrabold"
                          style={{
                            backgroundColor: isSelected ? "var(--sf-primary)" : "var(--sf-track)",
                            color: isSelected ? "#FFFFFF" : "var(--sf-text-muted)",
                          }}
                        >
                          {item.pct}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-sm" style={{ backgroundColor: "var(--sf-track)" }}>
                      <div className="h-full rounded-sm" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* on-click transactions drawer */}
            {selectedCat && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex min-w-0 items-center gap-1.5">
                      {(() => {
                        const icon = drawerRows[0]?.categories?.icon ?? slices.find((s) => s.label === selectedCat)?.icon;
                        const G = icon ? categoryGlyph(icon) : null;
                        return G ? <G size={16} aria-hidden style={{ color: "var(--sf-primary)" }} /> : null;
                      })()}
                      <span className="truncate text-sm font-extrabold text-text">{selectedCat}</span>
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {drawerRows.length} {drawerRows.length === 1 ? t("anTxSingularEntry") : t("anTxPluralEntries")} · {drawerPct}% {t("anOfTotal")}
                    </p>
                  </div>
                  <p className="numeric shrink-0 text-base font-extrabold text-primary">{fmt(drawerTotal)}</p>
                </div>
                <div className="space-y-1">
                  {drawerRows.map((e) => {
                    const isFx = !!e.currency && e.currency !== displayCurrency;
                    const converted = fmt(conv(e));
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => onInspect(e, converted)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2.5 text-left transition active:scale-[0.99]"
                        style={{ backgroundColor: "var(--sf-surface-elevated)" }}
                      >
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="block truncate text-[13px] font-semibold text-text">
                            {e.description || e.categories?.name || t("flowExpenses")}
                          </span>
                          <span className="block truncate text-[11px] text-text-muted">
                            {e.date}
                            {e.time ? ` · ${e.time.slice(0, 5)}` : ""} · {e.payment_method}
                          </span>
                        </span>
                        <span className="shrink-0 space-y-0.5 text-right">
                          <span className="numeric block text-sm font-extrabold text-text">{converted}</span>
                          {isFx && (
                            <span className="numeric block text-[10px] font-semibold text-text-muted">
                              ({formatMoney(Number(e.amount), e.currency || displayCurrency)})
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ── Category budget caps matrix — mobile BudgetProgress ── */
function CapsMatrixCard({
  t,
  fmt,
  capRows,
  totalAllocated,
  daysRemaining,
  expanded,
  onToggleExpand,
  openId,
  onToggleCat,
  displayCurrency,
}: {
  t: (k: TranslationKey) => string;
  fmt: (n: number) => string;
  capRows: {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    cap: number;
    spent: number;
    pct: number;
    count: number;
    txns: ExpenseRow[];
  }[];
  totalAllocated: number;
  daysRemaining: number;
  expanded: boolean;
  onToggleExpand: () => void;
  openId: string | null;
  onToggleCat: (id: string) => void;
  displayCurrency: string;
}) {
  const visible = expanded ? capRows : capRows.slice(0, 2);

  return (
    <section className="space-y-3 rounded-[10px] border border-border bg-surface p-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: "var(--sf-chip-tint)" }}
            aria-hidden
          >
            <Target size={18} className="text-primary" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-text">{t("anCapsTitle")}</p>
            <p className="truncate text-[11px] text-text-muted">
              {capRows.length > 0 ? tr(t("anActiveCaps"), { n: String(capRows.length), total: fmt(totalAllocated) }) : t("anNoCapsShort")}
            </p>
          </div>
        </div>
        <Link
          href="/categories"
          className="flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border border-primary px-2.5 py-[5px] transition active:scale-[0.97]"
          style={{ backgroundColor: "var(--sf-chip-tint)" }}
        >
          <Settings size={12} className="text-primary" aria-hidden />
          <span className="text-[11px] font-extrabold text-primary">{t("anAdjustCaps")}</span>
        </Link>
      </div>

      {capRows.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-border p-4 text-center"
          style={{ backgroundColor: "var(--sf-surface-elevated)" }}
        >
          <Target size={24} className="text-primary" aria-hidden />
          <p className="text-[13px] font-bold text-text">{t("anNoCapsTitle")}</p>
          <p className="text-[11px] leading-[15px] text-text-muted">{t("anNoCapsSub")}</p>
          <Link
            href="/categories"
            className="mt-1 flex min-h-[36px] items-center gap-1.5 rounded-full bg-primary px-3.5 py-[7px] text-xs font-extrabold text-white transition active:scale-[0.97]"
          >
            <Plus size={14} aria-hidden />
            {t("anSetCapsBtn")}
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((c) => {
            const isOver = c.cap > 0 && c.spent > c.cap;
            const isWarning = c.pct >= 80 && !isOver;
            const statusColor = isOver ? "var(--sf-danger)" : isWarning ? "var(--sf-hue-amber)" : c.color || "var(--sf-primary)";
            const StatusIcon = isOver ? ShieldAlert : isWarning ? AlertTriangle : ShieldCheck;
            const remaining = Math.max(0, c.cap - c.spent);
            const safePace = Math.round(remaining / daysRemaining);
            const isOpen = openId === c.id;
            const G = c.icon ? categoryGlyph(c.icon) : null;
            return (
              <div
                key={c.id}
                className="space-y-2 rounded-[10px] border p-3"
                style={{
                  backgroundColor: "var(--sf-surface-elevated)",
                  borderColor: isOver ? "var(--sf-tile-expense-border)" : "var(--sf-border)",
                }}
              >
                <button type="button" onClick={() => onToggleCat(c.id)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: "var(--sf-track)" }}
                      aria-hidden
                    >
                      {G ? <G size={16} style={{ color: statusColor }} /> : <span className="text-xs font-bold text-text-muted">{c.name.slice(0, 1)}</span>}
                    </span>
                    <span className="min-w-0 flex-1 space-y-px">
                      <span className="block truncate text-[13px] font-extrabold text-text">{c.name}</span>
                      <span className="block truncate text-[10px] text-text-muted">{tr(t("anTxThisMonth"), { n: String(c.count) })}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-[2.5px]"
                      style={{
                        backgroundColor: isOver ? "var(--sf-tint-red-15)" : isWarning ? "var(--sf-tint-amber-15)" : "var(--sf-tint-emerald-15)",
                      }}
                    >
                      <StatusIcon size={11} aria-hidden style={{ color: statusColor }} />
                      <span className="numeric text-[10px] font-extrabold" style={{ color: statusColor }}>
                        {c.pct}%
                      </span>
                    </span>
                    <ChevronDown size={16} className={`text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </span>
                </button>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="flex min-w-0 items-baseline gap-1">
                    <span className="numeric shrink-0 text-base font-black" style={{ color: isOver ? "var(--sf-danger)" : "var(--sf-text)" }}>
                      {fmt(c.spent)}
                    </span>
                    <span className="min-w-0 text-[11px] text-text-muted">
                      {t("anSpentOf")} {fmt(c.cap)}
                    </span>
                  </p>
                  <span className="numeric shrink-0 text-[11px] font-extrabold" style={{ color: isOver ? "var(--sf-danger)" : "var(--sf-primary)" }}>
                    {isOver ? `+${fmt(c.spent - c.cap)} ${t("anOverSuffix")}` : `${fmt(remaining)} ${t("anLeft")}`}
                  </span>
                </div>

                <div className="h-[7px] overflow-hidden rounded-[3.5px]" style={{ backgroundColor: "var(--sf-track)" }}>
                  <div className="h-full rounded-[3.5px] transition-all" style={{ width: `${Math.min(c.pct, 100)}%`, backgroundColor: statusColor }} />
                </div>

                {!isOver && remaining > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[10px] text-text-muted">
                      {t("anSafePace")}{" "}
                      <span className="numeric font-bold text-text">
                        {fmt(safePace)}
                        {t("anPerDay")}
                      </span>{" "}
                      ({tr(t("anDaysLeftShort"), { n: String(daysRemaining) })})
                    </p>
                    <p className="numeric shrink-0 text-[10px] text-text-muted">
                      {c.cap > 0 ? Math.round((remaining / c.cap) * 100) : 0}% {t("anRemainingWord")}
                    </p>
                  </div>
                ) : isOver ? (
                  <p className="flex items-center gap-1 text-[10px] font-bold text-danger">
                    <AlertTriangle size={10} className="shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{tr(t("anPassedCeiling"), { amt: fmt(c.cap) })}</span>
                  </p>
                ) : null}

                {isOpen && (
                  <div className="space-y-1 border-t border-border pt-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.5px] text-text-muted">
                      {tr(t("anCatOutflows"), { c: c.name, n: String(c.count) })}
                    </p>
                    {c.count === 0 ? (
                      <p className="py-1 text-[11px] italic text-text-muted">{t("anNoPeriodTx")}</p>
                    ) : (
                      c.txns.slice(0, 4).map((item) => (
                        <div key={item.id} className="flex min-h-[40px] items-center justify-between gap-2 rounded-md bg-background px-1.5 py-1">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-text">{item.description || c.name}</span>
                            <span className="block truncate text-[9px] text-text-muted">
                              {item.date}
                              {item.time ? ` · ${item.time.slice(0, 5)}` : ""}
                            </span>
                          </span>
                          {/* mobile parity: raw entry in its stored currency */}
                          <span className="numeric shrink-0 text-xs font-extrabold text-text">
                            {formatMoney(Number(item.amount), item.currency || displayCurrency)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {capRows.length > 2 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] border border-border transition active:scale-[0.99]"
              style={{ backgroundColor: "var(--sf-surface-elevated)" }}
            >
              {expanded ? <ChevronUp size={14} className="text-primary" aria-hidden /> : <ChevronDown size={14} className="text-primary" aria-hidden />}
              <span className="text-[11px] font-extrabold text-primary">
                {expanded ? t("anShowLess") : `${t("anRollOut")} (${capRows.length})`}
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Day-of-Week rhythm — mobile FinancialInsights card 1 ── */
function WeekRhythmCard({
  t,
  fmt,
  week,
  flowType,
  onFlipFlowType,
  onPrevWeek,
  onNextWeek,
  onSelectDay,
  chartColor,
}: {
  t: (k: TranslationKey) => string;
  fmt: (n: number) => string;
  week: {
    weekLabel: string;
    isCurrentWeek: boolean;
    days: { iso: string; name: string; full: string; total: number; count: number; entries: ExpenseRow[] }[];
    maxDaySpend: number;
    peakDay: { name: string } | null;
    peakDayPct: number;
    total: number;
    items: ExpenseRow[];
    hasIncome: boolean;
  };
  flowType: "expense" | "income";
  onFlipFlowType: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onSelectDay: (iso: string) => void;
  chartColor: string;
}) {
  const flowInk = flowType === "income" ? "var(--sf-hue-emerald-600)" : "var(--sf-danger)";
  const flowBg = flowType === "income" ? "var(--sf-primary-light)" : "var(--sf-rust-tint)";

  return (
    <section key={flowType} className="sf-flip-in space-y-3 rounded-[10px] border border-border bg-surface p-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <Calendar size={17} aria-hidden style={{ color: chartColor }} />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-text">{t("anRhythmTitle")}</span>
            <span className="block truncate text-[10.5px] text-text-muted">{week.weekLabel}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-[5px]">
          {week.hasIncome && (
            <button
              type="button"
              onClick={onFlipFlowType}
              className="flex min-h-[32px] items-center gap-1 rounded-xl border-[1.2px] px-2 py-1 transition active:scale-[0.97]"
              style={{ backgroundColor: flowBg, borderColor: flowInk }}
            >
              <RefreshCw size={12} aria-hidden style={{ color: flowInk }} />
              <span className="text-[11px] font-extrabold" style={{ color: flowInk }}>
                {flowType === "income" ? t("flowIncome") : t("flowExpenses")}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onPrevWeek}
            aria-label={t("anPrevWeek")}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border transition active:scale-90"
            style={{ backgroundColor: "var(--sf-surface-elevated)" }}
          >
            <ChevronLeft size={13} aria-hidden style={{ color: chartColor }} />
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            disabled={week.isCurrentWeek}
            aria-label={t("anNextWeek")}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-25"
            style={{
              backgroundColor: week.isCurrentWeek ? "transparent" : "var(--sf-surface-elevated)",
              borderColor: week.isCurrentWeek ? "transparent" : "var(--sf-border)",
            }}
          >
            {week.isCurrentWeek ? (
              <ChevronRight size={13} className="text-text-muted" aria-hidden />
            ) : (
              <ChevronRight size={13} aria-hidden style={{ color: chartColor }} />
            )}
          </button>
        </span>
      </div>

      {/* weekly total + peak pill */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-bold text-text">
          {flowType === "income" ? t("anWeeklyInflow") : t("anWeeklyTotal")}{" "}
          <span className="numeric font-extrabold" style={{ color: chartColor }}>
            {flowType === "income" ? "+" : ""}
            {fmt(week.total)}
          </span>
        </p>
        {week.peakDay && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-[7px] py-[2px]"
            style={{ backgroundColor: flowType === "income" ? "var(--sf-tint-emerald-15)" : "var(--sf-tint-amber-15)" }}
          >
            <Flame size={11} aria-hidden style={{ color: flowType === "income" ? "var(--sf-income)" : "var(--sf-hue-amber)" }} />
            <span
              className="text-[10.5px] font-extrabold"
              style={{ color: flowType === "income" ? "var(--sf-income)" : "var(--sf-hue-amber)" }}
            >
              {tr(t("anPeakPill"), { d: week.peakDay.name, p: String(week.peakDayPct) })}
            </span>
          </span>
        )}
      </div>

      {week.items.length === 0 ? (
        <p className="py-5 text-center text-xs italic text-text-muted">
          {flowType === "income" ? t("anNoWeekIncome") : t("anNoWeekExpenses")}
        </p>
      ) : (
        /* 7-day vertical bars */
        <div className="flex items-end justify-between gap-1 pb-1.5 pt-2">
          {week.days.map((day) => {
            const isPeak = week.peakDay?.name === day.name && day.total > 0;
            const hasSpend = day.total > 0;
            const barHeight = Math.max(8, Math.round((day.total / week.maxDaySpend) * 65));
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => onSelectDay(day.iso)}
                aria-label={`${day.full}: ${fmt(day.total)}`}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 transition active:scale-[0.95]"
              >
                <span className="flex h-4 w-full items-center justify-center">
                  {hasSpend ? (
                    <span className="numeric max-w-full truncate text-[9.5px] font-bold" style={{ color: isPeak ? chartColor : "var(--sf-text)" }}>
                      {compactMoney(day.total)}
                    </span>
                  ) : (
                    <span className="text-[9px] text-text-muted opacity-35">-</span>
                  )}
                </span>
                <span className="flex h-[65px] w-full items-end justify-center">
                  <span
                    className="w-[22px] rounded-md transition-all"
                    style={{
                      height: barHeight,
                      backgroundColor: isPeak
                        ? chartColor
                        : hasSpend
                          ? flowType === "income"
                            ? "var(--sf-bar-income)"
                            : "var(--sf-bar-expense)"
                          : "var(--sf-track-2)",
                    }}
                  />
                </span>
                <span className="flex h-5 w-full items-center justify-center">
                  <span
                    className="text-[11px]"
                    style={{
                      fontWeight: isPeak || hasSpend ? 700 : 600,
                      color: isPeak ? chartColor : hasSpend ? "var(--sf-text)" : "var(--sf-text-muted)",
                    }}
                  >
                    {day.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── Time-of-Day chrono pattern — mobile FinancialInsights card 2 ── */
function TimeOfDayCard({
  t,
  fmt,
  week,
  chartColor,
}: {
  t: (k: TranslationKey) => string;
  fmt: (n: number) => string;
  week: {
    weekLabel: string;
    quadrants: { key: string; label: string; hours: string; total: number; count: number; color: string; pct: number }[];
    peakQuadrant: { label: string } | null;
  };
  chartColor: string;
}) {
  const chronoIcons = [Sunrise, Sun, Sunset, Moon];
  return (
    <section className="space-y-3 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <Clock size={18} aria-hidden style={{ color: chartColor }} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold text-text">{t("anTimePatternTitle")}</span>
            <span className="block truncate text-[10.5px] text-text-muted">{tr(t("anChronoSub"), { w: week.weekLabel })}</span>
          </span>
        </span>
        {week.peakQuadrant && (
          <span className="shrink-0 text-[11px] text-text-muted">
            {t("anPrime")} <span className="font-bold text-text">{week.peakQuadrant.label}</span>
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {week.quadrants.map((q, i) => {
          const Icon = chronoIcons[i];
          return (
            <div key={q.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon size={14} aria-hidden style={{ color: q.color }} />
                  <span className="truncate text-xs font-semibold text-text">{q.label}</span>
                  <span className="numeric hidden shrink-0 text-[10px] text-text-muted sm:inline">({q.hours})</span>
                </span>
                <span className="numeric shrink-0 text-[11px] font-bold" style={{ color: chartColor }}>
                  {fmt(q.total)} ({q.pct}%)
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-sm" style={{ backgroundColor: "var(--sf-track)" }}>
                <div className="h-full rounded-sm transition-all" style={{ width: `${q.pct}%`, backgroundColor: q.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Budget burn & pacing forecast — mobile BudgetAnalyticsCard ── */
function BurnPacingCard({
  t,
  fmt,
  flowType,
  burn,
  budget,
  cycleStats,
}: {
  t: (k: TranslationKey) => string;
  fmt: (n: number) => string;
  flowType: "expense" | "income";
  burn: {
    isBudgetSet: boolean;
    dailyAllowance: number;
    actualPace: number;
    projected: number;
    isOver: boolean;
    isHighBurn: boolean;
    projectedPct: number;
    incomeDailyPace: number;
    projectedIncome: number;
  };
  budget: number | null;
  cycleStats: { spent: number; income: number; daysElapsed: number; daysTotal: number };
}) {
  const isIncome = flowType === "income";
  const bad = !isIncome && (burn.isOver || burn.isHighBurn);
  return (
    <section key={flowType} className="sf-flip-in space-y-3 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <PieChart size={20} className={isIncome ? "text-success" : "text-primary"} aria-hidden />
        <span className="min-w-0 truncate text-lg font-bold text-text">
          {isIncome ? t("anIncomePerfTitle") : t("anBudgetPerf")}
        </span>
      </div>

      {!isIncome && !burn.isBudgetSet ? (
        <div className="flex flex-col items-center gap-2 rounded-[10px] p-4 text-center" style={{ backgroundColor: "var(--sf-surface-elevated)" }}>
          <p className="text-sm text-text-muted">{t("anSetBudgetPrompt")}</p>
          <Link
            href="/profit-loss"
            className="mt-0.5 flex min-h-[40px] items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-bold text-white transition active:scale-[0.97]"
          >
            <Settings size={13} aria-hidden />
            {t("anSetBudgetBtn")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
            <div className="min-w-0 space-y-1 rounded-[10px] p-3" style={{ backgroundColor: "var(--sf-surface-elevated)" }}>
              <p className="text-[11px] text-text-muted">{isIncome ? t("anMonthlyIncomeTile") : t("anDailyTargetTile")}</p>
              <p className="numeric min-w-0 text-base font-bold" style={{ color: isIncome ? "var(--sf-success)" : "var(--sf-primary)" }}>
                <FitText basePx={16} minPx={10}>
                  {fmt(isIncome ? cycleStats.income : burn.dailyAllowance)}
                  {!isIncome && <span className="text-[11px] font-normal text-text-muted">{t("anPerDay")}</span>}
                </FitText>
              </p>
            </div>
            <div className="min-w-0 space-y-1 rounded-[10px] p-3" style={{ backgroundColor: "var(--sf-surface-elevated)" }}>
              <p className="text-[11px] text-text-muted">{isIncome ? t("anAvgDailyIncomeTile") : t("anActualPaceTile")}</p>
              <p
                className="numeric min-w-0 text-base font-bold"
                style={{ color: isIncome ? "var(--sf-success)" : burn.isHighBurn ? "var(--sf-danger)" : "var(--sf-success)" }}
              >
                <FitText basePx={16} minPx={10}>
                  {fmt(isIncome ? burn.incomeDailyPace : burn.actualPace)}
                  <span className="text-[11px] font-normal text-text-muted">{t("anPerDay")}</span>
                </FitText>
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-2.5 rounded-[10px] border p-3"
            style={{
              backgroundColor: bad ? "var(--sf-tint-danger)" : "var(--sf-tint-success)",
              borderColor: bad ? "var(--sf-danger)" : "var(--sf-success)",
            }}
          >
            {bad ? (
              <TrendingUp size={22} className="shrink-0 text-danger" aria-hidden />
            ) : (
              <TrendingDown size={22} className="shrink-0 text-success" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold" style={{ color: bad ? "var(--sf-danger)" : "var(--sf-success)" }}>
                {isIncome ? t("anIncomeProjectionTitle") : burn.isOver ? t("anExceededTitle") : burn.isHighBurn ? t("anHighPaceTitle") : t("anOnTrackTitle")}
              </p>
              <p className="numeric mt-0.5 text-[11px] text-text-muted">
                {isIncome
                  ? `${t("anProjectedThisMonth")}: ${fmt(burn.projectedIncome)}`
                  : burn.isOver
                    ? tr(t("anExceededBy"), { amt: fmt(Math.max(0, cycleStats.spent - (budget ?? 0))) })
                    : `${t("anProjectedSpend")}: ${fmt(burn.projected)} (${burn.projectedPct}%)`}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Day detail modal — mobile FinancialInsights day sheet ── */
function DayDetailModal({
  open,
  onClose,
  day,
  flowType,
  chartColor,
  fmt,
  convert,
  mask,
  currency,
  t,
  onInspect,
}: {
  open: boolean;
  onClose: () => void;
  day: { iso: string; full: string; total: number; count: number; entries: ExpenseRow[] } | null;
  flowType: "expense" | "income";
  chartColor: string;
  fmt: (n: number) => string;
  convert: (r: ExpenseRow) => number;
  mask: (s: string) => string;
  currency: string;
  t: (k: TranslationKey) => string;
  onInspect: (row: ExpenseRow, amount: string) => void;
}) {
  return (
    <CenterModal open={open && day !== null} onClose={onClose} maxWidth={420} dim={false}>
      {day && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-lg font-bold text-text">
                {day.full} {flowType === "income" ? t("flowIncome") : t("flowExpenses")}
              </p>
              <p className="numeric truncate text-[11px] font-bold" style={{ color: chartColor }}>
                {fmt(day.total)} · {day.count} {day.count === 1 ? t("anEntrySingularWord") : t("anEntriesWord")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated active:scale-95"
            >
              <X size={15} className="text-text" aria-hidden />
            </button>
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {day.entries.map((e) => {
              const G = e.categories?.icon ? categoryGlyph(e.categories.icon) : null;
              const amount = mask(formatMoney(convert(e), currency));
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onInspect(e, amount)}
                  className="flex min-h-[48px] w-full items-center gap-2 border-b border-border py-2.5 text-left last:border-0"
                >
                  {G ? <G size={20} className="shrink-0 text-primary" aria-hidden /> : <span className="h-5 w-5 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-[13px] font-bold text-text">
                      {e.description || e.categories?.name || (flowType === "income" ? t("flowIncome") : t("flowExpenses"))}
                    </span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {e.date} · {e.payment_method || "Cash"}
                    </span>
                  </span>
                  <span className="numeric shrink-0 text-right text-[13px] font-extrabold" style={{ color: chartColor }}>
                    {flowType === "income" ? "+" : ""}
                    {amount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </CenterModal>
  );
}

/* compact figure labels for the rhythm bars (mobile compactMoney parity) */
function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}
