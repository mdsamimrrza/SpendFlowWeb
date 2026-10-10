"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { ArrowDown, ChevronRight, Layers, Plus, Repeat } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { cacheExpenses, getCachedExpenses, listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { MoneyPulseHero } from "@/components/dashboard/MoneyPulseHero";
import { BudgetPanel } from "@/components/dashboard/BudgetPanel";
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
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import {
  formatMoney,
  getCycleWindow,
  getPreviousCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  toISODate,
  todayISO,
  formatDisplayName,
} from "@/utils/format";
import { checkBudgetAlerts, checkCategoryAlerts } from "@/services/alerts";
import { useToast } from "@/store/ToastContext";
import { useBudget } from "@/hooks/useRates";

/**
 * Home - market-pattern money dashboard (Monarch / Simplifi style), rebuilt
 * 2026-10-11. KPI band (Net / Inflow / Outflow / Savings rate, Fraunces
 * figures) -> bills strip -> cash-flow chart beside the budget-pacing card
 * -> recent feed beside the spending-mix + daily-rhythm insight column.
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
  const { convert, convertFrozen } = useRowConverter(profile?.preferred_currency, rows);
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

  // "At transaction-date rates" debugger counterpart of the hero totals: the
  // headline is LIVE for the active month; this frozen pair cross-checks the
  // historical value (line self-hides when the two bases agree — see
  // TodayRateLine).
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
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-text sm:text-[28px]">
            {greeting},{" "}
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
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 sm:flex">
            <CurrencyFlag currency={displayCurrency} size={16} />
            <span className="whitespace-nowrap text-[12.5px] font-medium text-text-muted">{cycleLabel}</span>
          </span>
          <Link
            href="/expense/new"
            aria-label={t("addTransaction")}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-strong active:scale-[0.98]"
          >
            <Plus size={17} />
            <span className="hidden sm:inline">{t("addTransaction")}</span>
          </Link>
        </div>
      </header>

      {/* KPI band - Net / Inflow / Outflow / Savings rate (Fraunces figures) */}
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
        footer={<TodayRateLine
          live={{ income: stats.income, expense: stats.spent }}
          frozen={frozenTotals}
          fmt={fmt}
        />}
      />

      {/* Bills due strip: pay_on_due plans with an open slot, one-tap Mark
          Paid — renders nothing until a slot is actually open. */}
      <div className="mt-4">
        <BillsDueStrip />
      </div>

      {/* Tier 2/3 — one grid so every breakpoint stays filled: flow (full
          row) + mix list & heat grid (paired) at md; flow + mix on top, then
          rhythm (⅓) beside the recent feed (⅔) at lg — the compact heat grid
          never stretches across dead space. Budget pacing lives in the hero. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <FlowChartCard label={t("cashFlow")} />
        </div>

        {/* Budget pacing — the market-style budget card (ring + pace meter +
            allowance rows), beside the chart on desktop. */}
        <Panel className="min-w-0">
          <BudgetPanel
            budget={budget}
            spent={stats.spent}
            income={stats.income}
            pace={pace}
            formatted={fmt}
            cycleLabel={cycleLabel}
            labels={{
              budgetOnFile: t("monthlyBudget"),
              spent: t("spent"),
              remaining: t("remaining"),
              overBy: t("homeOverBy"),
              projectedClose: t("homeProjectedClose"),
              dailyAllowance: t("homeAvgDaily"),
              savingsRate: t("homeSavingsRate"),
              noBudgetTitle: t("homeNoBudgetTitle"),
              noBudgetBody: t("homeNoBudgetBody"),
              setBudget: t("homeSetBudget"),
              day: t("homeDayWord"),
              of: t("homeOfBudget"),
            }}
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
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

        {/* Daily rhythm — calendar heat grid (intensity per day). */}
        <Panel label={t("homeDailyRhythm")} className="min-w-0">
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

        </div>

        {/* Recent entries: date-grouped feed, beside the insight column. */}
        <section className="min-w-0 lg:col-span-2">
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
                className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-semibold text-text-muted transition-colors hover:border-faint hover:text-text"
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
