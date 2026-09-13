"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { subscribeToExpenseChanges, useCategories } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { CashFlowHero } from "@/components/dashboard/CashFlowHero";
import { ExpenseRowItem } from "@/components/expense/ExpenseRowItem";
import { FlowChartCard } from "@/components/charts/FlowChartCard";
import { FitText } from "@/components/ui/FitText";
import { CategoryBars, type CategorySlice } from "@/components/charts/CategoryBars";
import { Panel, SectionTitle } from "@/components/ui/Card";
import { SkeletonCard, Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import {
  formatMoney,
  getCycleWindow,
  getPreviousCycleWindow,
  cycleDaysElapsed,
  cycleDaysTotal,
  cycleStatementNo,
  toISODate,
  todayISO,
} from "@/utils/format";
import { checkBudgetAlerts, checkCategoryAlerts } from "@/services/alerts";
import { useToast } from "@/store/ToastContext";
import { useBudget } from "@/hooks/useRates";

/**
 * Home — statement dashboard. Tier 1 masthead (net flow, inflow/outflow,
 * pace) → Tier 2 (cash-flow chart + budget account) → Tier 3 (spending
 * breakdown rules + recent entries).
 */
export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  // Full-dataset fetch: cycle totals must include EVERY entry in the window
  // (paginating at 15 dropped the oldest rows — e.g. the Aug 31 salary).
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [loading, setLoading] = useState(true);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const { categories } = useCategories(user?.id);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
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
        if (!cancelled) setRows(fresh);
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
    for (const row of rows) {
      if (row.date < startISO || row.date > endISO) continue;
      entriesInCycle += 1;
      const converted = convert(row);
      if (row.type === "income") income += converted;
      else {
        spent += converted;
        if (row.date === todayStr) todayTotal += converted;
      }
    }
    return { spent, income, todayTotal, entriesInCycle, net: income - spent };
  }, [rows, cycle, convert]);

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
    const byCategory = new Map<string, CategorySlice>();
    const startISO = toISODate(cycle.start);
    for (const row of rows) {
      if (row.type !== "expense" || row.date < startISO) continue;
      const name = row.categories?.name ?? "Other";
      const color = row.categories?.color ?? "#8B978F";
      const slice = byCategory.get(name) ?? { label: name, value: 0, color };
      slice.value += convert(row);
      byCategory.set(name, slice);
    }
    return Array.from(byCategory.values()).sort((a, b) => b.value - a.value);
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

  if (authLoading || (loading && rows.length === 0)) {
    return (
      <main className="mx-auto w-full max-w-[1200px]">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-44 w-full" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SkeletonCard lines={6} />
          </div>
          <SkeletonCard lines={4} />
        </div>
      </main>
    );
  }

  const cycleLabel = `${formatShort(cycle.start, locale)} – ${formatShort(cycle.end, locale)}`;

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">
            {greeting},{" "}
            <span className="font-bold text-text">{profile?.display_name ?? "there"}</span>
          </p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">
            Overview
            <CurrencyFlag currency={displayCurrency} size={20} className="ml-2 align-[-3px]" />
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <PrivacyEyeButton />
          <ThemeToggle />
        </div>
      </header>

      {/* Tier 1 — statement masthead */}
      <CashFlowHero
        net={stats.net}
        income={stats.income}
        expense={stats.spent}
        todayTotal={stats.todayTotal}
        budget={budget}
        pace={pace}
        formatted={fmt}
        cycleLabel={cycleLabel}
        todayLabel={t("today")}
        delta={prevDelta}
        entries={stats.entriesInCycle}
        statementNo={cycleStatementNo(cycle)}
      />

      {/* Tier 2 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FlowChartCard label="Cash flow" />
        </div>

        <Panel label={t("monthlyBudget")}>
          <BudgetAccount
            budget={budget}
            spent={stats.spent}
            remaining={budget != null ? budget - stats.spent : null}
            pace={pace}
            formatted={fmt}
            cycleLabel={cycleLabel}
          />
        </Panel>
      </div>

      {/* Tier 3 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel label="Spending by category">
          <div className="p-5">
            {categorySlices.length > 0 ? (
              <CategoryBars
                slices={categorySlices}
                totalValue={fmt(stats.spent)}
                totalLabel={t("spent")}
                formatValue={fmt}
              />
            ) : (
              <p className="border border-dashed border-border px-3 py-8 text-center">
                <span className="caps">No spending this cycle</span>
              </p>
            )}
          </div>
        </Panel>

        <Panel
          label={t("recentActivity")}
          className="lg:col-span-2"
          action={
            <Link href="/history" className="caps !text-primary hover:underline">
              {t("viewAll")}
            </Link>
          }
        >
          <div className="p-5">
            {rows.length === 0 ? (
              <EmptyState
                title={t("noTransactions")}
                message={t("noTransactionsHint")}
                action={
                  <Link href="/expense/new">
                    <Button>Add first entry</Button>
                  </Link>
                }
              />
            ) : (
              <div>
                {rows.slice(0, 7).map((row) => (
                  <ExpenseRowItem
                    key={row.id}
                    row={row}
                    amount={fmt(convert(row))}
                    note={[
                      row.categories?.name,
                      row.payment_method,
                      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                        new Date(`${row.date}T00:00:00`),
                      ),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    showBadge={row.currency !== displayCurrency}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}

/** Budget ledger account: figure, rule rows, pace rule with day tick. */
function BudgetAccount({
  budget,
  spent,
  remaining,
  pace,
  formatted,
  cycleLabel,
}: {
  budget: number | null;
  spent: number;
  remaining: number | null;
  pace: {
    daysTotal: number;
    daysElapsed: number;
    spentPct: number;
    expectedPct: number | null;
    projected: number | null;
    onPace: boolean | null;
  };
  formatted: (n: number) => string;
  cycleLabel: string;
}) {
  if (budget == null) {
    return (
      <div className="p-5">
        <p className="border border-dashed border-border px-3 py-8 text-center">
          <span className="caps">
            No budget on file — set one in Profit &amp; Loss
          </span>
        </p>
      </div>
    );
  }
  const over = remaining != null && remaining < 0;
  return (
    <div className="flex flex-1 flex-col p-5">
      <div className="figures font-bold text-text">
        <FitText basePx={30} minPx={16}>{formatted(budget)}</FitText>
      </div>
      <p className="mt-1 text-xs text-text-muted">{cycleLabel}</p>

      <div className="mt-4 border-t border-border">
        <LedgerRow label="Spent" value={formatted(spent)} valueClass="text-danger" />
        <LedgerRow
          label={over ? "Over by" : "Remaining"}
          value={formatted(Math.abs(remaining ?? 0))}
          valueClass={over ? "text-danger" : "text-income"}
        />
        <LedgerRow
          label="Projected close"
          value={pace.projected != null ? formatted(pace.projected) : "—"}
          valueClass={pace.onPace === false ? "text-danger" : "text-income"}
        />
      </div>

      <div className="mt-auto pt-4">
        <div className="relative h-1 w-full bg-surface-elevated">
          <div
            className={`h-full ${over ? "bg-danger" : "bg-primary"}`}
            style={{ width: `${Math.min(Math.round(pace.spentPct * 100), 100)}%` }}
          />
          {pace.expectedPct != null && (
            <div
              className="absolute top-[-2px] h-[9px] w-px bg-text"
              style={{ left: `${Math.min(Math.round(pace.expectedPct * 100), 100)}%` }}
              aria-hidden
            />
          )}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Day {pace.daysElapsed} of {pace.daysTotal} ·{" "}
          {pace.onPace == null ? "—" : pace.onPace ? "on pace" : "ahead of calendar"}
        </p>
      </div>
    </div>
  );
}

function LedgerRow({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`numeric text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatShort(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}
