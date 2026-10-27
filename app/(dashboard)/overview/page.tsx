"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Landmark,
  MoreHorizontal,
  PiggyBank,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { cacheExpenses, getCachedExpenses, listExpenses } from "@/services/expenses";
import { computeAccountBalances, listBankAccounts, type BankAccountRow } from "@/services/bankAccounts";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { FlowPoint } from "@/components/graphs/FlowChart";
import { CashFlowSplineChart } from "@/components/dash/CashFlowSplineChart";
import type { DonutSlice } from "@/components/dash/MixCard";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import { CalendarModal } from "@/components/ui/CalendarModal";
import { FloatingSelect, SelectRow } from "@/components/ui/FloatingSelect";
import { FitText } from "@/components/ui/FitText";
import { useCountUp } from "@/components/graphs/useCountUp";
import { Skeleton } from "@/components/ui/Skeleton";
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
  const [rangeOpen, setRangeOpen] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [txCount, setTxCount] = useState(5);
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);

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

  useEffect(() => {
    if (!user) {
      setAccounts([]);
      return;
    }
    void listBankAccounts(supabase, user.id)
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [user, supabase]);

  // Highest balance first: each account's LIVE balance from the shared
  // computation (the Accounts page's source of truth — the current_balance
  // column is only written at create/edit, so it reads 0 forever), converted
  // to the display currency at today's rate. Re-runs on expense changes so
  // newly logged entries move the card.
  const [sortedAccounts, setSortedAccounts] = useState<{ account: BankAccountRow; value: number }[]>([]);
  useEffect(() => {
    if (!user || accounts.length === 0) {
      setSortedAccounts([]);
      return;
    }
    let cancelled = false;
    const target = profile?.preferred_currency ?? "NPR";
    const compute = async () => {
      let live = new Map<string, number>();
      try {
        live = await computeAccountBalances(supabase, user.id, accounts);
      } catch {
        live = new Map(accounts.map((a) => [a.id, Number(a.initial_balance) || 0]));
      }
      const withConverted = await Promise.all(
        accounts.map(async (a) => {
          const base = live.get(a.id) ?? 0;
          if (a.currency === target) return { account: a, value: base };
          try {
            const [from, to] = await Promise.all([
              getRate(supabase, a.currency),
              getRate(supabase, target),
            ]);
            return {
              account: a,
              value: to > 0 ? (base * from) / to : base,
            };
          } catch {
            return { account: a, value: base };
          }
        }),
      );
      if (!cancelled) {
        setSortedAccounts(withConverted.sort((x, y) => y.value - x.value));
      }
    };
    void compute();
    const unsubscribe = subscribeToExpenseChanges(() => void compute());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, accounts, profile?.preferred_currency, supabase]);
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

  // Previous salary cycle's income/spend from the full row set — the stat
  // cards' like-for-like delta chips. Null when it has no entries.
  const prevCycleTotals = useMemo(() => {
    const prev = getPreviousCycleWindow(
      new Date(),
      profile?.cycle_start_day ?? 1,
      profile?.cycle_end_day ?? null,
    );
    const startISO = toISODate(prev.start);
    const endISO = toISODate(prev.end);
    let income = 0;
    let spent = 0;
    let hasRows = false;
    for (const row of rows) {
      if (row.date < startISO || row.date > endISO) continue;
      hasRows = true;
      if (row.type === "income") income += convert(row);
      else spent += convert(row);
    }
    return hasRows ? { income, spent } : null;
  }, [rows, profile?.cycle_start_day, profile?.cycle_end_day, convert]);

  // Signed pct vs the previous cycle, capped like the flow delta chip.
  const pctDelta = (cur: number, prev: number | undefined): number | null => {
    if (prev == null || prev === 0) return null;
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return Number.isFinite(pct) && Math.abs(pct) <= 999 ? pct : null;
  };
  const netPct = pctDelta(stats.net, prevCycleTotals ? prevCycleTotals.income - prevCycleTotals.spent : undefined);
  const incomePct = pctDelta(stats.income, prevCycleTotals?.income);
  const expensePct = pctDelta(stats.spent, prevCycleTotals?.spent);

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

  // Top-5 cycle categories for the Spending by Category card (share of the
  // cycle's converted outflow; stored category colors drive the bars).
  const topCategories = useMemo(() => {
    const total = categorySlices.reduce((sum, c) => sum + c.value, 0);
    return categorySlices.slice(0, 5).map((c) => ({
      label: c.label,
      value: c.value,
      color: c.color,
      pct: total > 0 ? Math.max(1, Math.round((c.value / total) * 100)) : 0,
    }));
  }, [categorySlices]);

  // Budget bars: categories with a monthly cap, worst-paced first, cycle
  // spend from the category slices.
  const budgetRows = useMemo(() => {
    const spentByName = new Map<string, number>();
    for (const c of categorySlices) spentByName.set(c.label, c.value);
    return categories
      .filter((c) => (c.budget_monthly ?? 0) > 0)
      .map((c) => {
        const limit = c.budget_monthly as number;
        const spent = spentByName.get(c.name) ?? 0;
        return {
          name: c.name,
          spent,
          limit,
          pct: limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [categories, categorySlices]);

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

  const transactionList = useMemo(() => {
    if (rows && rows.length > 0) {
      return rows.slice(0, txCount).map((r) => {
        const isInc = r.type === "income";
        return {
          id: r.id,
          name: r.description?.trim() || r.categories?.name || "Transaction",
          method: r.payment_method || "Card Payment",
          date: r.date,
          category: r.categories?.name || "General",
          status: "completed",
          amount: `${isInc ? "+" : "-"}${fmt(convert(r))}`,
          isIncome: isInc,
          raw: r,
        };
      });
    }
    return [];
  }, [rows, txCount, convert, fmt]);

  const filteredTransactions = useMemo(() => {
    if (!txSearch.trim()) return transactionList;
    const q = txSearch.toLowerCase();
    return transactionList.filter(
      (tx) =>
        tx.name.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.date.includes(q),
    );
  }, [transactionList, txSearch]);

  // Footer stamp (mobile): the newest entry drives "last updated" - real
  // data, never a hardcoded clock.
  const lastUpdated = useMemo(() => {
    const r = rows[0];
    if (!r) return null;
    const d = new Date(r.time ? `${r.date}T${r.time}` : `${r.date}T00:00:00`);
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
    if (toISODate(d) === todayISO()) return `Last updated today at ${time}`;
    return `Last updated ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d)}`;
  }, [rows, locale]);

  // Mouse users can't swipe the account strip: wheel scrolls it sideways
  // and click-drag pans (touch swipes natively). Hook sits above the
  // skeleton early return with every other hook.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      dragging = true;
      startX = e.clientX;
      startLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) el.scrollLeft = startLeft - (e.clientX - startX);
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Entrance count-ups: the stat figures tick from 0 on first load and
  // re-animate from their previous value when the cycle totals change.
  const animNet = useCountUp(stats.net, fmt, 900, true);
  const animIncome = useCountUp(stats.income, fmt, 900, true);
  const animSpent = useCountUp(stats.spent, fmt, 900, true);


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

  const firstName = profile?.display_name?.split(" ")[0] || "";

  return (
    <div className="-mt-3 -mx-5 max-w-[1340px] bg-white dark:bg-[#000000] px-5 dark:text-gray-100 sm:-mx-6 sm:px-6 lg:mx-0 lg:bg-transparent lg:px-0">
      {/* ===== Page Header ===== */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-gray-900 dark:text-gray-100">Financial Overview</h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Welcome back{firstName ? `, ${firstName}` : ""}. Here's what's happening with your money.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:gap-2.5">
          {/* Range dropdown: the same window the cash-flow chart buckets by.
              "Custom" hands off to the calendar; Apply switches the range. */}
          <FloatingSelect
            ghost
            className="relative flex-1 sm:w-[160px] sm:flex-none"
            label={
              range === "custom" && custom
                ? `${formatShort(new Date(`${custom.from <= custom.to ? custom.from : custom.to}T00:00:00`), locale)} – ${formatShort(new Date(`${custom.from <= custom.to ? custom.to : custom.from}T00:00:00`), locale)}`
                : rangeLabels[range === "custom" ? "cycle" : range]
            }
            open={rangeOpen}
            onToggle={() => setRangeOpen((v) => !v)}
            menuClassName="max-h-72 overflow-y-auto"
          >
            {(["1d", "1w", "1m", "cycle", "1y"] as const).map((key) => (
              <SelectRow
                key={key}
                selected={range === key}
                label={rangeLabels[key]}
                onSelect={() => {
                  setRange(key);
                  setRangeOpen(false);
                }}
              />
            ))}
            <SelectRow
              selected={range === "custom"}
              label={t("filterCustom")}
              onSelect={() => {
                setRangeOpen(false);
                setCustomOpen(true);
              }}
            />
          </FloatingSelect>
          <Link
            href="/export"
            aria-label="Export overview"
            className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 dark:border-[#262626]/70 bg-[#f7f8f9] dark:bg-[#141414] text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-[#141414]"
          >
            <Download size={15} />
          </Link>
          <Link
            href="/history"
            aria-label="Filter transactions"
            className="hidden h-10 w-10 sm:grid place-items-center rounded-lg border border-gray-200 dark:border-[#262626]/70 bg-[#f7f8f9] dark:bg-[#141414] text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-[#141414]"
          >
            <SlidersHorizontal size={15} />
          </Link>
          <Link
            href="/expense/new"
            className="flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-semibold text-primary-ink shadow-xs transition-colors hover:bg-primary-strong sm:flex-none sm:gap-2 sm:px-4"
          >
            <Plus size={14} />
            <span>Add Transaction</span>
          </Link>
        </div>
      </div>

      {/* ===== 4 Metric Cards ===== */}
      <section className="rise grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Balance */}
        <div className="rounded-xl border border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <span>Total Balance</span>
            <span className="text-gray-400">
              <Wallet size={16} />
            </span>
          </div>
          <p className="numeric mt-3 font-bold tracking-tight text-gray-900 dark:text-gray-100">
            <FitText basePx={26} minPx={15}>{animNet}</FitText>
          </p>
          <div className="mt-2 flex min-h-4 items-center gap-1.5 text-xs">
            {netPct != null && (
              <span className={`flex items-center gap-0.5 font-semibold ${netPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {netPct >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownLeft size={12} aria-hidden />}
                {netPct >= 0 ? "+" : "−"}{Math.abs(netPct)}%
              </span>
            )}
            <span className="text-[11px] text-gray-400">vs last cycle</span>
          </div>
        </div>

        {/* Monthly Income */}
        <div className="rounded-xl border border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <span>Monthly Income</span>
            <span className="text-gray-400">
              <Banknote size={16} />
            </span>
          </div>
          <p className="numeric mt-3 font-bold tracking-tight text-gray-900 dark:text-gray-100">
            <FitText basePx={26} minPx={15}>{animIncome}</FitText>
          </p>
          <div className="mt-2 flex min-h-4 items-center gap-1.5 text-xs">
            {incomePct != null && (
              <span className={`flex items-center gap-0.5 font-semibold ${incomePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {incomePct >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownLeft size={12} aria-hidden />}
                {incomePct >= 0 ? "+" : "−"}{Math.abs(incomePct)}%
              </span>
            )}
            <span className="text-[11px] text-gray-400">vs last cycle</span>
          </div>
        </div>

        {/* Monthly Expenses */}
        <div className="rounded-xl border border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <span>Monthly Expenses</span>
            <span className="text-gray-400">
              <CreditCard size={16} />
            </span>
          </div>
          <p className="numeric mt-3 font-bold tracking-tight text-gray-900 dark:text-gray-100">
            <FitText basePx={26} minPx={15}>{animSpent}</FitText>
          </p>
          <div className="mt-2 flex min-h-4 items-center gap-1.5 text-xs">
            {expensePct != null && (
              <span className={`flex items-center gap-0.5 font-semibold ${expensePct > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {expensePct > 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownLeft size={12} aria-hidden />}
                {expensePct > 0 ? "+" : "−"}{Math.abs(expensePct)}%
              </span>
            )}
            <span className="text-[11px] text-gray-400">vs last cycle</span>
          </div>
        </div>

        {/* Net Savings */}
        <div className="rounded-xl border border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <span>Net Savings</span>
            <span className="text-gray-400">
              <TrendingUp size={16} />
            </span>
          </div>
          <p className="numeric mt-3 font-bold tracking-tight text-gray-900 dark:text-gray-100">
            <FitText basePx={26} minPx={15}>{animNet}</FitText>
          </p>
          <div className="mt-2 flex min-h-4 items-center gap-1.5 text-xs">
            {netPct != null && (
              <span className={`flex items-center gap-0.5 font-semibold ${netPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {netPct >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownLeft size={12} aria-hidden />}
                {netPct >= 0 ? "+" : "−"}{Math.abs(netPct)}%
              </span>
            )}
            <span className="text-[11px] text-gray-400">vs last cycle</span>
          </div>
        </div>
      </section>

      {/* ===== Middle Section: Cash Flow Trends + Spending by Category ===== */}
      <section className="rise mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(310px,1fr)]">
        {/* Cash Flow Trends Card */}
        <div className="min-w-0 p-0 lg:rounded-xl lg:border lg:border-[#eaecf0] dark:border-[#262626] lg:bg-white dark:bg-[#0a0a0a] lg:p-5 lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <CashFlowSplineChart points={flowPoints} />
        </div>

        {/* Spending by Category Card */}
        <div className="flex min-w-0 flex-col justify-between p-0 lg:rounded-xl lg:border lg:border-[#eaecf0] dark:border-[#262626] lg:bg-white dark:bg-[#0a0a0a] lg:p-5 lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Spending by Category</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">Your biggest expenses this week</p>

            <div className="mt-6 space-y-4">
              {topCategories.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">No spending this cycle yet.</p>
              ) : (
                topCategories.map((cat) => (
                  <div key={cat.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-800 dark:text-gray-100">{cat.label}</span>
                      <span className="numeric font-semibold text-gray-900 dark:text-gray-100">{fmt(cat.value)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-[#141414]">
                      <div
                        className="grow-x h-full rounded-full transition-all duration-500"
                        style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <Link
            href="/analytics"
            className="mt-6 flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-900 dark:text-gray-100 transition-colors hover:text-black"
          >
            <span>View All Insights</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </section>

      {/* ===== Bottom Section: Recent Transactions ===== */}
      <section className="rise -mx-5 mt-6 overflow-hidden rounded-none border-y border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] px-5 py-5 lg:mx-0 lg:rounded-xl lg:border-x lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        {/* Mobile header */}
        <div className="mb-1 flex items-center justify-between pb-3 lg:hidden">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Recent Transactions</h2>
          <Link
            href="/history"
            className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
          >
            VIEW ALL
          </Link>
        </div>
        {/* Desktop header */}
        <div className="hidden flex-wrap items-center justify-between gap-3 pb-4 lg:flex">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Recent Transactions</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">Review your latest financial activity</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-gray-400" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder="Filter transactions..."
                className="h-8 w-52 rounded-lg border border-gray-200 dark:border-[#262626] bg-white dark:bg-[#0a0a0a] pl-8 pr-2.5 text-xs text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#262626] bg-white dark:bg-[#0a0a0a] px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-xs transition-colors hover:bg-gray-50 dark:hover:bg-[#141414]"
            >
              <SlidersHorizontal size={12} className="text-gray-500 dark:text-gray-400" />
              <span>Filter</span>
            </button>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">No transactions yet</p>
            <Link
              href="/expense/new"
              className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700"
            >
              Add your first transaction
            </Link>
          </div>
        ) : (
          <>
        {/* Mobile: stacked rows */}
        <div className="divide-y divide-gray-50 lg:hidden">
          {filteredTransactions.map((tx) => (
            <div
              key={tx.id}
              onClick={() => {
                if ("raw" in tx && tx.raw) setSelected(tx.raw as ExpenseRow);
              }}
              className="flex cursor-pointer items-center gap-3 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-[#141414]/70"
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  tx.isIncome ? "bg-blue-50 text-blue-600" : "bg-gray-100 dark:bg-[#141414] text-gray-500 dark:text-gray-400"
                }`}
              >
                {tx.isIncome ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{tx.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-gray-400">
                  {tx.date} · {tx.category}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={`numeric text-[13px] font-bold ${tx.isIncome ? "text-blue-600" : "text-gray-900 dark:text-gray-100"}`}>
                  {tx.amount}
                </span>
                {tx.status === "completed" ? (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
                    completed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden />
                    pending
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        {filteredTransactions.length > 0 && (
          <button
            type="button"
            onClick={() => setTxCount((c) => c + 5)}
            className="flex w-full items-center justify-center gap-2 border-t border-gray-100 dark:border-[#262626] py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-300 lg:hidden"
          >
            LOAD MORE
            <MoreHorizontal size={13} aria-hidden />
          </button>
        )}
        {/* lg+: ledger table */}
        <div className="hidden scroll-x overflow-x-auto lg:block">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#262626] text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-3 pr-4 font-semibold">Entity / Merchant</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 pl-4 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => {
                    if ("raw" in tx && tx.raw) {
                      setSelected(tx.raw as ExpenseRow);
                    }
                  }}
                  className="cursor-pointer text-xs transition-colors hover:bg-gray-50 dark:hover:bg-[#141414]/70"
                >
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid h-8 w-8 place-items-center rounded-lg ${
                          tx.isIncome ? "bg-blue-50 text-blue-600" : "bg-gray-100 dark:bg-[#141414] text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {tx.isIncome ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{tx.name}</p>
                        <p className="text-[10px] text-gray-400">{tx.method}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-gray-500 dark:text-gray-400">{tx.date}</td>
                  <td className="py-3.5 px-4">
                    <span className="rounded-full bg-gray-100 dark:bg-[#141414] px-2.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400">
                      {tx.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {tx.status === "completed" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                        completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        pending
                      </span>
                    )}
                  </td>
                  <td
                    className={`numeric py-3.5 pl-4 text-right font-bold ${
                      tx.isIncome ? "text-blue-600" : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {tx.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}

        <Link
          href="/history"
          className="hidden border-t border-gray-100 dark:border-[#262626] py-3.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-100 lg:block"
        >
          View All Transactions &nbsp;›
        </Link>
      </section>

      {/* ===== Bottom Row: Linked Accounts + Recent Budgets ===== */}
      <section className="rise mt-6 grid gap-5 lg:grid-cols-2">
        {/* Linked Accounts Card */}
        <div className="flex min-w-0 flex-col justify-between p-0 lg:rounded-xl lg:border lg:border-[#eaecf0] dark:border-[#262626] lg:bg-white dark:bg-[#0a0a0a] lg:p-5 lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Linked Accounts</h2>
              <Link
                href="/accounts"
                aria-label="Add account"
                className="grid h-7 w-7 place-items-center rounded-lg text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100 lg:hidden"
              >
                <Plus size={15} />
              </Link>
            </div>
            {accounts.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">No accounts linked yet.</p>
            ) : (
              <>
                {/* Mobile: swipeable balance cards */}
                <div ref={stripRef} className="-mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 lg:hidden">
                  {sortedAccounts.slice(0, 5).map(({ account: a, value }) => (
                    <div
                      key={a.id}
                      className="min-w-[200px] snap-start rounded-xl border border-[#eef0f2] bg-[#f7f8f9] dark:bg-[#141414] p-4"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                          style={{ backgroundColor: a.color || "#111827" }}
                        >
                          <Landmark size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{a.name}</span>
                          <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-gray-400">
                            {a.account_type}
                          </span>
                        </span>
                      </div>
                      <p className="mt-4 text-[9px] font-bold uppercase tracking-wider text-gray-400">Available Balance</p>
                      <p className="numeric mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatMoney(value, displayCurrency, locale)}
                      </p>
                    </div>
                  ))}
                </div>
                {/* lg+: rows */}
                <div className="mt-4 hidden space-y-3 lg:block">
                  {sortedAccounts.slice(0, 3).map(({ account: a, value }) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-[#262626] bg-[#fbfcfc] dark:bg-[#141414] p-3.5 transition-colors hover:border-gray-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 dark:border-[#262626]/60 bg-white dark:bg-[#0a0a0a] text-gray-600 dark:text-gray-400 shadow-xs">
                          <Landmark size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{a.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {a.account_type}
                            {a.account_number_last4 ? ` •••• ${a.account_number_last4}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="numeric text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatMoney(value, displayCurrency, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link
            href="/accounts"
            className="mt-4 hidden h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white dark:bg-[#0a0a0a] text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-400 dark:hover:border-[#4b5563] hover:bg-gray-50 dark:hover:bg-[#141414] lg:flex"
          >
            <Plus size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Link New Account</span>
          </Link>
        </div>

        {/* Recent Budgets Card */}
        <div className="flex min-w-0 flex-col justify-between p-0 lg:rounded-xl lg:border lg:border-[#eaecf0] dark:border-[#262626] lg:bg-white dark:bg-[#0a0a0a] lg:p-5 lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
                <span className="lg:hidden">Budget Health</span>
                <span className="hidden lg:inline">Recent Budgets</span>
              </h2>
              <Clock size={14} className="shrink-0 text-gray-400 lg:hidden" aria-hidden />
            </div>
            <div className="mt-4 space-y-4">
              {budgetRows.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">No budgets set yet.</p>
              ) : (
                budgetRows.map((b) => (
                  <div key={b.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{b.name}</span>
                      <span className="numeric text-[11px] font-bold text-gray-900 dark:text-gray-100">
                        {fmt(b.spent)}
                        <span className="font-medium text-gray-400"> / {fmt(b.limit)}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-[#141414]">
                        <div
                          className={`grow-x h-full rounded-full ${b.pct >= 90 ? "bg-red-500" : "bg-blue-600"}`}
                          style={{ width: `${Math.max(2, b.pct)}%` }}
                        />
                      </div>
                      {b.pct >= 90 && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                      )}
                    </div>
                    <div className={`mt-1 ${b.pct >= 90 ? "" : "lg:text-right"}`}>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          b.pct >= 90 ? "text-red-500" : "text-gray-400"
                        }`}
                      >
                        {b.pct >= 90 ? "CRITICAL" : "ON TRACK"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <Link
            href="/profit-loss"
            className="mt-4 border-t border-gray-100 dark:border-[#262626] py-3 text-center text-[10px] font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100 transition-colors hover:text-gray-600 lg:hidden"
          >
            View All Budgets
          </Link>
          <Link
            href="/profit-loss"
            className="mt-4 hidden items-center justify-center gap-1 pt-2 text-[11px] font-semibold text-gray-900 dark:text-gray-100 transition-colors hover:text-black lg:flex"
          >
            <span>Manage Budgets</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </section>

      {lastUpdated && (
        <footer className="mt-8 space-y-1 pb-2 text-center lg:hidden">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{lastUpdated}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
            Data secured by SpendFlow Finance API.
          </p>
        </footer>
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        row={selected}
        amount={selected ? fmt(convert(selected)) : ""}
        displayCurrency={displayCurrency}
        onClose={() => setSelected(null)}
      />

      {/* Date Picker Modal */}
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
