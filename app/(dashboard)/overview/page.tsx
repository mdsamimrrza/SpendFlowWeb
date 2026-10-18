"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Layers,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { cacheExpenses, getCachedExpenses, listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { AccountsStrip } from "@/components/dash/AccountsStrip";
import { BalanceCard } from "@/components/dash/BalanceCard";
import { Upcoming } from "@/components/dash/Upcoming";
import { BillsDue } from "@/components/dash/BillsDue";
import { Feed } from "@/components/dash/Feed";
import { MixCard } from "@/components/dash/MixCard";
import {
  CardPillLink,
  DashCard,
  DeltaChip,
  RangeChip,
} from "@/components/dash/primitives";
import type { FlowPoint } from "@/components/graphs/FlowChart";
import { CashFlowCard } from "@/components/dash/CashFlowCard";
import type { DonutSlice } from "@/components/dash/MixCard";
import { HeatGrid } from "@/components/graphs/HeatGrid";
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import { CalendarModal } from "@/components/ui/CalendarModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import type { ExpenseRow } from "@/services/expenses";
import {
  formatMoney,
  getCycleWindow,
  getPreviousCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  toISODate,
  todayISO,
  formatDisplayName,
  stripCents,
} from "@/utils/format";
import { checkBudgetAlerts, checkCategoryAlerts } from "@/services/alerts";
import { useToast } from "@/store/ToastContext";
import { useBudget } from "@/hooks/useRates";

type FlowRange = "1d" | "1w" | "1m" | "cycle" | "1y" | "custom";

/**
 * Home – V5 "Sage Ledger" rebuild (2026-10-13): the reference dashboard's
 * composition – a row of pastel-chip stat cards (income / expenses / net /
 * today / safe-to-spend), then the cash-flow + mix donut pair, the recent
 * register beside upcoming payments, and the calendar + accounts pair
 * (the budget pacing card was removed by user direction – budget state
 * lives on in the Safe-to-spend stat card and the reports). All
 * aggregation mirrors the mobile statement logic (cycle-scoped totals,
 * FX-converted rows, previous-cycle delta).
 */
export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { t, locale } = useLanguage();
  // Full-dataset fetch: cycle totals must include EVERY entry in the window
  // (paginating at 15 dropped the oldest rows – e.g. the Aug 31 salary).
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [selected, setSelected] = useState<ExpenseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { convert, convertFrozen } = useRowConverter(profile?.preferred_currency, rows);
  const { categories } = useCategories(user?.id);
  const supabase = getSupabaseBrowserClient();
  const [range, setRange] = useState<FlowRange>("cycle");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  // Instant cache paint so mobile & slow-network never stays on skeleton if we have past data
  useEffect(() => {
    if (!user) return;
    const cached = getCachedExpenses(user.id);
    if (cached.length > 0) {
      setRows(cached);
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    // Safety timeout: ensure loading resolves even if network is stalled or slow
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 2500);

    const load = async () => {
      try {
        const { rows: fresh } = await listExpenses(
          supabase,
          user.id,
          0,
          {},
          { field: "date", direction: "desc" },
          5000,
        );
        if (!cancelled) {
          setRows(fresh);
          cacheExpenses(user.id, fresh);
        }
      } catch (err) {
        console.error("Failed to load expenses:", err);
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
  }, [user, supabase]);
  const budget = useBudget();

  // Rail calendar month (local view state only – prev/next shifts the grid,
  // never the data). Next is capped at the current month.
  const [calYm, setCalYm] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  // Overview scale: whole-rupee figures (cents stay on the registers).
  // Privacy masking is global now: html.sf-privacy blurs .numeric figures.
  const fmt = useMemo(
    () => (n: number) => stripCents(formatMoney(n, displayCurrency, locale)),
    [displayCurrency, locale],
  );
  const tickFmt = useMemo(
    () => (n: number) =>
      new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n),
    [locale],
  );
  // Axis formatter for the cash-flow chart: full grouped numerals (40,000 –
  // user direction, no "40K" shorthand on the chart).
  const axisFmt = useMemo(
    () => (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n),
    [locale],
  );

  const cycle = useMemo(
    () =>
      getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );

  const stats = useMemo(() => {
    const startISO = toISODate(cycle.start);
    const endISO = toISODate(cycle.end);
    const todayStr = todayISO();
    let spent = 0;
    let income = 0;
    let todayTotal = 0;
    const spentRows: ExpenseRow[] = [];
    const incomeRows: ExpenseRow[] = [];
    for (const row of rows) {
      if (row.date < startISO || row.date > endISO) continue;
      const converted = convert(row);
      if (row.type === "income") {
        income += converted;
        incomeRows.push(row);
      } else {
        spent += converted;
        spentRows.push(row);
        if (row.date === todayStr) todayTotal += converted;
      }
    }
    return { spent, income, todayTotal, net: income - spent, spentRows, incomeRows };
  }, [rows, cycle, convert]);

  // "At transaction-date rates" counterpart of the hero totals: the headline
  // is LIVE for the active cycle; this frozen pair cross-checks the
  // historical value (TodayRateLine self-hides when the two bases agree).
  const frozenTotals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const r of stats.incomeRows) inc += convertFrozen(r);
    for (const r of stats.spentRows) exp += convertFrozen(r);
    return { income: inc, expense: exp };
  }, [stats.incomeRows, stats.spentRows, convertFrozen]);

  const pace = useMemo(() => {
    const daysTotal = cycleDaysTotal(cycle);
    const daysElapsed = cycleDaysElapsed(cycle, new Date());
    const spentPct = budget && budget > 0 ? stats.spent / budget : 0;
    const expectedPct = budget && budget > 0 ? daysElapsed / daysTotal : null;
    const projected = budget != null ? (stats.spent / daysElapsed) * daysTotal : null;
    const onPace =
      budget != null && budget > 0 && projected != null ? projected <= budget : null;
    return { daysTotal, daysElapsed, spentPct, expectedPct, projected, onPace };
  }, [cycle, budget, stats.spent]);

  const prevDelta = useMemo(() => {
    // True previous cycle: the cycle that ended the day before this one
    // began (re-derived from the start/end day rule – NOT a ms-span shift).
    const prev = getPreviousCycleWindow(
      new Date(),
      profile?.cycle_start_day ?? 1,
      profile?.cycle_end_day ?? null,
    );
    const startISO = toISODate(prev.start);
    const endISO = toISODate(prev.end);
    let prevNet = 0;
    let hasRows = false;
    for (const row of rows) {
      if (row.date < startISO || row.date > endISO) continue;
      hasRows = true;
      prevNet += row.type === "income" ? convert(row) : -convert(row);
    }
    if (!hasRows) return null;
    const diff = stats.net - prevNet;
    return {
      text: `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))}`,
      positive: diff >= 0,
    };
  }, [rows, profile?.cycle_start_day, profile?.cycle_end_day, stats.net, convert, fmt]);

  const categorySlices = useMemo<DonutSlice[]>(() => {
    const byCategory = new Map<string, DonutSlice>();
    const startISO = toISODate(cycle.start);
    for (const row of rows) {
      if (row.type !== "expense" || row.date < startISO) continue;
      const name = row.categories?.name ?? "Other";
      const color = row.categories?.color ?? "var(--sf-hue-indigo)";
      const slice = byCategory.get(name) ?? { label: name, value: 0, color };
      slice.value += convert(row);
      byCategory.set(name, slice);
    }
    return Array.from(byCategory.values()).sort((a, b) => b.value - a.value);
  }, [rows, cycle, convert]);

  // Unbounded per-day outflow so the rail calendar tints months you
  // navigate back through.
  const spendByDay = useMemo<Record<string, number>>(() => {
    const byDay: Record<string, number> = {};
    for (const row of rows) {
      if (row.type !== "expense") continue;
      byDay[row.date] = (byDay[row.date] ?? 0) + convert(row);
    }
    return byDay;
  }, [rows, convert]);

  // Cash-flow buckets for the selected range: hours for 1D, per-day for
  // 1W/1M/cycle/custom, per-calendar-month for 1Y.
  const flowPointsRaw = useMemo<FlowPoint[]>(() => {
    const now = new Date();
    const todayStr = todayISO();
    const shortMonth = (d: Date) => new Intl.DateTimeFormat(locale, { month: "short" }).format(d);

    const tally = (fromISO: string, toISOStr: string) => {
      const byDay = new Map<string, { income: number; expense: number }>();
      for (const row of rows) {
        if (row.date < fromISO || row.date > toISOStr) continue;
        const bucket = byDay.get(row.date) ?? { income: 0, expense: 0 };
        const v = convert(row);
        if (row.type === "income") bucket.income += v;
        else bucket.expense += v;
        byDay.set(row.date, bucket);
      }
      return byDay;
    };

    // Per-day buckets from..to, always ending at today: a cycle or custom
    // range whose end lies in the future draws only the days that exist –
    // no empty stretch. Labels: day numbers, with the month attached when
    // the window crosses into a new month.
    const dayOut = (fromISO: string, toISOStr: string, weekdayLabels = false) => {
      if (fromISO > todayStr) return [];
      const endISO = toISOStr < todayStr ? toISOStr : todayStr;
      const byDay = tally(fromISO, endISO);
      const out: FlowPoint[] = [];
      let prevM = -1;
      for (let d = new Date(`${fromISO}T00:00:00`); toISODate(d) <= endISO; d.setDate(d.getDate() + 1)) {
        const iso = toISODate(d);
        const monthChanged = d.getMonth() !== prevM;
        const b = byDay.get(iso) ?? { income: 0, expense: 0 };
        out.push({
          label: weekdayLabels
            ? new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d)
            : monthChanged
              ? `${d.getDate()} ${shortMonth(d)}`
              : String(d.getDate()),
          ...b,
        });
        prevM = d.getMonth();
      }
      return out;
    };

    if (range === "1d") {
      // Today by hour – the mobile dashboard's "Today, by hour" treatment.
      const byHour = new Map<number, { income: number; expense: number }>();
      for (const row of rows) {
        if (row.date !== todayStr) continue;
        const h = Number((row.time ?? "00:00").slice(0, 2));
        if (Number.isNaN(h)) continue;
        const bucket = byHour.get(h) ?? { income: 0, expense: 0 };
        const v = convert(row);
        if (row.type === "income") bucket.income += v;
        else bucket.expense += v;
        byHour.set(h, bucket);
      }
      const lastH = Math.max(1, now.getHours());
      const out: FlowPoint[] = [];
      for (let h = 0; h <= lastH; h++) {
        const b = byHour.get(h) ?? { income: 0, expense: 0 };
        out.push({
          label: new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: true })
            .format(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h))
            .replace(/\s?(AM|PM)/i, (m) => m.trim().toLowerCase()),
          ...b,
        });
      }
      return out;
    }

    if (range === "1w") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return dayOut(toISODate(start), todayStr, true);
    }
    if (range === "1m") {
      // One month back from the current entry month: the 1st of the previous
      // month through today – full last month plus this month-to-date.
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return dayOut(toISODate(start), todayStr);
    }
    if (range === "cycle") {
      return dayOut(toISODate(cycle.start), toISODate(cycle.end));
    }
    if (range === "custom") {
      if (!custom) return [];
      const from = custom.from <= custom.to ? custom.from : custom.to;
      const to = custom.from <= custom.to ? custom.to : custom.from;
      const days =
        (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000;
      if (days <= 62) return dayOut(from, to);
      // Long custom spans collapse to calendar months.
      const byMonth = new Map<string, { income: number; expense: number }>();
      for (const row of rows) {
        if (row.date < from || row.date > to) continue;
        const key = `${row.date.slice(0, 7)}`;
        const bucket = byMonth.get(key) ?? { income: 0, expense: 0 };
        const v = convert(row);
        if (row.type === "income") bucket.income += v;
        else bucket.expense += v;
        byMonth.set(key, bucket);
      }
      const out: FlowPoint[] = [];
      const toClamped = to < todayStr ? to : todayStr;
      const end = new Date(`${toClamped.slice(0, 7)}-01T00:00:00`);
      for (let d = new Date(`${from.slice(0, 7)}-01T00:00:00`); d <= end; d.setMonth(d.getMonth() + 1)) {
        const b = byMonth.get(toISODate(d).slice(0, 7)) ?? { income: 0, expense: 0 };
        out.push({ label: shortMonth(d), ...b });
      }
      return out;
    }

    // 1y – trailing 12 calendar months.
    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      const key = row.date.slice(0, 7);
      const d = new Date(`${key}-01T00:00:00`);
      const monthsAgo =
        (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
      if (monthsAgo < 0 || monthsAgo >= 12) continue;
      const bucket = byMonth.get(key) ?? { income: 0, expense: 0 };
      const v = convert(row);
      if (row.type === "income") bucket.income += v;
      else bucket.expense += v;
      byMonth.set(key, bucket);
    }
    const out: FlowPoint[] = [];
    for (let back = 11; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const b = byMonth.get(toISODate(d).slice(0, 7)) ?? { income: 0, expense: 0 };
      out.push({ label: shortMonth(d), ...b });
    }
    return out;
  }, [rows, range, custom, cycle, convert, locale]);

  // Trim the empty stretch before the user's first entry, but keep ONE zero
  // bucket before it: the lines rise from zero, so the graph reads as
  // "started from 0" instead of beginning mid-air at a peak. At least two
  // buckets always remain so fresh accounts still render a line.
  const flowPoints = useMemo<FlowPoint[]>(() => {
    const first = flowPointsRaw.findIndex((p) => p.income > 0 || p.expense > 0);
    if (first <= 1) return flowPointsRaw;
    const start = Math.min(first - 1, flowPointsRaw.length - 2);
    return start > 0 ? flowPointsRaw.slice(start) : flowPointsRaw;
  }, [flowPointsRaw]);

  // Card summary for the selected window: totals, the like-for-like previous
  // window's net (delta chip), a window label, and one insight line.
  const flowSummary = useMemo(() => {
    const income = flowPoints.reduce((s, p) => s + p.income, 0);
    const expense = flowPoints.reduce((s, p) => s + p.expense, 0);
    const net = income - expense;
    const now = new Date();
    const todayStr = todayISO();

    // Bounds of the visible window (for custom's like-for-like predecessor).
    let winFrom: string;
    let winTo: string;
    if (range === "1d") {
      winFrom = todayISO();
      winTo = winFrom;
    } else if (range === "1w") {
      winFrom = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
      winTo = todayISO();
    } else if (range === "1m") {
      winFrom = toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      winTo = todayISO();
    } else if (range === "cycle") {
      winFrom = toISODate(cycle.start);
      winTo = toISODate(cycle.end);
    } else if (range === "custom" && custom) {
      winFrom = custom.from <= custom.to ? custom.from : custom.to;
      winTo = custom.from <= custom.to ? custom.to : custom.from;
    } else {
      winFrom = toISODate(new Date(now.getFullYear(), now.getMonth() - 11, 1));
      winTo = todayISO();
    }

    // Match the chart's leading trim: a window that starts before the user's
    // data begins is measured from their first entry instead.
    const firstDataISO =
      rows.length > 0 ? rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date) : null;
    if (firstDataISO && firstDataISO > winFrom) winFrom = firstDataISO;

    // Like-for-like previous window: same length, immediately before.
    let prevStartISO: string;
    let prevEndISO: string;
    if (range === "cycle") {
      const prev = getPreviousCycleWindow(
        new Date(),
        profile?.cycle_start_day ?? 1,
        profile?.cycle_end_day ?? null,
      );
      prevStartISO = toISODate(prev.start);
      prevEndISO = toISODate(prev.end);
    } else if (range === "1y") {
      prevStartISO = toISODate(new Date(now.getFullYear(), now.getMonth() - 23, 1));
      prevEndISO = toISODate(new Date(now.getFullYear(), now.getMonth() - 12, 0));
    } else {
      const lenDays = Math.max(
        1,
        Math.round((new Date(`${winTo}T00:00:00`).getTime() - new Date(`${winFrom}T00:00:00`).getTime()) / 86400000) + 1,
      );
      const pEnd = new Date(`${winFrom}T00:00:00`);
      pEnd.setDate(pEnd.getDate() - 1);
      const pStart = new Date(pEnd);
      pStart.setDate(pStart.getDate() - (lenDays - 1));
      prevStartISO = toISODate(pStart);
      prevEndISO = toISODate(pEnd);
    }

    let prevNet = 0;
    let hasPrev = false;
    for (const row of rows) {
      if (row.date < prevStartISO || row.date > prevEndISO) continue;
      hasPrev = true;
      prevNet += row.type === "income" ? convert(row) : -convert(row);
    }
    const diff = net - prevNet;
    // Percentage only when it stays meaningful – a tiny previous net makes
    // "+3024%"-style chips, so past ±999% the chip shows the amount instead.
    const pct = prevNet !== 0 ? Math.round((diff / Math.abs(prevNet)) * 100) : null;
    // What the chip compares against, spelled out so it needs no guessing.
    const deltaLabel =
      range === "1d"
        ? t("cfVsYesterday")
        : range === "1w"
          ? t("cfVsPrevWeek")
          : range === "1m"
            ? t("cfVsPrevMonth")
            : range === "cycle"
              ? t("homeVsPrev")
              : range === "custom"
                ? t("cfVsPrevPeriod")
                : t("cfVsPrevYear");
    const delta = hasPrev
      ? pct != null && Math.abs(pct) <= 999
        ? {
            text: `${diff >= 0 ? "+" : "−"}${Math.abs(pct)}%`,
            positive: diff >= 0,
            label: deltaLabel,
          }
        : { text: `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))}`, positive: diff >= 0, label: deltaLabel }
      : null;

    const windowLabel =
      range === "1d"
        ? formatShort(now, locale)
        : range === "1y"
          ? `${flowPoints[0]?.label ?? ""} – ${flowPoints[flowPoints.length - 1]?.label ?? ""}`
          : `${formatShort(new Date(`${winFrom}T00:00:00`), locale)} – ${formatShort(new Date(`${winTo}T00:00:00`), locale)}`;

    const activeDays = flowPoints.filter((p) => p.income > 0 || p.expense > 0).length;
    // Averages count only days that exist – a window ending in the future is
    // measured up to today, not its full nominal length.
    const effTo = winTo < todayStr ? winTo : todayStr;
    const dayLen = Math.max(
      1,
      Math.round(
        (new Date(`${effTo}T00:00:00`).getTime() - new Date(`${winFrom}T00:00:00`).getTime()) / 86400000,
      ) + 1,
    );
    const insight =
      range === "1d"
        ? t("cfAvgPerHour").replace("{amount}", fmt(expense / Math.max(1, now.getHours() + 1)))
        : dayLen <= 45
          ? `${t("cfAvgPerDay").replace("{amount}", fmt(expense / Math.max(1, dayLen)))} · ${activeDays} ${t("cfActiveDays")}`
          : t("cfAvgPerMonth")
              .replace("{in}", fmt(income / (dayLen / 30)).replace(/^[^\d]*/, ""))
              .replace("{out}", fmt(expense / (dayLen / 30)).replace(/^[^\d]*/, ""));

    return { income, expense, delta, windowLabel, insight };
  }, [flowPoints, range, custom, rows, cycle, convert, fmt, t, locale, profile?.cycle_start_day, profile?.cycle_end_day]);

  // Threshold alerts (mobile parity): fire once per user/month/threshold when
  // cycle spend crosses 25/50/75/90/100% of budget, and category 90/100%.
  useEffect(() => {
    if (!user || budget == null || stats.spent <= 0) return;
    void checkBudgetAlerts({
      supabase,
      userId: user.id,
      budget,
      spent: stats.spent,
      fire: (m, k) => showToast(m, k ?? "info"),
    });
    const withSpend = categories
      .filter((c) => (c.budget_monthly ?? 0) > 0)
      .map((c) => ({
        name: c.name,
        limit: c.budget_monthly as number,
        spent: categorySlices.find((x) => x.label === c.name)?.value ?? 0,
      }));
    if (withSpend.length > 0) {
      void checkCategoryAlerts({
        supabase,
        userId: user.id,
        categories: withSpend,
        fire: (m, k) => showToast(m, k ?? "info"),
      });
    }
  }, [user, budget, stats.spent, categorySlices, categories, supabase, showToast]);

  const greetingKey = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "greetingMorning" : h < 17 ? "greetingAfternoon" : "greetingEvening";
  }, []);

  const dateLine = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(
        new Date(),
      ),
    [locale],
  );
  const showSkeleton = authLoading || (loading && rows.length === 0);
  if (showSkeleton) {
    // Mirrors the hero + ruled-section layout – no shift when data lands.
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <div className="pb-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2 h-8 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-[20px]" />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
          <Skeleton className="h-[340px] rounded-[20px] lg:col-span-2" />
          <Skeleton className="h-[340px] rounded-[20px]" />
        </div>
      </div>
    );
  }

  const cycleLabel = `${formatShort(cycle.start, locale)} – ${formatShort(cycle.end, locale)}`;

  const netText = `${stats.net >= 0 ? "+" : "−"}${fmt(Math.abs(stats.net))}`;

  // Signed day net (income − expense) for the feed's group headers.
  const dayNet = (grp: ExpenseRow[]) => {
    const net = grp.reduce((s, r) => s + (r.type === "income" ? convert(r) : -convert(r)), 0);
    return {
      text: `${net >= 0 ? "+" : "−"}${fmt(Math.abs(net)).replace(/^[^\d]*/, "")}`,
      positive: net >= 0,
    };
  };
  // Rail calendar nav bounds: next is capped at the current month.
  const canNextMonth =
    calYm.y * 12 + calYm.m < new Date().getFullYear() * 12 + new Date().getMonth();

  const rangeLabels: Record<Exclude<FlowRange, "custom">, string> = {
    "1d": t("range1D"),
    "1w": t("range1W"),
    "1m": t("range1M"),
    cycle: t("rangeCycle"),
    "1y": t("range1Y"),
  };

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* Masthead: greeting + date left, cycle pill right */}
      <header className="rise flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-faint">{dateLine}</p>
          <h1 className="mt-0.5 truncate text-[22px] font-bold tracking-tight text-text sm:text-2xl">
            {t(greetingKey)},{" "}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {profile?.display_name
                ? formatDisplayName(profile.display_name)
                : "there"}
              {profile?.preferred_currency && (
                <CurrencyFlag currency={profile.preferred_currency} size={18} />
              )}
            </span>
          </h1>
        </div>
        <span className="numeric hidden h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[12px] text-text-muted shadow-soft sm:flex">
          <CurrencyFlag currency={displayCurrency} size={15} />
          <span className="whitespace-nowrap">{cycleLabel}</span>
        </span>
      </header>

      {/* Hero – the total-balance statement card with the cycle figures */}
      <div className="rise mt-6" style={{ animationDelay: "40ms" }}>
        <BalanceCard
          cycleLabel={cycleLabel}
          net={netText}
          netDelta={
            prevDelta ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
                {prevDelta.text}
                <span className="font-medium text-white/70">{t("homeVsPrev")}</span>
              </span>
            ) : null
          }
          income={fmt(stats.income).replace(/^[^\d]*/, "")}
          expense={fmt(stats.spent).replace(/^[^\d]*/, "")}
          safe={
            budget != null && budget > 0
              ? fmt(Math.max(0, budget - stats.spent)).replace(/^[^\d]*/, "")
              : "—"
          }
          safeCaption={
            budget != null && budget > 0 ? (
              `${Math.round(pace.spentPct * 100)}% ${t("homeOfBudget")} ${fmt(budget)}`
            ) : undefined
          }
          budget={
            budget != null && budget > 0
              ? {
                  amount: fmt(budget),
                  pct: pace.spentPct,
                  left: fmt(Math.max(0, budget - stats.spent)),
                }
              : null
          }
        />
      </div>

      {frozenTotals && (
        <div className="mt-3">
          <TodayRateLine
            live={{ income: stats.income, expense: stats.spent }}
            frozen={frozenTotals}
            fmt={fmt}
          />
        </div>
      )}

      {/* Urgent bills: overdue pay_on_due plans with one-tap Mark Paid.
          Self-removes when nothing is owed. */}
      <div className="mt-4">
        <BillsDue />
      </div>

      {/* Cash flow + spending calendar */}
      <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
        <DashCard
          title={t("cashFlow")}
          className="flex flex-col lg:col-span-2"
          bodyClassName="flex min-h-0 flex-1 flex-col"
          action={
            <div
              role="group"
              aria-label={t("cashFlow")}
              className="flex items-center rounded-full border border-border bg-surface p-0.5"
            >
              {(Object.keys(rangeLabels) as Exclude<FlowRange, "custom">[]).map((r) => (
                <RangeChip
                  key={r}
                  active={range === r}
                  label={rangeLabels[r]}
                  onClick={() => setRange(r)}
                />
              ))}
              <button
                type="button"
                aria-pressed={range === "custom"}
                aria-label={t("rangeCustom")}
                onClick={() => setCustomOpen(true)}
                className={`flex h-7 items-center rounded-full px-2 transition-colors ${
                  range === "custom"
                    ? "bg-[var(--sf-primary-light)] text-primary-strong"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <CalendarDays size={13} aria-hidden />
              </button>
            </div>
          }
        >
          <CashFlowCard
            key={range}
            design="ratio"
            points={flowPoints}
            totals={{ income: flowSummary.income, expense: flowSummary.expense }}
            delta={flowSummary.delta}
            windowLabel={flowSummary.windowLabel}
            insight={flowSummary.insight}
            format={fmt}
            tickFormat={axisFmt}
            labels={{
              income: t("income"),
              expense: t("expense"),
              empty: t("homeNoFlowData"),
            }}
          />
        </DashCard>

        <DashCard title={t("anCalendarHeat")}>
          <HeatGrid
            year={calYm.y}
            month={calYm.m}
            spend={spendByDay}
            formatted={fmt}
            locale={locale}
            onPrevMonth={() =>
              setCalYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
            }
            onNextMonth={() =>
              setCalYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
            }
            canNextMonth={canNextMonth}
            onDayTap={(iso) => {
              window.location.href = `/history?from=${iso}&to=${iso}`;
            }}
            totalLabel={t("anMonthTotal")}
          />
        </DashCard>
      </div>

      {/* Recent | Upcoming / Accounts | Mix (mix under upcoming) - the 2x2 block */}
      <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-2">
        <DashCard
          title={t("recentActivity")}
          className="lg:col-start-1 lg:row-start-1 lg:row-span-3"
          action={<CardPillLink href="/history">{t("viewAll")}</CardPillLink>}
        >
          {rows.length === 0 ? (
            <div className="py-2">
              <EmptyState
                title={t("noTransactions")}
                message={t("noTransactionsHint")}
                action={
                  <Link href="/expense/new">
                    <Button>{t("homeAddFirstEntry")}</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <Feed
              rows={rows}
              amountFor={(r) => fmt(convert(r))}
              dayNetFor={dayNet}
              locale={locale}
              onOpen={setSelected}
              max={6}
              labels={{ today: t("today"), yesterday: t("homeYesterday") }}
            />
          )}
          {rows.length > 6 && (
            <Link
              href="/history"
              className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-surface text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text"
            >
              <Layers size={14} aria-hidden />
              {t("viewAll")} – {rows.length} {t("homeEntriesWord")}
            </Link>
          )}
        </DashCard>

        <DashCard
          title={t("homeUpcoming")}
          className="self-start lg:col-start-2 lg:row-start-1"
          action={<CardPillLink href="/history">{t("viewAll")}</CardPillLink>}
        >
          <Upcoming />
        </DashCard>

        {categorySlices.length > 0 && (
          <DashCard
            title={t("homeSpendingMix")}
            className="self-start lg:col-start-2 lg:row-start-3"
            bodyClassName="flex h-full flex-col justify-center"
            action={<CardPillLink href="/analytics">{t("analytics")}</CardPillLink>}
          >
            <MixCard slices={categorySlices} format={fmt} otherLabel={t("analyticsOther")} />
          </DashCard>
        )}

        <div
          className={`self-start lg:col-start-2 lg:row-start-2 ${categorySlices.length > 0 ? "" : ""}`}
        >
          <AccountsStrip />
        </div>
      </div>

      <ExpenseDetailSheet
        row={selected}
        amount={selected ? fmt(convert(selected)) : ""}
        displayCurrency={displayCurrency}
        onClose={() => setSelected(null)}
      />

      {/* Custom range picker for the cash-flow filters. Applying a range
          switches the chart to the custom window. */}
      <CalendarModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        mode="range"
        initial={{ from: custom?.from, to: custom?.to }}
        onApply={({ from, to }) => {
          if (from && to) {
            setCustom({ from, to });
            setRange("custom");
          }
        }}
      />
    </div>
  );
}

function formatShort(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}
