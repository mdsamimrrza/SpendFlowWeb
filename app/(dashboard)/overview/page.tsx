"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import {
  ArrowDown,
  ChevronRight,
  Coffee,
  Layers,
  Plus,
  Repeat,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { cacheExpenses, getCachedExpenses, listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { MoneyPulseHero } from "@/components/dashboard/MoneyPulseHero";
import { QuickStatTiles, type QuickStat } from "@/components/dashboard/QuickStatTiles";
import { BillsDueStrip } from "@/components/dashboard/BillsDueStrip";
import { RecentFeed } from "@/components/dashboard/RecentFeed";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import type { ExpenseRow } from "@/services/expenses";
import { FlowChartCard } from "@/components/charts/FlowChartCard";
import type { CategorySlice } from "@/components/charts/CategoryBars";
import { SpendingMix } from "@/components/dashboard/SpendingMix";
import { DailyHeat } from "@/components/dashboard/DailyHeat";
import { Panel, SectionTitle } from "@/components/ui/Card";
import { SkeletonCard, Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { CurrencyBreakdown, type CurrencyPart } from "@/components/ui/CurrencyBreakdown";
import {
  formatMoney,
  currencyTotals,
  getCycleWindow,
  getPreviousCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  toISODate,
  todayISO,
} from "@/utils/format";
import { checkBudgetAlerts, checkCategoryAlerts } from "@/services/alerts";
import { useToast } from "@/store/ToastContext";
import { useBudget } from "@/hooks/useRates";

/**
 * Home — mobile-first money dashboard (modern fintech layout). Tier 1:
 * Money Pulse hero (net + delta chip, budget ring with remaining/projected,
 * inflow/outflow split) → quick-stat tiles → cash-flow chart + ranked
 * spending-mix list → daily-rhythm heat grid → recent entries.
 * All aggregation mirrors the mobile statement logic (cycle-scoped totals,
 * FX-converted rows, previous-cycle delta).
 */
export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  // Full-dataset fetch: cycle totals must include EVERY entry in the window
  // (paginating at 15 dropped the oldest rows — e.g. the Aug 31 salary).
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [selected, setSelected] = useState<ExpenseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const { categories } = useCategories(user?.id);
  const supabase = getSupabaseBrowserClient();

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
    // Reset loading when user changes so the skeleton shows while fetching
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

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = useMemo(
    () => (n: number) => mask(formatMoney(n, displayCurrency, locale)),
    [displayCurrency, locale, mask],
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
    let entriesInCycle = 0;
    const spentRows: ExpenseRow[] = [];
    const incomeRows: ExpenseRow[] = [];
    for (const row of rows) {
      if (row.date < startISO || row.date > endISO) continue;
      entriesInCycle += 1;
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
    return { spent, income, todayTotal, entriesInCycle, net: income - spent, spentRows, incomeRows };
  }, [rows, cycle, convert]);

  // Currency-consistency (user request 2026-09-16): merged totals keep their
  // raw per-currency parts visible; converted values go through the same
  // masked fmt as every other figure on the screen.
  const toParts = (rowsIn: ExpenseRow[]): CurrencyPart[] =>
    currencyTotals(rowsIn, convert).map((p) => ({
      currency: p.currency,
      rawText: mask(formatMoney(p.raw, p.currency, locale)),
      convertedText:
        p.currency.toUpperCase() === String(displayCurrency).toUpperCase()
          ? undefined
          : fmt(p.converted),
    }));
  const spentParts = useMemo(() => toParts(stats.spentRows), [stats.spentRows, convert, locale, mask, fmt, displayCurrency]);
  const incomeParts = useMemo(() => toParts(stats.incomeRows), [stats.incomeRows, convert, locale, mask, fmt, displayCurrency]);

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
    // True previous cycle: the cycle that ended the day before this one began
    // (re-derived from the start/end day rule — NOT a ms-span shift, which
    // lands on the wrong calendar days when months differ in length).
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

  const categorySlices = useMemo<CategorySlice[]>(() => {
    const byCategory = new Map<string, CategorySlice & { icon?: string }>();
    const startISO = toISODate(cycle.start);
    for (const row of rows) {
      if (row.type !== "expense" || row.date < startISO) continue;
      const name = row.categories?.name ?? "Other";
      const color = row.categories?.color ?? "var(--sf-faint)";
      const slice = byCategory.get(name) ?? { label: name, value: 0, color, icon: row.categories?.icon };
      slice.value += convert(row);
      byCategory.set(name, slice);
    }
    return Array.from(byCategory.values()).sort((a, b) => b.value - a.value);
  }, [rows, cycle, convert]);

  // Daily outflow across the cycle window (calendar day buckets) — feeds the
  // rhythm heat grid.
  const dailyDays = useMemo<{ iso: string; value: number }[]>(() => {
    const byDay = new Map<string, number>();
    const startISO = toISODate(cycle.start);
    const endISO = toISODate(cycle.end);
    for (const row of rows) {
      if (row.type !== "expense" || row.date < startISO || row.date > endISO) continue;
      byDay.set(row.date, (byDay.get(row.date) ?? 0) + convert(row));
    }
    const out: { iso: string; value: number }[] = [];
    const todayStr = todayISO();
    for (let d = new Date(cycle.start); toISODate(d) <= endISO; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d);
      if (iso > todayStr) break; // the cycle's future days stay unrendered
      out.push({ iso, value: byDay.get(iso) ?? 0 });
    }
    return out;
  }, [rows, cycle, convert]);

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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }, []);

  const dateLine = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(
        new Date(),
      ),
    [locale],
  );
  const quickStats = useMemo<QuickStat[]>(() => {
    const avgDaily = stats.spent / Math.max(pace.daysElapsed, 1);
    const savingsRate = stats.income > 0 ? Math.round(((stats.income - stats.spent) / stats.income) * 100) : null;
    const top = categorySlices[0];
    return [
      {
        key: "today",
        label: t("today"),
        value: fmt(stats.todayTotal),
        sub: t("homeTodaySpendSub"),
        icon: <Coffee size={15} />,
        tone: "primary",
      },
      {
        key: "avg",
        label: t("homeAvgDaily"),
        value: fmt(avgDaily),
        sub: `${pace.daysElapsed} ${t("homeDaysIn")}`,
        icon: <TrendingUp size={15} />,
        tone: "danger",
      },
      {
        key: "top",
        label: t("homeTopCategory"),
        value: top ? top.label : "—",
        sub: top ? fmt(top.value) : t("homeNoSpendYet"),
        icon: <Sparkles size={15} />,
        tone: top ? "brass" : "primary",
      },
      {
        key: "savings",
        label: t("homeSavingsRate"),
        value: savingsRate != null ? `${savingsRate}%` : "—",
        sub: t("homeKeptOfIncome"),
        icon: <Wallet size={15} />,
        tone: savingsRate != null && savingsRate >= 20 ? "income" : "info",
      },
    ];
  }, [stats, pace.daysElapsed, categorySlices, fmt, t]);

  const showSkeleton = authLoading || (loading && rows.length === 0);
  if (showSkeleton) {
    // Mirrors the loaded layout — no shift when data lands.
    return (
      <main className="mx-auto w-full max-w-[1200px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-8 w-60" />
          </div>
          <Skeleton className="h-11 w-11 !rounded-full" />
        </div>
        <SkeletonCard lines={7} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 md:col-span-2 lg:col-span-2">
            <SkeletonCard lines={8} />
          </div>
          <div className="min-w-0">
            <SkeletonCard lines={6} />
          </div>
          <div className="min-w-0">
            <SkeletonCard lines={6} />
          </div>
          <div className="min-w-0 md:col-span-2 lg:col-span-2">
            <SkeletonCard lines={8} />
          </div>
        </div>
      </main>
    );
  }

  const cycleLabel = `${formatShort(cycle.start, locale)} – ${formatShort(cycle.end, locale)}`;

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-faint">{dateLine}</p>
          <h1 className="mt-0.5 truncate text-2xl font-extrabold tracking-tight text-text sm:text-[28px]">
            {greeting}, {profile?.display_name ?? "there"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 shadow-soft sm:flex">
            <CurrencyFlag currency={displayCurrency} size={16} />
            <span className="caps whitespace-nowrap">{cycleLabel}</span>
          </span>
          <Link
            href="/expense/new"
            aria-label={t("addTransaction")}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-strong px-3.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-pop transition hover:brightness-110 active:scale-[0.97] sm:px-5"
          >
            <Plus size={17} />
            <span className="hidden sm:inline">{t("addTransaction")}</span>
          </Link>
        </div>
      </header>

      {/* Bills due strip (mobile §5): pay_on_due plans with an open slot,
          one-tap Mark Paid — renders nothing until a slot is actually open. */}
      <BillsDueStrip />

      {/* Tier 1 — Money Pulse hero: net + delta, budget ring, flow split */}
      <div className="mt-1">
        <MoneyPulseHero
          net={stats.net}
          income={stats.income}
          expense={stats.spent}
          todayTotal={stats.todayTotal}
          budget={budget}
          pace={pace}
          formatted={fmt}
          cycleLabel={cycleLabel}
          delta={prevDelta}
          entries={stats.entriesInCycle}
        />
        <div className="mt-1.5 flex flex-col gap-1">
          <CurrencyBreakdown label={t("expense")} parts={spentParts} className="px-1" />
          <CurrencyBreakdown label={t("income")} parts={incomeParts} className="px-1" />
        </div>
      </div>

      {/* Tier 1.5 — quick stats */}
      <div className="mt-4">
        <QuickStatTiles tiles={quickStats} />
      </div>

      {/* Tier 2/3 — one grid so every breakpoint stays filled: flow (full
          row) + mix list & heat grid (paired) at md; flow + mix on top, then
          rhythm (⅓) beside the recent feed (⅔) at lg — the compact heat grid
          never stretches across dead space. Budget pacing lives in the hero. */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 md:col-span-2 lg:col-span-2">
          <FlowChartCard label={t("cashFlow")} />
        </div>

        <Panel
          label={t("homeSpendingMix")}
          className="min-w-0"
          action={
            <Link href="/analytics" className="caps !text-primary hover:underline">
              {t("analytics")} <ArrowDown size={11} className="inline -translate-y-px" />
            </Link>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            {categorySlices.length > 0 ? (
              <SpendingMix
                slices={categorySlices}
                formatValue={fmt}
                otherLabel={t("analyticsOther")}
                cycleTotalLabel={t("homeCycleOutflow")}
              />
            ) : (
              <p className="border border-dashed border-border px-3 py-8 text-center">
                <span className="caps">{t("homeNoSpendCycle")}</span>
              </p>
            )}
          </div>
        </Panel>

        {/* Daily rhythm — calendar heat grid (intensity per day). self-start:
            the card hugs its content instead of stretching to the taller
            recent-feed column and leaving a vertical dead band. */}
        <Panel label={t("homeDailyRhythm")} className="min-w-0 self-start md:col-span-1 lg:col-span-1">
          <div className="flex h-full flex-col p-4 sm:p-5">
            {dailyDays.length > 0 ? (
              <DailyHeat
                days={dailyDays}
                locale={locale}
                formatValue={fmt}
                todayISO={todayISO()}
                onDayTap={(iso) => {
                  window.location.href = `/history?from=${iso}&to=${iso}`;
                }}
                labels={{
                  less: t("homeHeatLess"),
                  more: t("homeHeatMore"),
                  busiest: t("cfBusiest"),
                }}
              />
            ) : (
              <p className="border border-dashed border-border px-3 py-8 text-center">
                <span className="caps">{t("homeNoSpendCycle")}</span>
              </p>
            )}
            <p className="mt-auto flex items-center gap-1.5 pt-3 text-[11px] text-faint">
              <Repeat size={12} aria-hidden />
              {t("homeTapDayHint")}
            </p>
          </div>
        </Panel>

        {/* Tier 4 — recent entries: date-grouped fintech feed, beside the
            heat grid at lg so the row never leaves a dead column. */}
        <section className="min-w-0 md:col-span-2 lg:col-span-2">
        <SectionTitle
          action={
            <Link href="/history" className="caps !text-primary hover:underline">
              {t("viewAll")}
            </Link>
          }
        >
          {t("recentActivity")}
        </SectionTitle>
        {rows.length === 0 ? (
          <Panel>
            <div className="p-3 sm:p-5">
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
          </Panel>
        ) : (
          <>
            <RecentFeed
              rows={rows}
              amountFor={(r) => fmt(convert(r))}
              displayCurrency={displayCurrency}
              locale={locale}
              onOpen={setSelected}
              max={8}
              labels={{ today: t("today"), yesterday: t("homeYesterday") }}
            />
            {/* Thumb-reach escape hatch to the full register. */}
            {rows.length > 8 && (
              <Link
                href="/history"
                className="mt-3 flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition hover:border-primary hover:text-primary active:scale-[0.99]"
              >
                <Layers size={14} aria-hidden />
                {t("viewAll")} — {rows.length} {t("homeEntriesWord")}
                <ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </>
        )}
        </section>
      </div>

      <ExpenseDetailSheet
        row={selected}
        amount={selected ? fmt(convert(selected)) : ""}
        displayCurrency={displayCurrency}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}

function formatShort(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}
