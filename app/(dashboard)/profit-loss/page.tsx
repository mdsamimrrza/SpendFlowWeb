"use client";

/**
 * Budget & Reports (Profit & Loss) — 1:1 web mirror of mobile
 * app/profit-loss.tsx: back-chip header, the calendar range picker card, the
 * Period-summary stock chart (All Flows / Income / Expense / Net pills,
 * tap-scrub HUD, gridlines, crosshair, savings badge, income/expense/net
 * footer), the Monthly Budget card with inline save, the Paycheck & Budget
 * Cycle card (Pick on Calendar + Configure Days), and the paginated
 * Month-by-Month register with per-cycle budget-vs-actual and savings rate.
 * Cycle-row builders mirror the mobile engine: calendar months by default,
 * paycheck cycles from the settings trail once customised, and the chart
 * replaces ONLY the month an explicit custom cycle falls in.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Scale,
  ShieldCheck,
  Sliders,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { CalendarModal } from "@/components/ui/CalendarModal";
import { MobileEmptyState } from "@/components/ui/MobileChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRowConverter, useBudget } from "@/hooks/useRates";
import { listExpenses } from "@/services/expenses";
import { listSettingsHistory } from "@/services/settingsHistory";
import { resetAlertHistory } from "@/services/alerts";
import { getRateSnapshot } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, getCycleWindow, toISODate, todayISO } from "@/utils/format";
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import type { TranslationKey } from "@/constants/i18n/dictionaries";

interface MonthRow {
  key: string;
  label: string;
  cycleKey?: string;
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  budget: number | null;
  isCustom?: boolean;
}

interface SettingsPeriod {
  effective_from: string;
  monthly_budget: number | null;
  budget_currency: string | null | undefined;
  cycle_start_day: number;
  cycle_end_day: number | null;
}

const parseISO = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Mobile getSafeMonthDate: clamp the day to the month's real length. */
function safeMonthDate(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(day, 1), last));
}

type ChartMode = "all" | "income" | "expense" | "net";

export default function ProfitLossPage() {
  const { user, profile, saveProfile, refreshProfile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const currency = profile?.preferred_currency ?? "NPR";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const { convert, convertToday } = useRowConverter(profile?.preferred_currency, rows);
  const [loading, setLoading] = useState(true);
  const [settingsHistory, setSettingsHistory] = useState<Awaited<ReturnType<typeof listSettingsHistory>>>([]);

  const now = new Date();
  const [range, setRange] = useState<{ startDate: string; endDate: string }>({
    startDate: toISODate(new Date(now.getFullYear(), 0, 1)),
    endDate: todayISO(),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [budgetInput, setBudgetInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [selectedChartIdx, setSelectedChartIdx] = useState<number | null>(null);
  const [chartViewMode, setChartViewMode] = useState<ChartMode>("all");

  const [updatingCycle, setUpdatingCycle] = useState(false);
  const [cycleCalendarOpen, setCycleCalendarOpen] = useState(false);
  const [cycleCalendarMode, setCycleCalendarMode] = useState<"range" | "single-start" | "single-end">("range");
  const [cycleSettingsOpen, setCycleSettingsOpen] = useState(false);

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const cycleEndDay = profile?.cycle_end_day ?? null;
  const isDefaultCycle = cycleStartDay === 1 && cycleEndDay === null;
  const cycleLabel = `${cycleStartDay} – ${cycleEndDay !== null ? cycleEndDay : t("plLastDay")}`;

  const [modalStartDay, setModalStartDay] = useState(String(cycleStartDay));
  const [modalEndDay, setModalEndDay] = useState(cycleEndDay !== null ? String(cycleEndDay) : "");
  useEffect(() => {
    setModalStartDay(String(cycleStartDay));
    setModalEndDay(cycleEndDay !== null ? String(cycleEndDay) : "");
  }, [cycleStartDay, cycleEndDay]);

  const activeCycle = useMemo(
    () => getCycleWindow(new Date(), cycleStartDay, cycleEndDay),
    [cycleStartDay, cycleEndDay],
  );
  const fmtDayMonth = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
  const fmtDayMonthYear = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
  const fmtMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d);
  const activeCycleRangeText = `${fmtDayMonth(activeCycle.start)} – ${fmtDayMonthYear(activeCycle.end)}`;

  const from = range.startDate;
  const to = range.endDate;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [exp, hist] = await Promise.all([
          listExpenses(supabase, user.id, 0, {}, { field: "date", direction: "desc" }, 5000),
          listSettingsHistory(supabase, user.id).catch(() => []),
        ]);
        if (!cancelled) {
          setRows(exp.rows);
          setSettingsHistory(hist);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const itemsInRange = useMemo(
    () => rows.filter((e) => e.date >= from && e.date <= to),
    [rows, from, to],
  );

  const monthlyBudget = useBudget();
  useEffect(() => {
    setBudgetInput(monthlyBudget && monthlyBudget > 0 ? String(Math.round(monthlyBudget)) : "");
  }, [monthlyBudget]);

  const sumBucket = useCallback(
    (fromISO: string, toISOStr: string) => {
      let income = 0;
      let expense = 0;
      for (const r of rows) {
        if (r.date < fromISO || r.date > toISOStr) continue;
        const v = convert(r);
        if (r.type === "income") income += v;
        else expense += v;
      }
      return { income, expense, net: income - expense };
    },
    [rows, convert],
  );

  // Budget conversion at a bucket's end date (mobile rateResolver.convert
  // parity) — snapshot rates cached per currency+date.
  const rateCache = useRef(new Map<string, number | null>());
  const convertBudgetAt = useCallback(
    async (amount: number, fromCur: string, dateISO: string): Promise<number> => {
      if (fromCur === currency) return amount;
      const key = `${fromCur}:${dateISO}`;
      let fromRate = rateCache.current.get(key);
      if (fromRate === undefined) {
        try {
          fromRate = (await getRateSnapshot(supabase, fromCur, dateISO)).exchange_rate_to_usd;
        } catch {
          fromRate = null;
        }
        rateCache.current.set(key, fromRate);
      }
      const dispKey = `${currency}:${dateISO}`;
      let dispRate = rateCache.current.get(dispKey);
      if (dispRate === undefined) {
        try {
          dispRate = (await getRateSnapshot(supabase, currency, dateISO)).exchange_rate_to_usd;
        } catch {
          dispRate = null;
        }
        rateCache.current.set(dispKey, dispRate);
      }
      return fromRate && dispRate ? (amount * fromRate) / dispRate : amount;
    },
    [currency, supabase],
  );

  // Budget active during a bucket (profile monthly_budget converted at the
  // bucket's end date — mobile buildCalendarMonthRows parity).
  const rawBudget = profile?.monthly_budget ?? 0;
  const budgetCurrency = (profile?.budget_currency || profile?.preferred_currency || "NPR").toUpperCase();

  // ── Settings periods (ascending, with the 1900 calendar default baseline) ──
  const settingsPeriods = useMemo<SettingsPeriod[]>(() => {
    const asc = [...settingsHistory].reverse();
    if (asc.length > 0) {
      const first = asc[0];
      return [
        {
          effective_from: "1900-01-01",
          monthly_budget: first.monthly_budget,
          budget_currency: first.budget_currency,
          cycle_start_day: 1,
          cycle_end_day: null,
        },
        ...asc.map((h) => ({
          effective_from: h.effective_from,
          monthly_budget: h.monthly_budget,
          budget_currency: h.budget_currency,
          cycle_start_day: h.cycle_start_day,
          cycle_end_day: h.cycle_end_day,
        })),
      ];
    }
    return [
      {
        effective_from: "1900-01-01",
        monthly_budget: profile?.monthly_budget ?? null,
        budget_currency: profile?.budget_currency,
        cycle_start_day: cycleStartDay,
        cycle_end_day: cycleEndDay,
      },
    ];
  }, [settingsHistory, profile?.monthly_budget, profile?.budget_currency, cycleStartDay, cycleEndDay]);

  // ── Calendar month rows (Month by Month, default cycle) ──
  const buildCalendarMonthRows = useCallback(
    (rangeStartISO: string, rangeEndISO: string): MonthRow[] => {
      if (!rangeStartISO || !rangeEndISO || rangeStartISO > rangeEndISO) return [];
      const rangeStart = parseISO(rangeStartISO);
      const rangeEnd = parseISO(rangeEndISO);
      if (rangeStart > rangeEnd) return [];
      const out: MonthRow[] = [];
      let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (cursor <= rangeEnd) {
        const cStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const cEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        if (cStart > rangeEnd) break;
        if (cEnd >= rangeStart && cEnd >= cStart) {
          const bucketFrom = cStart > rangeStart ? cStart : rangeStart;
          const bucketTo = cEnd < rangeEnd ? cEnd : rangeEnd;
          const f = toISODate(bucketFrom);
          const tt = toISODate(bucketTo);
          const s = sumBucket(f, tt);
          out.push({
            key: tt,
            label: `${fmtMonth(cEnd)} ${cEnd.getFullYear()}`,
            from: f,
            to: tt,
            ...s,
            budget: null,
          });
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sumBucket],
  );

  // ── Paycheck cycle rows (Month by Month, custom cycle) ──
  const buildPaycheckCycleRows = useCallback(
    (rangeStartISO: string, rangeEndISO: string): MonthRow[] => {
      if (!rangeStartISO || !rangeEndISO || rangeStartISO > rangeEndISO) return [];
      const rangeStart = parseISO(rangeStartISO);
      const rangeEnd = parseISO(rangeEndISO);
      if (rangeStart > rangeEnd) return [];

      const getCycleStartForDate = (date: Date, p: SettingsPeriod) => {
        if (date.getDate() >= p.cycle_start_day) return safeMonthDate(date.getFullYear(), date.getMonth(), p.cycle_start_day);
        return safeMonthDate(date.getFullYear(), date.getMonth() - 1, p.cycle_start_day);
      };
      const getCycleEndForDate = (cycleStart: Date, p: SettingsPeriod) => {
        if (p.cycle_end_day !== null && p.cycle_end_day >= 1 && p.cycle_end_day <= 31) {
          const nextMonth = p.cycle_end_day < p.cycle_start_day;
          return safeMonthDate(
            cycleStart.getFullYear() + (nextMonth && cycleStart.getMonth() === 11 ? 1 : 0),
            nextMonth ? (cycleStart.getMonth() + 1) % 12 : cycleStart.getMonth(),
            p.cycle_end_day,
          );
        }
        const nextStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, p.cycle_start_day);
        return new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
      };
      const getNextCycleStart = (cycleStart: Date, p: SettingsPeriod) => {
        // Cycles are MONTHLY: the next one always starts on the same
        // day-of-month of the FOLLOWING month. The old branch advanced only
        // when endDay < startDay, so any fixed end day >= start day (e.g.
        // 1st→25th from "Pick on Calendar") returned the SAME date — the
        // while-loop below never advanced and froze the page. (APK had the
        // identical bug; both fixed 2026-09-15.)
        return safeMonthDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, p.cycle_start_day);
      };

      const rowsOut: MonthRow[] = [];
      settingsPeriods.forEach((period, idx) => {
        const periodStart = parseISO(period.effective_from);
        const nextPeriodStart =
          idx + 1 < settingsPeriods.length ? parseISO(settingsPeriods[idx + 1].effective_from) : null;
        const periodEnd = nextPeriodStart
          ? new Date(nextPeriodStart.getFullYear(), nextPeriodStart.getMonth(), nextPeriodStart.getDate() - 1)
          : rangeEnd;
        if (periodStart > rangeEnd) return;
        const segStart = periodStart > rangeStart ? periodStart : rangeStart;
        const segEnd = periodEnd < rangeEnd ? periodEnd : rangeEnd;
        if (segStart > segEnd) return;
        let cycleStart = getCycleStartForDate(segStart, period);
        if (cycleStart < periodStart) cycleStart = getCycleStartForDate(periodStart, period);
        while (cycleStart <= segEnd) {
          const cycleEnd = getCycleEndForDate(cycleStart, period);
          if (cycleStart > segEnd) break;
          const bucketFrom = cycleStart > segStart ? cycleStart : segStart;
          const bucketTo = cycleEnd < segEnd ? cycleEnd : segEnd;
          if (bucketFrom <= bucketTo) {
            const f = toISODate(bucketFrom);
            const tt = toISODate(bucketTo);
            const s = sumBucket(f, tt);
            rowsOut.push({
              key: tt,
              label: `${fmtDayMonth(cycleStart)} – ${fmtDayMonth(cycleEnd)}`,
              cycleKey: `${toISODate(cycleStart)}__${toISODate(cycleEnd)}`,
              from: f,
              to: tt,
              ...s,
              budget: null,
            });
          }
          const prevStart = new Date(cycleStart);
          cycleStart = getNextCycleStart(cycleStart, period);
          // Non-advancing guard: a cycle must always move forward, whatever
          // the stored days say. Without this a corrupt config could spin.
          if (cycleStart <= prevStart) break;
        }
      });

      // Merge segments of the same unclipped cycle, newest first.
      const merged: MonthRow[] = [];
      for (const row of rowsOut) {
        const last = merged[merged.length - 1];
        if (last && row.cycleKey && row.cycleKey === last.cycleKey) {
          last.income += row.income;
          last.expense += row.expense;
          last.net += row.net;
          last.to = row.to;
          last.key = row.key;
          last.label = `${row.from.slice(8, 10)} ${fmtMonth(parseISO(row.from))} – ${row.to.slice(8, 10)} ${fmtMonth(parseISO(row.to))}`;
        } else {
          merged.push(row);
        }
      }
      return merged.reverse();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingsPeriods, sumBucket],
  );

  // ── Chart rows: calendar months + explicit custom-cycle replacement ──
  const buildChartRows = useCallback(
    (rangeStartISO: string, rangeEndISO: string): MonthRow[] => {
      if (!rangeStartISO || !rangeEndISO || rangeStartISO > rangeEndISO) return [];
      const rangeStart = parseISO(rangeStartISO);
      const rangeEnd = parseISO(rangeEndISO);
      if (rangeStart > rangeEnd) return [];

      const normalMonths: MonthRow[] = [];
      let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (cursor <= rangeEnd) {
        const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const bucketFrom = monthStart > rangeStart ? monthStart : rangeStart;
        const bucketTo = monthEnd < rangeEnd ? monthEnd : rangeEnd;
        if (bucketFrom <= bucketTo) {
          const f = toISODate(bucketFrom);
          const tt = toISODate(bucketTo);
          const s = sumBucket(f, tt);
          normalMonths.push({
            key: tt,
            label: fmtMonth(monthStart),
            from: f,
            to: tt,
            ...s,
            budget: null,
            isCustom: false,
          });
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }

      const getCycleStartContaining = (anchor: Date, startDay: number) => {
        if (anchor.getDate() >= startDay) return safeMonthDate(anchor.getFullYear(), anchor.getMonth(), startDay);
        return safeMonthDate(anchor.getFullYear(), anchor.getMonth() - 1, startDay);
      };
      const getCycleEnd = (cycleStart: Date, startDay: number, endDay: number | null) => {
        if (endDay !== null && endDay >= 1 && endDay <= 31) {
          const nextMonth = endDay < startDay;
          return safeMonthDate(
            cycleStart.getFullYear(),
            cycleStart.getMonth() + (nextMonth ? 1 : 0),
            endDay,
          );
        }
        const nextStart = safeMonthDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, startDay);
        return new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
      };

      const today = todayISO();
      type ExplicitCustom = { period: SettingsPeriod; cycleStart: Date; cycleEnd: Date };
      const explicitCustoms: ExplicitCustom[] = [];
      const realCustomSettings = settingsPeriods.filter(
        (p) => (p.cycle_start_day !== 1 || p.cycle_end_day !== null) && p.effective_from !== "1900-01-01",
      );
      if (realCustomSettings.length > 0) {
        realCustomSettings.forEach((period) => {
          const anchor = parseISO(period.effective_from);
          const cycleStart = getCycleStartContaining(anchor, period.cycle_start_day);
          const cycleEnd = getCycleEnd(cycleStart, period.cycle_start_day, period.cycle_end_day);
          if (cycleEnd >= rangeStart && cycleStart <= rangeEnd) explicitCustoms.push({ period, cycleStart, cycleEnd });
        });
      } else if (cycleStartDay !== 1 || cycleEndDay !== null) {
        const anchor = parseISO(today);
        const fallbackPeriod: SettingsPeriod = {
          effective_from: today,
          monthly_budget: profile?.monthly_budget ?? null,
          budget_currency: profile?.budget_currency,
          cycle_start_day: cycleStartDay,
          cycle_end_day: cycleEndDay,
        };
        const cycleStart = getCycleStartContaining(anchor, cycleStartDay);
        const cycleEnd = getCycleEnd(cycleStart, cycleStartDay, cycleEndDay);
        if (cycleEnd >= rangeStart && cycleStart <= rangeEnd) {
          explicitCustoms.push({ period: fallbackPeriod, cycleStart, cycleEnd });
        }
      }

      const finalRows = normalMonths.filter(
        (month) =>
          !explicitCustoms.some(
            (c) => !(month.to < toISODate(c.cycleStart) || month.from > toISODate(c.cycleEnd)),
          ),
      );
      explicitCustoms.forEach((custom) => {
        const dataFrom = custom.cycleStart > rangeStart ? custom.cycleStart : rangeStart;
        const dataTo = custom.cycleEnd < rangeEnd ? custom.cycleEnd : rangeEnd;
        if (dataFrom > dataTo) return;
        const f = toISODate(dataFrom);
        const tt = toISODate(dataTo);
        const s = sumBucket(f, tt);
        finalRows.push({
          key: `${toISODate(custom.cycleStart)}__${toISODate(custom.cycleEnd)}`,
          label: `${fmtDayMonth(custom.cycleStart)} – ${fmtDayMonth(custom.cycleEnd)}`,
          from: f,
          to: tt,
          ...s,
          budget: null,
          isCustom: true,
        });
      });
      return finalRows.sort((a, b) => a.from.localeCompare(b.from));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingsPeriods, sumBucket, cycleStartDay, cycleEndDay, profile?.monthly_budget, profile?.budget_currency],
  );

  const rawMonthRows = useMemo<MonthRow[]>(
    () =>
      (isDefaultCycle ? buildCalendarMonthRows(from, to) : buildPaycheckCycleRows(from, to)).filter(
        (r) => r.income > 0 || r.expense > 0,
      ),
    [isDefaultCycle, buildCalendarMonthRows, buildPaycheckCycleRows, from, to],
  );

  // Attach the in-force budget per row (mobile converts at the bucket end).
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const withBudget: MonthRow[] = [];
      for (const r of rawMonthRows) {
        let budget: number | null = null;
        if (rawBudget > 0) {
          budget = Math.round(await convertBudgetAt(rawBudget, budgetCurrency, r.to));
        }
        withBudget.push({ ...r, budget });
      }
      if (!cancelled) setMonthRows(withBudget);
    })();
    return () => {
      cancelled = true;
    };
  }, [rawMonthRows, rawBudget, budgetCurrency, convertBudgetAt]);

  useEffect(() => {
    setCurrentPage(1);
  }, [from, to, cycleStartDay, cycleEndDay]);
  useEffect(() => {
    setSelectedChartIdx(null);
  }, [from, to]);

  const rangeChartRows = useMemo(() => buildChartRows(from, to), [buildChartRows, from, to]);

  const totalPages = Math.ceil(monthRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedMonthRows = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return monthRows.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [monthRows, currentPage]);

  const hasData = itemsInRange.length > 0;
  const totalIncome = useMemo(() => itemsInRange.reduce((s, r) => (r.type === "income" ? s + convert(r) : s), 0), [itemsInRange, convert]);
  const totalExpense = useMemo(() => itemsInRange.reduce((s, r) => (r.type === "income" ? s : s + convert(r)), 0), [itemsInRange, convert]);
  const netResult = totalIncome - totalExpense;
  const isProfit = netResult >= 0;
  const overallSavingsRate = totalIncome > 0 ? Math.round((netResult / totalIncome) * 100) : 0;

  const money = (n: number) => mask(formatMoney(n, currency, locale));

  // "At today's rate" counterpart of the period totals (self-hiding line).
  const plTodayTotals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const r of itemsInRange) {
      const v = convertToday(r);
      if (v == null) return null;
      if (r.type === "income") inc += v;
      else exp += v;
    }
    return { income: inc, expense: exp };
  }, [itemsInRange, convertToday]);

  // ── Cycle window change — always confirmed first (warning dialog states
  // exactly what changes and what stays untouched) ──
  const [pendingCycle, setPendingCycle] = useState<{ start: number; end: number | null } | null>(null);

  const handleSetCycleWindow = (startDay: number, endDay: number | null) => {
    if (startDay === cycleStartDay && endDay === cycleEndDay) return; // no change
    setPendingCycle({ start: startDay, end: endDay });
  };

  const commitCycleWindow = async () => {
    if (!pendingCycle) return;
    const { start: startDay, end: endDay } = pendingCycle;
    setPendingCycle(null);
    setUpdatingCycle(true);
    try {
      await saveProfile({ cycle_start_day: startDay, cycle_end_day: endDay });
      if (user) {
        await supabase.from("user_settings_history").insert({
          user_id: user.id,
          effective_from: todayISO(),
          monthly_budget: profile?.monthly_budget ?? null,
          cycle_start_day: startDay,
          cycle_end_day: endDay,
          budget_currency: profile?.budget_currency ?? null,
        });
      }
      await refreshProfile();
      const endLabel = endDay !== null ? `Day ${endDay}` : t("plCycleConfirmEndLast");
      showToast(t("plCycleUpdated").replace("{start}", String(startDay)).replace("{end}", endLabel));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setUpdatingCycle(false);
    }
  };

  const handleCalendarApply = (applied: { from: string | null; to: string | null }) => {
    if (!applied.from) {
      setCycleCalendarOpen(false);
      return;
    }
    if (cycleCalendarMode === "range") {
      const startDay = Number(applied.from.split("-")[2]);
      let endDay: number | null = null;
      if (applied.to) endDay = Number(applied.to.split("-")[2]);
      if (startDay >= 1 && startDay <= 31) {
        setModalStartDay(String(startDay));
        setModalEndDay(endDay !== null && endDay >= 1 && endDay <= 31 ? String(endDay) : "");
        void handleSetCycleWindow(startDay, endDay);
      }
    } else if (cycleCalendarMode === "single-start") {
      const startDay = Number(applied.from.split("-")[2]);
      if (startDay >= 1 && startDay <= 31) {
        setModalStartDay(String(startDay));
        void handleSetCycleWindow(startDay, cycleEndDay);
      }
    } else {
      const endDay = Number(applied.from.split("-")[2]);
      if (endDay >= 1 && endDay <= 31) {
        setModalEndDay(String(endDay));
        void handleSetCycleWindow(cycleStartDay, endDay);
      }
    }
    setCycleCalendarOpen(false);
  };

  // ── Budget save (mobile handleSaveBudget) ──
  const handleSaveBudget = async () => {
    setSavingBudget(true);
    try {
      const numeric = budgetInput.trim() ? Number(budgetInput.replace(/[^0-9.]/g, "")) : null;
      await saveProfile({
        monthly_budget: numeric,
        budget_currency: numeric ? currency : null,
      });
      if (user) {
        await supabase.from("user_settings_history").insert({
          user_id: user.id,
          effective_from: todayISO(),
          monthly_budget: numeric,
          cycle_start_day: cycleStartDay,
          cycle_end_day: cycleEndDay,
          budget_currency: numeric ? currency : null,
        });
      }
      if (user) await resetAlertHistory(supabase, user.id);
      await refreshProfile();
      showToast(numeric ? t("plBudgetSaved").replace("{amount}", formatMoney(numeric, currency, locale)) : t("plBudgetCleared"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setSavingBudget(false);
    }
  };

  // ── Live cycle window preview (mobile modalCyclePreview) ──
  const modalCyclePreview = useMemo(() => {
    const startNum = Number(modalStartDay.trim());
    if (!modalStartDay.trim() || !startNum || startNum < 1 || startNum > 31) {
      return { isValid: false, rangeText: "", days: 0, isShort: false };
    }
    const endTrim = modalEndDay.trim();
    const endNum = endTrim ? Number(endTrim) : null;
    if (endNum !== null && (!endNum || endNum < 1 || endNum > 31)) {
      return { isValid: false, rangeText: "", days: 0, isShort: false };
    }
    try {
      const win = getCycleWindow(new Date(), startNum, endNum);
      const days =
        Math.round((win.end.getTime() - win.start.getTime()) / 86_400_000) + 1;
      return {
        isValid: true,
        rangeText: `${fmtDayMonth(win.start)} – ${fmtDayMonthYear(win.end)}`,
        days,
        isShort: endNum !== null && days < 28,
      };
    } catch {
      return { isValid: false, rangeText: "", days: 0, isShort: false };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalStartDay, modalEndDay]);

  return (
    <main className="mx-auto w-full max-w-[560px] space-y-4 p-0.5">
      {/* ── 1. HEADER ── */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface-elevated text-text transition active:opacity-70"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div>
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.6px] text-text-muted">
            {t("pl_subtitle")}
          </p>
          <h1 className="text-[28px] font-extrabold leading-[34px] text-text">{t("pl_title")}</h1>
        </div>
      </div>

      {/* ── 2. DATE RANGE PICKER ── */}
      <button
        onClick={() => setCalendarOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-surface p-3.5 text-left transition active:opacity-85"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sf-set-chip-teal)]">
          <CalendarDays size={18} className="text-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold text-text-muted">{t("plRangeFilter")}</span>
          <span className="block truncate text-[13.5px] font-bold text-text">
            {fmtDayMonthYear(parseISO(from))} — {fmtDayMonthYear(parseISO(to))}
          </span>
        </span>
        <span className="shrink-0 text-xs font-extrabold text-primary">{t("pl_change")}</span>
      </button>

      {/* ── 3. PERIOD PERFORMANCE FLOW CHART ── */}
      <StockChartCard
        rows={rangeChartRows}
        mode={chartViewMode}
        onMode={setChartViewMode}
        selected={selectedChartIdx}
        onSelect={setSelectedChartIdx}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        netResult={netResult}
        isProfit={isProfit}
        overallSavingsRate={overallSavingsRate}
        money={money}
        todayLine={<TodayRateLine frozen={{ income: totalIncome, expense: totalExpense }} today={plTodayTotals} fmt={money} />}
        t={t}
      />

      {/* ── 4. MONTHLY BUDGET ── */}
      <section className="panel space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[13px] font-extrabold text-text">
            <Wallet size={16} className="shrink-0 text-primary" aria-hidden />
            {t("pl_monthly_budget")}
          </p>
          <p className="text-[11px] text-text-muted">
            {t("plCycle")}: {cycleLabel}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            inputMode="numeric"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={monthlyBudget && monthlyBudget > 0 ? String(Math.round(monthlyBudget)) : "e.g. 14000"}
            aria-label={t("pl_monthly_budget")}
            className="h-12 min-w-0 flex-1 rounded-[10px] border-[1.5px] border-border bg-surface-elevated px-3.5 text-base font-bold text-text outline-none placeholder:font-normal placeholder:text-text-muted focus:border-primary"
          />
          <button
            onClick={() => void handleSaveBudget()}
            disabled={savingBudget}
            className="h-12 shrink-0 rounded-[10px] bg-primary px-3.5 text-[12.5px] font-extrabold text-white transition active:opacity-85 disabled:opacity-85"
          >
            {savingBudget ? t("common_saving") : t("pl_set_budget")}
          </button>
        </div>
      </section>

      {/* ── 4B. PAYCHECK & BUDGET CYCLE ── */}
      <section className="panel space-y-3.5 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sf-set-chip-green)]">
              <Calendar size={18} className="text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold leading-[18px] text-text">
                {t("plCycleCardTitle")}
              </p>
              <p className="truncate text-[11px] leading-[14px] text-text-muted">
                {t("plCycleCardSub")}
              </p>
            </div>
          </div>
          {activeCycleRangeText && (
            <span className="max-w-[45%] shrink-0 truncate rounded-lg bg-[var(--sf-set-chip-green)] px-2 py-1 text-right text-[11px] font-extrabold text-primary">
              {t("plActiveBadge").replace("{range}", activeCycleRangeText)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCycleCalendarMode("range");
              setCycleCalendarOpen(true);
            }}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-2 text-xs font-extrabold text-white transition active:opacity-85"
          >
            <CalendarDays size={15} aria-hidden />
            <span className="truncate">{t("plPickCalendar")}</span>
          </button>
          <button
            onClick={() => {
              setModalStartDay(String(cycleStartDay));
              setModalEndDay(cycleEndDay !== null ? String(cycleEndDay) : "");
              setCycleSettingsOpen(true);
            }}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface-elevated px-2 text-xs font-bold text-text transition active:opacity-85"
          >
            <Sliders size={15} aria-hidden />
            <span className="truncate">{t("plConfigureDays")}</span>
          </button>
        </div>
      </section>

      {/* ── 5. MONTH BY MONTH ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-text">{t("pl_month_by_month")}</p>
          {monthRows.length > 0 && (
            <p className="text-[11px] font-bold text-text-muted">
              {monthRows.length === 1
                ? t("plCycleInRange")
                : t("plCyclesInRange").replace("{count}", String(monthRows.length))}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[150px] w-full rounded-[10px]" />
            ))}
          </div>
        ) : hasData ? (
          paginatedMonthRows.map((row) => <MonthRowCard key={row.key} row={row} money={money} t={t} />)
        ) : (
          <MobileEmptyState icon={Scale} title={t("pl_empty_title")} message={t("pl_empty_message")} />
        )}

        {monthRows.length > ITEMS_PER_PAGE && (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold text-text">
                {t("plPageOf").replace("{page}", String(currentPage)).replace("{total}", String(totalPages))}
              </p>
              <p className="truncate text-[11px] font-semibold text-text-muted">
                {t("plShowing")
                  .replace("{from}", String((currentPage - 1) * ITEMS_PER_PAGE + 1))
                  .replace("{to}", String(Math.min(currentPage * ITEMS_PER_PAGE, monthRows.length)))
                  .replace("{total}", String(monthRows.length))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => currentPage > 1 && setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2.5 py-[7px] text-[11.5px] font-extrabold text-text transition active:opacity-75 disabled:opacity-35"
              >
                <ChevronLeft size={14} aria-hidden />
                {t("plPrev")}
              </button>
              <button
                onClick={() => currentPage < totalPages && setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2.5 py-[7px] text-[11.5px] font-extrabold text-text transition active:opacity-75 disabled:opacity-35"
              >
                {t("plNext")}
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      <CalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        initial={{ from, to }}
        onApply={(r) => {
          if (r.from) setRange({ startDate: r.from, endDate: r.to || r.from });
          setCalendarOpen(false);
        }}
      />
      <CalendarModal
        open={cycleCalendarOpen}
        mode={cycleCalendarMode === "range" ? "range" : "single"}
        onClose={() => setCycleCalendarOpen(false)}
        initial={{ from: toISODate(activeCycle.start), to: toISODate(activeCycle.end) }}
        onApply={handleCalendarApply}
      />
      <CycleSettingsModal
        open={cycleSettingsOpen}
        onClose={() => setCycleSettingsOpen(false)}
        modalStartDay={modalStartDay}
        setModalStartDay={setModalStartDay}
        modalEndDay={modalEndDay}
        setModalEndDay={setModalEndDay}
        preview={modalCyclePreview}
        saving={updatingCycle}
        onSave={() => {
          const startNum = Number(modalStartDay.trim());
          if (!startNum || startNum < 1 || startNum > 31) {
            showToast(t("plInvalidStart"), "error");
            return;
          }
          let endNum: number | null = null;
          if (modalEndDay.trim()) {
            const parsedEnd = Number(modalEndDay.trim());
            if (parsedEnd >= 1 && parsedEnd <= 31) {
              endNum = parsedEnd;
            } else {
              showToast(t("plInvalidEnd"), "error");
              return;
            }
          }
          void handleSetCycleWindow(startNum, endNum);
          setCycleSettingsOpen(false);
        }}
        t={t}
      />
      <CycleConfirmDialog
        pending={pendingCycle}
        onCancel={() => setPendingCycle(null)}
        onConfirm={() => void commitCycleWindow()}
        t={t}
      />
    </main>
  );
}

/* ── pieces ── */

type T = (key: TranslationKey) => string;

function MonthRowCard({ row, money, t }: { row: MonthRow; money: (n: number) => string; t: T }) {
  const rowIsProfit = row.net >= 0;
  const peak = Math.max(row.income, row.expense, 1);
  const incomeWidth = Math.round((row.income / peak) * 100);
  const expenseWidth = Math.round((row.expense / peak) * 100);
  const savingsRate = row.income > 0 ? Math.round((row.net / row.income) * 100) : 0;
  return (
    <div className="space-y-3 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-bold text-text">{row.label}</p>
        <p
          className="shrink-0 text-sm font-extrabold"
          style={{ color: rowIsProfit ? "var(--sf-income)" : "var(--sf-danger)" }}
        >
          {rowIsProfit ? "+" : "−"}
          {money(Math.abs(row.net))}
        </p>
      </div>
      <div className="h-px bg-border" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <TrendingUp size={14} className="text-income" aria-hidden />
          <span className="text-[12.5px] font-semibold text-text-muted">{t("plIncomeShort")}</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span className="h-1 w-20 overflow-hidden rounded-sm bg-surface-elevated">
            <span className="block h-full bg-income" style={{ width: `${incomeWidth}%` }} />
          </span>
          <span className="numeric min-w-[90px] text-right text-[12.5px] font-bold text-income">
            {money(row.income)}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <TrendingDown size={14} className="text-danger" aria-hidden />
          <span className="text-[12.5px] font-semibold text-text-muted">{t("plExpenseShort")}</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span className="h-1 w-20 overflow-hidden rounded-sm bg-surface-elevated">
            <span className="block h-full bg-danger" style={{ width: `${expenseWidth}%` }} />
          </span>
          <span className="numeric min-w-[90px] text-right text-[12.5px] font-bold text-danger">
            {money(row.expense)}
          </span>
        </span>
      </div>
      {row.budget != null && row.budget > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Wallet size={14} className="text-primary" aria-hidden />
            <span className="text-[12.5px] font-semibold text-text-muted">{t("plBudgetShort")}</span>
          </span>
          <span
            className="numeric text-[12.5px] font-bold"
            style={{ color: row.expense > row.budget ? "var(--sf-danger)" : "var(--sf-text)" }}
          >
            {money(row.expense)} / {money(row.budget)} ({Math.min(Math.round((row.expense / row.budget) * 100), 999)}%)
          </span>
        </div>
      )}
      {row.income > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-[11.5px] font-semibold text-text-muted">{t("plSavingsRate")}</span>
          <span
            className="text-[11.5px] font-extrabold"
            style={{ color: rowIsProfit ? "var(--sf-income)" : "var(--sf-danger)" }}
          >
            {savingsRate}%
          </span>
        </div>
      )}
    </div>
  );
}

/** Mobile's executive stock-trend card: mode pills, tap-scrub HUD, SVG. */
function StockChartCard({
  rows,
  mode,
  onMode,
  selected,
  onSelect,
  totalIncome,
  totalExpense,
  netResult,
  isProfit,
  overallSavingsRate,
  money,
  todayLine,
  t,
}: {
  rows: MonthRow[];
  mode: ChartMode;
  onMode: (m: ChartMode) => void;
  selected: number | null;
  onSelect: (i: number | null) => void;
  totalIncome: number;
  totalExpense: number;
  netResult: number;
  isProfit: boolean;
  overallSavingsRate: number;
  money: (n: number) => string;
  todayLine?: ReactNode;
  t: T;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartW = Math.max(Math.min((width || 360) - 36, 480), 280);
  const chartH = 180;
  const padL = 12;
  const padR = 12;
  const padTop = 20;
  const padBot = 28;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padTop - padBot;

  const n = rows.length;
  const incomes = rows.map((r) => r.income);
  const expenses = rows.map((r) => r.expense);
  const nets = rows.map((r) => r.net);
  const allVals =
    mode === "income" ? incomes : mode === "expense" ? expenses : mode === "net" ? nets : [...incomes, ...expenses, ...nets];
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const valRange = Math.max(maxVal - minVal, 1);
  const toX = (i: number) => padL + (n <= 1 ? drawW / 2 : (i / (n - 1)) * drawW);
  const toY = (v: number) => padTop + ((maxVal - (Number.isFinite(v) ? v : 0)) / valRange) * drawH;
  const buildPath = (vals: number[]) => {
    if (vals.length === 0) return "";
    if (vals.length === 1) return `M ${padL},${toY(vals[0])} L ${padL + drawW},${toY(vals[0])}`;
    let d = `M ${toX(0)},${toY(vals[0])}`;
    for (let i = 0; i < vals.length - 1; i++) {
      const cpx = (toX(i) + toX(i + 1)) / 2;
      d += ` C ${cpx},${toY(vals[i])} ${cpx},${toY(vals[i + 1])} ${toX(i + 1)},${toY(vals[i + 1])}`;
    }
    return d;
  };
  const incPath = buildPath(incomes);
  const expPath = buildPath(expenses);
  const netPath = buildPath(nets);
  const areaOf = (p: string) => (p ? `${p} L ${toX(n - 1)},${chartH - padBot} L ${toX(0)},${chartH - padBot} Z` : "");
  const sel = selected != null && rows[selected] ? rows[selected] : null;
  const step = Math.ceil(n / 6) || 1;

  return (
    <section className="panel space-y-4 rounded-2xl p-[18px]">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-text">
            <TrendingUp size={18} className="shrink-0 text-primary" aria-hidden />
            <span className="truncate">{t("pl_summary")}</span>
          </p>
          {totalIncome > 0 && (
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold ${
                isProfit ? "bg-[var(--sf-set-chip-green)] text-income" : "bg-[var(--sf-set-danger-bg)] text-danger"
              }`}
            >
              {isProfit ? <TrendingUp size={10} className="mr-0.5 inline" aria-hidden /> : <TrendingDown size={10} className="mr-0.5 inline" aria-hidden />}
              {t("plSavingsBadge").replace("{pct}", String(overallSavingsRate))}
            </span>
          )}
        </div>
        <div className="scroll-x flex gap-1.5 overflow-x-auto py-0.5">
          {(
            [
              { m: "all", label: t("plChartAll") },
              { m: "income", label: t("plChartIncome") },
              { m: "expense", label: t("plChartExpense") },
              { m: "net", label: t("plChartNet") },
            ] as const
          ).map((tab) => {
            const active = mode === tab.m;
            return (
              <button
                key={tab.m}
                onClick={() => onMode(tab.m)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-[11.5px] transition active:opacity-85 ${
                  active
                    ? "border-primary bg-primary font-extrabold text-white"
                    : "border-border bg-surface-elevated font-semibold text-text"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {sel && (
        <div className="space-y-2 rounded-[10px] border border-primary bg-surface-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-extrabold text-text">{sel.label}</p>
            <p
              className="shrink-0 text-[11px] font-bold"
              style={{ color: sel.net >= 0 ? "var(--sf-income)" : "var(--sf-danger)" }}
            >
              {t("plSavingsPct").replace("{pct}", String(sel.income > 0 ? Math.round((sel.net / sel.income) * 100) : 0))}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex items-center gap-1 text-xs font-bold text-income">
              <TrendingUp size={12} aria-hidden />+{money(sel.income)}
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-danger">
              <TrendingDown size={12} aria-hidden />−{money(sel.expense)}
            </span>
            <span
              className="text-[12.5px] font-black"
              style={{ color: sel.net >= 0 ? "var(--sf-income)" : "var(--sf-danger)" }}
            >
              Net: {sel.net >= 0 ? "+" : "−"}
              {money(Math.abs(sel.net))}
            </span>
          </div>
        </div>
      )}

      {n > 0 && (
        <div ref={wrapRef} className="relative flex justify-center">
          {width > 0 && (
            <svg width={chartW} height={chartH} role="img" aria-label="Period performance chart">
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--sf-income)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--sf-income)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--sf-danger)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--sf-danger)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--sf-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--sf-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                <line
                  key={i}
                  x1={padL}
                  y1={padTop + ratio * drawH}
                  x2={chartW - padR}
                  y2={padTop + ratio * drawH}
                  stroke="var(--sf-border)"
                  strokeWidth={0.7}
                  strokeDasharray="4,4"
                  opacity={0.5}
                />
              ))}
              <line x1={padL} y1={toY(0)} x2={chartW - padR} y2={toY(0)} stroke="var(--sf-border)" strokeWidth={1.5} />
              {(mode === "all" || mode === "income") && areaOf(incPath) && (
                <path d={areaOf(incPath)} fill="url(#incGrad)" />
              )}
              {mode === "expense" && areaOf(expPath) && <path d={areaOf(expPath)} fill="url(#expGrad)" />}
              {mode === "net" && areaOf(netPath) && <path d={areaOf(netPath)} fill="url(#netGrad)" />}
              {(mode === "all" || mode === "income") && incPath && (
                <path d={incPath} fill="none" stroke="var(--sf-income)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {(mode === "all" || mode === "expense") && expPath && (
                <path d={expPath} fill="none" stroke="var(--sf-danger)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {(mode === "all" || mode === "net") && netPath && (
                <path
                  d={netPath}
                  fill="none"
                  stroke="var(--sf-primary)"
                  strokeWidth={mode === "net" ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={mode === "all" ? "5,4" : undefined}
                />
              )}
              {selected != null && (
                <>
                  <line
                    x1={toX(selected)}
                    y1={padTop}
                    x2={toX(selected)}
                    y2={chartH - padBot}
                    stroke="var(--sf-primary)"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  {(mode === "all" || mode === "income") && Number.isFinite(incomes[selected]) && (
                    <circle cx={toX(selected)} cy={toY(incomes[selected])} r={5} fill="#FFFFFF" stroke="var(--sf-income)" strokeWidth={2.5} />
                  )}
                  {(mode === "all" || mode === "expense") && Number.isFinite(expenses[selected]) && (
                    <circle cx={toX(selected)} cy={toY(expenses[selected])} r={5} fill="#FFFFFF" stroke="var(--sf-danger)" strokeWidth={2.5} />
                  )}
                  {(mode === "all" || mode === "net") && Number.isFinite(nets[selected]) && (
                    <circle cx={toX(selected)} cy={toY(nets[selected])} r={5} fill="#FFFFFF" stroke="var(--sf-primary)" strokeWidth={2.5} />
                  )}
                </>
              )}
              {rows.map((row, i) => {
                if (i % step !== 0 && i !== n - 1) return null;
                return (
                  <text
                    key={row.key}
                    x={toX(i)}
                    y={chartH - 8}
                    fontSize={9.5}
                    fill={selected === i ? "var(--sf-text)" : "var(--sf-text-muted)"}
                    textAnchor="middle"
                    fontWeight={selected === i ? 800 : 600}
                  >
                    {row.label}
                  </text>
                );
              })}
              {rows.map((row, i) => (
                <rect
                  key={row.key}
                  x={toX(i) - drawW / Math.max(n - 1, 1) / 2}
                  y={0}
                  width={drawW / Math.max(n - 1, 1)}
                  height={chartH}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelect(selected === i ? null : i)}
                />
              ))}
            </svg>
          )}
        </div>
      )}

      <div className="h-px bg-border" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TrendingUp size={15} className="shrink-0 text-income" aria-hidden />
          <span className="truncate text-[13px] font-semibold text-text-muted">{t("pl_income")}</span>
        </span>
        <span className="numeric shrink-0 text-sm font-extrabold text-income">{money(totalIncome)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TrendingDown size={15} className="shrink-0 text-danger" aria-hidden />
          <span className="truncate text-[13px] font-semibold text-text-muted">{t("pl_expense")}</span>
        </span>
        <span className="numeric shrink-0 text-sm font-extrabold text-danger">{money(totalExpense)}</span>
      </div>
      {todayLine}
      <div className="h-px bg-border" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-extrabold text-text">{isProfit ? t("pl_profit") : t("pl_loss")}</span>
        <span
          className="numeric text-[17px] font-black"
          style={{ color: isProfit ? "var(--sf-income)" : "var(--sf-danger)" }}
        >
          {isProfit ? "+" : "−"}
          {money(Math.abs(netResult))}
        </span>
      </div>
    </section>
  );
}

/** Mobile Paycheck Cycle Settings dialog. */
function CycleSettingsModal({
  open,
  onClose,
  modalStartDay,
  setModalStartDay,
  modalEndDay,
  setModalEndDay,
  preview,
  saving,
  onSave,
  t,
}: {
  open: boolean;
  onClose: () => void;
  modalStartDay: string;
  setModalStartDay: (v: string) => void;
  modalEndDay: string;
  setModalEndDay: (v: string) => void;
  preview: { isValid: boolean; rangeText: string; days: number; isShort: boolean };
  saving: boolean;
  onSave: () => void;
  t: T;
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

  const presets = [
    { start: "1", end: "", label: t("plPresetDefault") },
    ...[25, 28, 29, 30, 31].map((n) => ({
      start: String(n),
      end: "",
      label: t("plPresetNth").replace("{n}", String(n)),
    })),
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/[0.65] p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("plCycleSettingsTitle")}
        className="sf-pop max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_10px_20px_rgb(0_0_0/0.3)]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sf-set-chip-green)]">
              <Sliders size={18} className="text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-text">{t("plCycleSettingsTitle")}</p>
              <p className="text-[11.5px] text-text-muted">{t("plCycleSettingsSub")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-elevated text-text-muted transition active:opacity-70"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="my-4 h-px bg-border" aria-hidden />

        <div className="space-y-2">
          <p className="text-[11.5px] font-bold uppercase text-text-muted">{t("plQuickPresets")}</p>
          <div className="scroll-x flex gap-2 overflow-x-auto py-0.5">
            {presets.map((preset) => {
              const active = modalStartDay === preset.start && modalEndDay === preset.end;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setModalStartDay(preset.start);
                    setModalEndDay(preset.end);
                  }}
                  className={`shrink-0 rounded-md border px-3 py-2 text-xs transition active:opacity-85 ${
                    active
                      ? "border-primary bg-primary font-extrabold text-white"
                      : "border-border bg-surface-elevated font-semibold text-text"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-bold text-text">{t("plStartDayLabel")}</span>
            <input
              inputMode="numeric"
              maxLength={2}
              value={modalStartDay}
              onChange={(e) => setModalStartDay(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={t("plStartPlaceholder")}
              className="h-[46px] w-full rounded-[10px] border-[1.5px] border-border bg-surface-elevated px-3.5 text-[15px] font-bold text-text outline-none placeholder:font-normal placeholder:text-text-muted"
            />
          </label>
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-bold text-text">{t("plEndDayLabel")}</span>
            <input
              inputMode="numeric"
              maxLength={2}
              value={modalEndDay}
              onChange={(e) => setModalEndDay(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={t("plEndAutoPlaceholder")}
              className="h-[46px] w-full rounded-[10px] border-[1.5px] border-border bg-surface-elevated px-3.5 text-[15px] font-bold text-text outline-none placeholder:font-normal placeholder:text-text-muted"
            />
          </label>
        </div>

        <p className="mt-3 text-[11px] leading-[15px] text-text-muted">{t("plEndBlankHint")}</p>

        {preview.isValid ? (
          <div
            className={`mt-3 space-y-[3px] rounded-[10px] border px-3.5 py-2.5 ${
              preview.isShort
                ? "border-danger bg-[#fef2f2] dark:bg-[rgb(239_68_68/0.12)]"
                : "border-primary bg-[#ecfdf5] dark:bg-[rgb(16_185_129/0.10)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-text-muted">
                {t("pl_cycle_preview")}
              </span>
              <span className="text-[11.5px] font-bold text-text-muted">{preview.days}d</span>
            </div>
            <p className={`text-[15.5px] font-extrabold ${preview.isShort ? "text-danger" : "text-text"}`}>
              {preview.rangeText}
            </p>
            {preview.isShort && (
              <p className="text-[10.5px] font-semibold leading-[14px] text-danger">
                {t("pl_cycle_short_warning")}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[11px] italic text-text-muted">{t("pl_cycle_preview_hint")}</p>
        )}

        <div className="mt-4 flex gap-2.5 pt-1">
          <button
            onClick={onClose}
            className="h-[46px] min-w-0 flex-1 rounded-[10px] border border-border bg-surface-elevated text-[13px] font-bold text-text transition active:opacity-85"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex h-[46px] min-w-0 flex-[1.5] items-center justify-center gap-2 rounded-[10px] bg-primary text-[13px] font-extrabold text-white transition active:opacity-85 disabled:opacity-85"
          >
            {saving && (
              <span aria-hidden className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {saving ? t("common_saving") : t("plSaveCycle")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Cycle-change warning: before any paycheck-cycle save (from Configure Days
 * or Pick on Calendar) the user sees exactly what changes (future grouping
 * only) and what can never change (recorded transactions, dates, amounts,
 * past months — the settings trail keeps old cycles as they were).
 */
function CycleConfirmDialog({
  pending,
  onCancel,
  onConfirm,
  t,
}: {
  pending: { start: number; end: number | null } | null;
  onCancel: () => void;
  onConfirm: () => void;
  t: T;
}) {
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  if (!pending || typeof document === "undefined") return null;

  const endLabel = pending.end === null ? t("plCycleConfirmEndLast") : `Day ${pending.end}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/[0.65] p-5"
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={t("plCycleConfirmTitle")}
        className="sf-pop w-full max-w-[420px] rounded-2xl border border-border bg-surface p-5 shadow-[0_10px_20px_rgb(0_0_0/0.3)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[var(--sf-set-chip-gold-line)] bg-[var(--sf-set-chip-gold)]">
            <AlertTriangle size={18} className="text-hue-amber" aria-hidden />
          </span>
          <p className="text-base font-extrabold text-text">{t("plCycleConfirmTitle")}</p>
        </div>

        <div className="mt-4 space-y-2.5">
          <p className="flex items-start gap-2 text-[13px] font-bold leading-[18px] text-text">
            <CalendarDays size={15} className="mt-[2px] shrink-0 text-primary" aria-hidden />
            <span>
              {t("plCycleConfirmNew")
                .replace("{start}", String(pending.start))
                .replace("{end}", endLabel)}
            </span>
          </p>
          <p className="flex items-start gap-2 text-[12.5px] leading-[17px] text-text-muted">
            <Clock size={14} className="mt-[2px] shrink-0 text-income" aria-hidden />
            <span>{t("plCycleConfirmPast")}</span>
          </p>
          <p className="flex items-start gap-2 text-[12.5px] leading-[17px] text-text-muted">
            <ShieldCheck size={14} className="mt-[2px] shrink-0 text-income" aria-hidden />
            <span>{t("plCycleConfirmSafe")}</span>
          </p>
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="h-[46px] min-w-0 flex-1 rounded-[10px] border border-border bg-surface-elevated text-[13px] font-bold text-text transition active:opacity-85"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="h-[46px] min-w-0 flex-1 rounded-[10px] bg-primary text-[13px] font-extrabold text-white transition active:opacity-85"
          >
            {t("plCycleConfirmYes")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
