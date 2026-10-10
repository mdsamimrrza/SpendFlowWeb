"use client";

/**
 * Cycle report — opened by tapping a Month-by-Month card on /profit-loss
 * (?from=&to=, inclusive both ends). One financial cycle at a glance:
 * summary hero, the daily stock-flow graph, the category mix donut, and the
 * cycle's full transaction register paginated 10 per page. Mobile mirror:
 * APK app/cycle-report.tsx.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Flame,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter } from "@/hooks/useRates";
import { listExpenses } from "@/services/expenses";
import { listSettingsHistory } from "@/services/settingsHistory";
import { getRateSnapshot } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, formatShortDate, toISODate } from "@/utils/format";
import { TrendChart } from "@/components/charts/TrendChart";
import type { TrendPoint } from "@/components/charts/TrendChart";
import { SpendingMix, type MixSlice } from "@/components/dashboard/SpendingMix";
import { FitText } from "@/components/ui/FitText";
import { MobileEmptyState } from "@/components/ui/MobileChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import { categoryGlyph } from "@/components/ui/Glyph";
import { VIBRANT_PALETTE } from "@/components/analytics/AnalyticsStatement";

const PAGE_SIZE = 10;

const parseISO = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export default function CycleReportPage() {
  // Suspense boundary required: useSearchParams opts the page out of static
  // prerendering, and the shell must stay renderable while params resolve.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-[560px] p-0.5"><Skeleton className="h-[420px] w-full rounded-2xl" /></main>}>
      <CycleReportInner />
    </Suspense>
  );
}

function CycleReportInner() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Router-sourced params: window.location.search is stale during client-side
  // navigation (router.push), which made every tap land on the invalid branch.
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const currency = profile?.preferred_currency ?? "NPR";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listSettingsHistory>>>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);

  useEffect(() => {
    if (!user || !valid) {
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
          setHistory(hist);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase, valid]);

  const itemsInRange = useMemo(
    () => rows.filter((e) => e.date >= from && e.date <= to),
    [rows, from, to],
  );

  const totalIncome = useMemo(
    () => itemsInRange.reduce((s, r) => (r.type === "income" ? s + convert(r) : s), 0),
    [itemsInRange, convert],
  );
  const totalExpense = useMemo(
    () => itemsInRange.reduce((s, r) => (r.type === "income" ? s : s + convert(r)), 0),
    [itemsInRange, convert],
  );
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;

  // One converted pass per row; the graph and donut read from these maps.
  const converted = useMemo(
    () => itemsInRange.map((r) => ({ date: r.date, income: r.type === "income" ? convert(r) : 0, expense: r.type === "income" ? 0 : convert(r) })),
    [itemsInRange, convert],
  );

  // Daily buckets over the cycle — per-DAY values (the line height IS that
  // day's figure, matching the tooltip; no cumulative plateaus), the same
  // daily-basis logic the dashboard's cash-flow card plots.
  const dailyPoints = useMemo<TrendPoint[]>(() => {
    if (!valid) return [];
    const byDay = new Map<string, { income: number; expense: number }>();
    for (const c of converted) {
      const day = byDay.get(c.date) ?? { income: 0, expense: 0 };
      day.income += c.income;
      day.expense += c.expense;
      byDay.set(c.date, day);
    }
    const out: TrendPoint[] = [];
    for (let d = parseISO(from); d <= parseISO(to); d.setDate(d.getDate() + 1)) {
      const key = toISODate(d);
      const day = byDay.get(key) ?? { income: 0, expense: 0 };
      out.push({ date: key, ...day });
    }
    return out;
  }, [converted, from, to, valid]);

  // Card insights — same trio the dashboard's cash-flow card shows.
  const insights = useMemo(() => {
    let busiest: TrendPoint | null = null;
    let activeDays = 0;
    for (const p of dailyPoints) {
      if (!busiest || p.expense > busiest.expense) busiest = p;
      if (p.income + p.expense > 0) activeDays += 1;
    }
    return {
      busiest: busiest && busiest.expense > 0 ? busiest : null,
      activeDays,
      avgOutflow: totalExpense / (dailyPoints.length || 1),
    };
  }, [dailyPoints, totalExpense]);

  const slices = useMemo<MixSlice[]>(() => {
    const byCat = new Map<string, { value: number; icon?: string; color?: string }>();
    for (const r of itemsInRange) {
      if (r.type === "income") continue;
      const name = r.categories?.name ?? "Other";
      const entry = byCat.get(name) ?? {
        value: 0,
        icon: r.categories?.icon ?? undefined,
        color: r.categories?.color ?? undefined,
      };
      entry.value += convert(r);
      byCat.set(name, entry);
    }
    return Array.from(byCat.entries())
      .map(([label, v], i) => ({
        label,
        value: v.value,
        icon: v.icon,
        color: v.color || VIBRANT_PALETTE[i % VIBRANT_PALETTE.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [itemsInRange, convert]);

  // Budget IN FORCE for this cycle (newest settings row effective on/before
  // the cycle end), converted at the end date — never today's figure
  // retro-projected onto a past cycle.
  const rawBudget = profile?.monthly_budget ?? 0;
  const budgetCurrency = (profile?.budget_currency || profile?.preferred_currency || "NPR").toUpperCase();
  const [budget, setBudget] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!valid) {
        setBudget(null);
        return;
      }
      // history arrives effective_from-desc: first row on/before `to` is in force.
      const inForce = history.find((h) => h.effective_from <= to);
      const amount = inForce ? inForce.monthly_budget : rawBudget;
      const cur = (inForce?.budget_currency || budgetCurrency).toUpperCase();
      if (!amount || amount <= 0) {
        if (!cancelled) setBudget(null);
        return;
      }
      if (cur === currency) {
        if (!cancelled) setBudget(Math.round(amount));
        return;
      }
      try {
        const [fromRate, dispRate] = await Promise.all([
          getRateSnapshot(supabase, cur, to),
          getRateSnapshot(supabase, currency, to),
        ]);
        if (!cancelled && fromRate && dispRate) {
          setBudget(Math.round((amount * fromRate.exchange_rate_to_usd) / dispRate.exchange_rate_to_usd));
        }
      } catch {
        if (!cancelled) setBudget(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [history, rawBudget, budgetCurrency, currency, supabase, to, valid]);

  // Paginated register, newest first, grouped by day.
  const sorted = useMemo(
    () =>
      [...itemsInRange].sort((a, b) =>
        a.date === b.date ? (b.time ?? "").localeCompare(a.time ?? "") : b.date.localeCompare(a.date),
      ),
    [itemsInRange],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );
  const dayGroups = useMemo(() => {
    const groups: { date: string; rows: typeof pageRows }[] = [];
    for (const r of pageRows) {
      const last = groups[groups.length - 1];
      if (last && last.date === r.date) last.rows.push(r);
      else groups.push({ date: r.date, rows: [r] });
    }
    return groups;
  }, [pageRows]);

  useEffect(() => {
    setPage(1);
  }, [from, to]);

  const money = (n: number) => mask(formatMoney(n, currency, locale));
  const rangeLabel = useMemo(() => {
    if (!valid) return "";
    const f = parseISO(from);
    const tt = parseISO(to);
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
    return `${fmt(f)} – ${fmt(tt)} ${tt.getFullYear()}`;
  }, [from, to, valid]);

  if (!valid) {
    return (
      <main className="mx-auto w-full max-w-[560px] space-y-4 p-0.5">
        <MobileEmptyState icon={Scale} title={t("plCycleReportTitle")} message={t("plCycleEmptyTx")} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[560px] space-y-4 p-0.5 lg:max-w-[1100px] lg:space-y-5">
      {/* ── STATEMENT MASTHEAD — the page's one bold element ── */}
      <section className="rounded-2xl border border-border bg-surface shadow-soft">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => router.back()}
                aria-label="Back"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface-elevated text-text transition active:opacity-70"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <div className="min-w-0">
                <p className="caps !text-primary-strong">{t("plCycleReportTitle")}</p>
                <p className="text-[15px] font-extrabold leading-snug text-text">{rangeLabel}</p>
              </div>
            </div>
            <span
              className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold"
              style={{
                color: savingsRate >= 0 ? "var(--sf-income)" : "var(--sf-danger)",
                borderColor: savingsRate >= 0 ? "color-mix(in srgb, var(--sf-income) 35%, transparent)" : "color-mix(in srgb, var(--sf-danger) 35%, transparent)",
              }}
            >
              {t("plSavingsRate")} {savingsRate}%
            </span>
          </div>

          <div className="mt-5 lg:flex lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0">
              <p className="caps text-faint">Net</p>
              <FitText basePx={44} minPx={26} className={`figures-display leading-tight ${net >= 0 ? "text-income" : "text-danger"}`} title={money(Math.abs(net))}>
                {net >= 0 ? "+" : "−"}
                {money(Math.abs(net))}
              </FitText>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 lg:mt-0 lg:w-[380px] lg:shrink-0">
              <div className="flex items-center justify-between gap-3 border-t border-primary/15 pt-2 lg:col-span-1">
                <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
                  <TrendingUp size={13} className="text-income" aria-hidden />
                  {t("plIncomeShort")}
                </dt>
                <dd className="numeric text-[13.5px] font-extrabold text-income">{money(totalIncome)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-primary/15 pt-2">
                <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
                  <TrendingDown size={13} className="text-danger" aria-hidden />
                  {t("plExpenseShort")}
                </dt>
                <dd className="numeric text-[13.5px] font-extrabold text-danger">{money(totalExpense)}</dd>
              </div>
              {budget != null && budget > 0 && (
                <div className="col-span-2 pt-1">
                  <div className="flex items-center justify-between text-[11.5px] font-semibold text-text-muted">
                    <span className="flex items-center gap-1.5">
                      <Wallet size={13} className="text-primary" aria-hidden />
                      {t("plBudgetShort")}
                    </span>
                    <span className="numeric font-bold" style={{ color: totalExpense > budget ? "var(--sf-danger)" : "var(--sf-text)" }}>
                      {money(totalExpense)} / {money(budget)} ({Math.min(Math.round((totalExpense / budget) * 100), 999)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((totalExpense / budget) * 100, 100)}%`,
                        backgroundColor: totalExpense > budget ? "var(--sf-danger)" : "var(--sf-primary, var(--sf-income))",
                      }}
                    />
                  </div>
                </div>
              )}
            </dl>
          </div>
        </div>
      </section>

      {/* ── CHART BAND: flow 3/5 + mix 2/5 on laptop, stacked on phones.
          Columns stretch to EQUAL height for any category count — SpendingMix
          spreads its rows evenly (justify-evenly) and pins its footer, and
          the flow card fills with the heat grid. ── */}
      <div className="space-y-4 lg:grid lg:grid-cols-5 lg:gap-4 lg:space-y-0">
        {/* ── DAILY FLOW — the dashboard's cash-flow stock graph over the cycle ── */}
        <section className="panel flex flex-col rounded-2xl p-4 lg:col-span-3">
        <p className="mb-2 text-sm font-extrabold text-text">{t("plCycleDailyFlow")}</p>
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-[10px]" />
        ) : (
          <>
          <div className="my-auto">
            <TrendChart points={dailyPoints} locale={locale} formatValue={money} floatingCard height={380} />
          </div>
            {/* Insights row: busiest day · avg outflow/day · active days */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {insights.busiest && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated px-3 py-1.5 text-[11.5px] text-faint">
                  <Flame size={12} className="text-brass" aria-hidden />
                  {t("cfBusiest")}{" "}
                  <span className="numeric font-bold text-text">
                    {formatShortDate(insights.busiest.date.slice(0, 10), locale)} · {money(insights.busiest.expense)}
                  </span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated px-3 py-1.5 text-[11.5px] text-faint">
                <CalendarClock size={12} className="text-primary" aria-hidden />
                {t("cfAvgOutflow")}{" "}
                <span className="numeric font-bold text-text">{money(insights.avgOutflow)}</span>
              </span>
              <span className="inline-flex items-center rounded-full bg-surface-elevated px-3 py-1.5 text-[11.5px] text-faint">
                <span className="numeric font-bold text-text">{insights.activeDays}</span>&nbsp;{t("cfActiveDays")}
              </span>
            </div>
          </>
        )}
      </section>

        {/* ── CATEGORY MIX ── */}
        <section className="panel flex flex-col rounded-2xl p-4 lg:col-span-2">
        <p className="mb-3 text-sm font-extrabold text-text">{t("plCycleCategoryMix")}</p>
        {slices.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="py-6 text-center text-[12.5px] font-semibold text-text-muted">{t("plCycleEmptyTx")}</p>
          </div>
        ) : (
          <SpendingMix
            slices={slices}
            formatValue={money}
            otherLabel={t("analyticsOther")}
            cycleTotalLabel={t("homeCycleOutflow")}
            compact
          />
        )}
        </section>
      </div>

      {/* ── TRANSACTION REGISTER ── */}
      <section className="panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-extrabold text-text">{t("plCycleTransactions")}</p>
          <p className="text-[11px] font-bold text-text-muted">
            {t("histPage")} {safePage} / {totalPages} · {sorted.length}
          </p>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] font-semibold text-text-muted">{t("plCycleEmptyTx")}</p>
        ) : (
          <div className="divide-y divide-border">
            {dayGroups.map((g) => {
              const dayNet = g.rows.reduce((s, r) => s + (r.type === "income" ? convert(r) : -convert(r)), 0);
              return (
                <div key={g.date} className="py-4 first:pt-1 last:pb-0">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="caps text-faint">{g.date}</p>
                    <p
                      className="numeric text-[11.5px] font-extrabold"
                      style={{ color: dayNet >= 0 ? "var(--sf-income)" : "var(--sf-danger)" }}
                    >
                      {dayNet >= 0 ? "+" : "−"}
                      {money(Math.abs(dayNet))}
                    </p>
                  </div>
                  {g.rows.map((r) => {
                    const Icon = categoryGlyph(r.categories?.icon);
                    const isIn = r.type === "income";
                    return (
                      <div
                        key={r.id}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated"
                      >
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-elevated"
                          style={{ color: r.categories?.color || "var(--sf-text-muted)" }}
                          aria-hidden
                        >
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-text">
                            {r.description || r.categories?.name || "—"}
                          </span>
                          <span className="block truncate text-[11px] font-semibold text-text-muted">
                            {r.categories?.name ?? "Other"}
                            {r.payment_method ? ` · ${r.payment_method}` : ""}
                          </span>
                        </span>
                        <span
                          className="numeric shrink-0 text-[13px] font-extrabold"
                          style={{ color: isIn ? "var(--sf-income)" : "var(--sf-danger)" }}
                        >
                          {isIn ? "+" : "−"}
                          {money(convert(r))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface-elevated px-3 text-[12px] font-extrabold text-text transition active:opacity-70 disabled:opacity-35"
                >
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <p className="text-[11.5px] font-bold text-text-muted">
                  {t("histPage")} {safePage} / {totalPages}
                </p>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface-elevated px-3 text-[12px] font-extrabold text-text transition active:opacity-70 disabled:opacity-35"
                >
                  <ChevronRight size={14} aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
