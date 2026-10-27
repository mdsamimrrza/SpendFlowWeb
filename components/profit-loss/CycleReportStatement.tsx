"use client";

/**
 * Cycle Report statement – the console-family redesign (2026-10-27, user:
 * "redesign whole cycle report page"). Deliberate web divergence from the APK
 * app/cycle-report.tsx (recorded in FEATURE-PARITY): console masthead + stat
 * card row + flow/mix band + day-grouped register, same data semantics as
 * before (daily flow buckets, in-force budget, 10/page register).
 *
 * Presentation-only: the page owns params/auth/fetch/budget-FX and hands down
 * rows + the resolved range; /preview/cycle-report renders this directly with
 * mocks (same seam pattern as HistoryRegister).
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Scale,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import type { ExpenseRow } from "@/services/expenses";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter } from "@/hooks/useRates";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { formatMoney, formatShortDate, toISODate } from "@/utils/format";
import { TrendChart } from "@/components/charts/TrendChart";
import type { TrendPoint } from "@/components/charts/TrendChart";
import { SpendingMix, type MixSlice } from "@/components/dashboard/SpendingMix";
import { FitText } from "@/components/ui/FitText";
import { Skeleton } from "@/components/ui/Skeleton";
import { VIBRANT_PALETTE } from "@/components/analytics/AnalyticsStatement";
import { SortHead, TxTableRow, RegisterRow, type SortKey } from "@/components/history/HistoryRegister";
import { FloatingSelect, SelectRow } from "@/components/ui/FloatingSelect";
import { SheetSelect } from "@/components/ui/SheetSelect";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";

const PAGE_SIZES = [10, 25, 50];

const parseISO = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export interface CycleReportStatementProps {
  loading: boolean;
  rows: ExpenseRow[];
  from: string;
  to: string;
  currency: string;
  /** Budget in force for this cycle, already converted to `currency`; null = none set. */
  budget: number | null;
  onBack: () => void;
}

export function CycleReportStatement({
  loading,
  rows,
  from,
  to,
  currency,
  budget,
  onBack,
}: CycleReportStatementProps) {
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [selected, setSelected] = useState<ExpenseRow | null>(null);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  // Register filters (History-parity): search + type/category/account/channel.
  const [search, setSearch] = useState("");
  const [flow, setFlow] = useState<"all" | "expense" | "income">("all");
  const [categoryId, setCategoryId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [method, setMethod] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toggleMenu = (key: string) => setOpenMenu((m) => (m === key ? null : key));
  useBodyScrollLock(filtersOpen);
  const { convert } = useRowConverter(currency, rows);

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
  const incomeCount = itemsInRange.filter((r) => r.type === "income").length;
  const expenseCount = itemsInRange.length - incomeCount;

  // One converted pass per row; the graph and donut read from these maps.
  const converted = useMemo(
    () =>
      itemsInRange.map((r) => ({
        date: r.date,
        income: r.type === "income" ? convert(r) : 0,
        expense: r.type === "income" ? 0 : convert(r),
      })),
    [itemsInRange, convert],
  );

  // Daily buckets over the cycle – per-DAY values (the line height IS that
  // day's figure, matching the tooltip), the dashboard cash-flow basis.
  const dailyPoints = useMemo<TrendPoint[]>(() => {
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
  }, [converted, from, to]);

  // Card insights – same trio the dashboard's cash-flow card shows.
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

  // Paginated register – History-register semantics: filters (search +
  // type/category/account/channel), header-click sort, 10/25/50 per page,
  // lg+ table / day-grouped touch list. Stats above stay cycle-wide.
  const railCategories = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of itemsInRange) if (r.categories) m.set(r.categories.id, r.categories.name);
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [itemsInRange]);

  const railAccounts = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of itemsInRange) if (r.bank_accounts) m.set(r.bank_accounts.id, r.bank_accounts.name);
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [itemsInRange]);

  const railMethods = useMemo(() => {
    const m = new Map<string, true>();
    for (const r of itemsInRange) if (r.payment_method) m.set(r.payment_method, true);
    return Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
  }, [itemsInRange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return itemsInRange.filter((r) => {
      if (flow !== "all" && r.type !== flow) return false;
      if (categoryId !== "all" && r.categories?.id !== categoryId) return false;
      if (accountId !== "all" && r.bank_accounts?.id !== accountId) return false;
      if (method !== "all" && r.payment_method !== method) return false;
      if (q) {
        const hay = `${r.description ?? ""} ${r.categories?.name ?? ""} ${r.payment_method ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itemsInRange, search, flow, categoryId, accountId, method]);

  const activeFilterCount =
    (flow !== "all" ? 1 : 0) + (categoryId !== "all" ? 1 : 0) + (accountId !== "all" ? 1 : 0) + (method !== "all" ? 1 : 0);
  const filterCount = activeFilterCount + (search.trim() ? 1 : 0);
  const resetAll = () => {
    setSearch("");
    setFlow("all");
    setCategoryId("all");
    setAccountId("all");
    setMethod("all");
    setFiltersOpen(false);
    setPage(1);
  };

  const amountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of itemsInRange) m.set(r.id, convert(r));
    return m;
  }, [itemsInRange, convert]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "date_asc":
        return arr.sort((a, b) =>
          a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date),
        );
      case "amount_desc":
        return arr.sort(
          (a, b) => (amountById.get(b.id) ?? 0) - (amountById.get(a.id) ?? 0) || b.date.localeCompare(a.date),
        );
      case "amount_asc":
        return arr.sort(
          (a, b) => (amountById.get(a.id) ?? 0) - (amountById.get(b.id) ?? 0) || b.date.localeCompare(a.date),
        );
      default:
        return arr.sort((a, b) =>
          a.date === b.date ? (b.time ?? "").localeCompare(a.time ?? "") : b.date.localeCompare(a.date),
        );
    }
  }, [filtered, sortKey, amountById]);

  const sortBy = (field: "date" | "amount") =>
    setSortKey((k) =>
      field === "date" ? (k === "date_desc" ? "date_asc" : "date_desc") : k === "amount_desc" ? "amount_asc" : "amount_desc",
    );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
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
  }, [from, to, sortKey, pageSize, search, flow, categoryId, accountId, method]);

  const money = (n: number) => mask(formatMoney(n, currency, locale));
  const bare = (n: number) => formatMoney(n, currency, locale).replace(/^[^\d]*/, "");
  const rangeLabel = useMemo(() => {
    const f = parseISO(from);
    const tt = parseISO(to);
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
    return `${fmt(f)} – ${fmt(tt)} ${tt.getFullYear()}`;
  }, [from, to]);

  const overBudget = budget != null && budget > 0 && totalExpense > budget;

  const SORT_LABELS: Record<SortKey, string> = {
    date_desc: t("sortNewest"),
    date_asc: t("sortOldest"),
    amount_desc: t("sortLargest"),
    amount_asc: t("sortSmallest"),
  };

  const typeControl = (
    <FloatingSelect
      className="relative w-full"
      label={flow === "all" ? t("histAllTypes") : flow === "expense" ? t("expense") : t("income")}
      open={openMenu === "type"}
      onToggle={() => toggleMenu("type")}
    >
      {(["all", "expense", "income"] as const).map((f) => (
        <SelectRow
          key={f}
          selected={flow === f}
          label={f === "all" ? t("histAllTypes") : f === "expense" ? t("expense") : t("income")}
          onSelect={() => {
            setFlow(f);
            setOpenMenu(null);
          }}
        />
      ))}
    </FloatingSelect>
  );

  const categoryControl = (
    <FloatingSelect
      className="relative w-full"
      label={categoryId === "all" ? t("histAllCategories") : railCategories.find((c) => c.value === categoryId)?.label ?? t("histAllCategories")}
      open={openMenu === "category"}
      onToggle={() => toggleMenu("category")}
      menuClassName="max-h-[240px] overflow-y-auto"
    >
      <SelectRow
        selected={categoryId === "all"}
        label={t("histAllCategories")}
        onSelect={() => {
          setCategoryId("all");
          setOpenMenu(null);
        }}
      />
      {railCategories.map((c) => (
        <SelectRow
          key={c.value}
          selected={categoryId === c.value}
          label={c.label}
          onSelect={() => {
            setCategoryId(c.value);
            setOpenMenu(null);
          }}
        />
      ))}
    </FloatingSelect>
  );

  const accountControl = (
    <FloatingSelect
      className="relative w-full"
      label={accountId === "all" ? t("histAllAccounts") : railAccounts.find((a) => a.value === accountId)?.label ?? t("histAllAccounts")}
      open={openMenu === "account"}
      onToggle={() => toggleMenu("account")}
      menuClassName="max-h-[240px] overflow-y-auto"
    >
      <SelectRow
        selected={accountId === "all"}
        label={t("histAllAccounts")}
        onSelect={() => {
          setAccountId("all");
          setOpenMenu(null);
        }}
      />
      {railAccounts.map((a) => (
        <SelectRow
          key={a.value}
          selected={accountId === a.value}
          label={a.label}
          onSelect={() => {
            setAccountId(a.value);
            setOpenMenu(null);
          }}
        />
      ))}
    </FloatingSelect>
  );

  const channelControl = (
    <FloatingSelect
      className="relative w-full"
      label={method === "all" ? t("histAllChannels") : method}
      open={openMenu === "channel"}
      onToggle={() => toggleMenu("channel")}
      menuClassName="max-h-[240px] overflow-y-auto"
    >
      <SelectRow
        selected={method === "all"}
        label={t("histAllChannels")}
        onSelect={() => {
          setMethod("all");
          setOpenMenu(null);
        }}
      />
      {railMethods.map((m) => (
        <SelectRow
          key={m}
          selected={method === m}
          label={m}
          onSelect={() => {
            setMethod(m);
            setOpenMenu(null);
          }}
        />
      ))}
    </FloatingSelect>
  );

  const sortControl = (
    <FloatingSelect
      className="relative w-full"
      label={SORT_LABELS[sortKey]}
      open={openMenu === "sort"}
      onToggle={() => toggleMenu("sort")}
    >
      {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
        <SelectRow
          key={k}
          selected={sortKey === k}
          label={SORT_LABELS[k]}
          onSelect={() => {
            setSortKey(k);
            setOpenMenu(null);
          }}
        />
      ))}
    </FloatingSelect>
  );

  return (
    <main className="mx-auto w-full max-w-[560px] space-y-5 p-0.5 lg:max-w-[1100px]">
      {/* ── CONSOLE MASTHEAD – chip pinned right at every width ── */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-muted transition hover:border-text-muted hover:text-text active:opacity-70"
          >
            <ChevronLeft size={17} aria-hidden />
          </button>
          <div className="min-w-0">
            <p className="caps text-faint">{t("pl_title")}</p>
            <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight text-text sm:text-[26px]">
              {t("plCycleReportTitle")}
            </h1>
            <p className="mt-0.5 truncate text-[12.5px] font-medium text-text-muted">
              <span className="numeric">{rangeLabel}</span> · {sorted.length} {t("plCycleTransactions").toLowerCase()}
            </p>
          </div>
        </div>
        <span
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-extrabold sm:px-3 sm:py-1.5 sm:text-[11.5px]"
          style={{
            color: savingsRate >= 0 ? "var(--sf-income)" : "var(--sf-danger)",
            borderColor:
              savingsRate >= 0
                ? "color-mix(in srgb, var(--sf-income) 35%, transparent)"
                : "color-mix(in srgb, var(--sf-danger) 35%, transparent)",
          }}
        >
          {savingsRate >= 0 ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
          {t("plSavingsRate")} {savingsRate >= 0 ? "+" : "−"}
          {Math.abs(savingsRate)}%
        </span>
      </header>

      {/* ── STAT ROW – 2×2 phones, 4-up desktop ── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Net – the hero figure */}
        <div className="panel rounded-xl p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="caps text-faint">{t("cfNet")}</p>
            <span
              className={`grid h-7 w-7 place-items-center rounded-lg ${net >= 0 ? "bg-income/10 text-income" : "bg-danger/10 text-danger"}`}
              aria-hidden
            >
              <Scale size={14} />
            </span>
          </div>
          <FitText
            basePx={24}
            minPx={17}
            className={`figures mt-2 font-extrabold leading-none ${net >= 0 ? "text-income" : "text-danger"}`}
            title={money(Math.abs(net))}
          >
            {net >= 0 ? "+" : "−"}
            {money(Math.abs(net))}
          </FitText>
          <p className="mt-1.5 truncate text-[11px] font-semibold text-text-muted">
            {t("plIncomeShort")} − {t("plExpenseShort")}
          </p>
        </div>

        {/* Income */}
        <div className="panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="caps text-faint">{t("plIncomeShort")}</p>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-income/10 text-income" aria-hidden>
              <ArrowUpToLine size={14} />
            </span>
          </div>
          <p className="numeric mt-2 text-[20px] font-extrabold leading-none text-income">{money(totalIncome)}</p>
          <p className="mt-1.5 truncate text-[11px] font-semibold text-text-muted">
            {incomeCount} {t("plCycleTransactions").toLowerCase()}
          </p>
        </div>

        {/* Expense */}
        <div className="panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="caps text-faint">{t("plExpenseShort")}</p>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-danger/10 text-danger" aria-hidden>
              <ArrowDownToLine size={14} />
            </span>
          </div>
          <p className="numeric mt-2 text-[20px] font-extrabold leading-none text-danger">{money(totalExpense)}</p>
          <p className="mt-1.5 truncate text-[11px] font-semibold text-text-muted">
            {expenseCount} {t("plCycleTransactions").toLowerCase()}
          </p>
        </div>

        {/* Budget – or active days when no budget is in force */}
        {budget != null && budget > 0 ? (
          <div className="panel flex flex-col rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="caps text-faint">{t("plBudgetShort")}</p>
              <span
                className={`grid h-7 w-7 place-items-center rounded-lg ${overBudget ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}`}
                aria-hidden
              >
                <Wallet size={14} />
              </span>
            </div>
            <p className="numeric mt-2 text-[20px] font-extrabold leading-none">
              <span style={{ color: overBudget ? "var(--sf-danger)" : "var(--sf-text)" }}>{money(totalExpense)}</span>
              <span className="text-[12.5px] font-bold text-text-muted"> / {money(budget)}</span>
            </p>
            <div className="mt-auto flex items-center gap-2 pt-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((totalExpense / budget) * 100, 100)}%`,
                    backgroundColor: overBudget ? "var(--sf-danger)" : "var(--sf-primary)",
                  }}
                />
              </div>
              <span
                className={`numeric shrink-0 text-[10.5px] font-extrabold ${overBudget ? "text-danger" : "text-text-muted"}`}
              >
                {Math.min(Math.round((totalExpense / budget) * 100), 999)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="panel rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="caps text-faint">{t("cfActiveDays")}</p>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                <CalendarClock size={14} />
              </span>
            </div>
            <p className="numeric mt-2 text-[20px] font-extrabold leading-none text-text">{insights.activeDays}</p>
            <p className="mt-1.5 truncate text-[11px] font-semibold text-text-muted">
              {t("cfAvgOutflow")} {money(insights.avgOutflow)}
            </p>
          </div>
        )}
      </section>

      {/* ── CHART BAND: flow 3/5 + mix 2/5 on desktop, stacked on phones ── */}
      <div className="space-y-4 lg:grid lg:grid-cols-5 lg:gap-4 lg:space-y-0">
        <section className="panel flex flex-col rounded-xl p-4 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-text">{t("plCycleDailyFlow")}</p>
            <p className="numeric truncate text-[11px] font-bold text-faint">{rangeLabel}</p>
          </div>
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-[10px]" />
          ) : (
            <>
              <TrendChart points={dailyPoints} locale={locale} formatValue={money} floatingCard height={320} />
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

        <section className="panel flex flex-col rounded-xl p-4 lg:col-span-2">
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

      {/* ── TRANSACTION REGISTER (History-register parity: filter row +
          lg+ sortable table, below-lg day-grouped touch list, 10/25/50
          pager). Filters scope the register only. ── */}
      <section className="panel rounded-xl p-4">
        {/* Filter row */}
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <div className="relative min-w-[180px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("histSearchAll")}
              aria-label={t("histSearchAll")}
              className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-8 text-xs text-text placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label={t("clear")}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* lg+: inline filter row */}
          <div className="hidden items-center gap-2 lg:flex">
            <span className="hidden items-center gap-1.5 text-xs text-text-muted">
              <SlidersHorizontal size={13} aria-hidden /> {t("histFilters")}:
            </span>
            <div className="w-[120px]">{typeControl}</div>
            <div className="w-[150px]">{categoryControl}</div>
            <div className="w-[140px]">{accountControl}</div>
            <div className="w-[130px]">{channelControl}</div>
            <div className="w-[140px]">{sortControl}</div>
          </div>

          {/* below lg: Filters toggle with active count */}
          <div className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                filtersOpen || activeFilterCount > 0
                  ? "border-primary bg-[var(--sf-primary-light)] text-primary"
                  : "border-border bg-surface text-text-muted hover:text-text"
              }`}
            >
              <SlidersHorizontal size={13} aria-hidden />
              {t("histFilters")}
              {activeFilterCount > 0 && (
                <span className="numeric grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-ink">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={13} aria-hidden className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {filterCount > 0 && (
            <button
              onClick={resetAll}
              className="flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors hover:bg-[var(--sf-tint-danger)]"
            >
              {t("clear")}
            </button>
          )}

          <span className="numeric ml-auto whitespace-nowrap text-[11px] font-semibold text-faint">
            {t("histShowing").replace("{n}", String(sorted.length))}
          </span>
        </div>

        {/* below lg: filter bottom sheet (HistoryRegister parity) */}
        {filtersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("histFilters")}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("clear")}
              onClick={() => setFiltersOpen(false)}
              className="absolute inset-0 cursor-default bg-black/40"
            />
            <div className="sf-sheet absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-surface">
              <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--sf-grab)]" />
              <div className="flex items-center justify-between px-4 pb-2 pt-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-text">{t("histFilters")}</p>
                  {activeFilterCount > 0 && (
                    <span className="numeric rounded-full bg-[var(--sf-primary-light)] px-2 py-0.5 text-[10px] font-bold text-primary">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label={t("clear")}
                  className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-surface-elevated"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-2">
                {/* Native selects in the sheet: the OS renders the option
                    list, so a dropdown can never nest a second scrollbar
                    inside the sheet's own scroll container. */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Type</p>
                    <SheetSelect
                      ariaLabel="Type"
                      value={flow}
                      onChange={(v) => setFlow(v as typeof flow)}
                      options={[
                        { value: "all", label: t("histAllTypes") },
                        { value: "expense", label: t("expense") },
                        { value: "income", label: t("income") },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Channel</p>
                    <SheetSelect
                      ariaLabel="Channel"
                      value={method}
                      onChange={setMethod}
                      options={[
                        { value: "all", label: t("histAllChannels") },
                        ...railMethods.map((m) => ({ value: m, label: m })),
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Category</p>
                  <SheetSelect
                    ariaLabel="Category"
                    value={categoryId}
                    onChange={setCategoryId}
                    options={[{ value: "all", label: t("histAllCategories") }, ...railCategories]}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Account</p>
                  <SheetSelect
                    ariaLabel="Account"
                    value={accountId}
                    onChange={setAccountId}
                    options={[{ value: "all", label: t("histAllAccounts") }, ...railAccounts]}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Sort by</p>
                  <SheetSelect
                    ariaLabel="Sort by"
                    value={sortKey}
                    onChange={(v) => setSortKey(v as SortKey)}
                    options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({
                      value: k,
                      label: SORT_LABELS[k],
                    }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border p-4">
                {filterCount > 0 ? (
                  <button
                    type="button"
                    onClick={resetAll}
                    className="flex h-10 items-center rounded-lg px-3 text-xs font-semibold text-danger transition-colors hover:bg-[var(--sf-tint-danger)]"
                  >
                    {t("clear")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-strong"
                >
                  {t("done")}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-text">{t("plCycleTransactions")}</p>
          <p className="numeric text-[11px] font-bold text-text-muted">
            {sorted.length} · {t("histPage")} {safePage}/{totalPages}
          </p>
        </div>
        {loading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] font-semibold text-text-muted">{t("plCycleEmptyTx")}</p>
        ) : (
          <>
            {/* lg+ ledger table */}
            <div className="hidden lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-faint">
                    <th className="py-3 pl-2 pr-4 font-semibold">
                      <SortHead label={t("histColDate")} field="date" sortKey={sortKey} onSort={sortBy} />
                    </th>
                    <th className="py-3 px-4 font-semibold">{t("histColMerchant")}</th>
                    <th className="py-3 px-4 font-semibold">{t("histColCategory")}</th>
                    <th className="py-3 px-4 font-semibold">{t("histColAccount")}</th>
                    <th className="py-3 pl-4 pr-2 text-right font-semibold">
                      <SortHead label={t("histColAmount")} field="amount" sortKey={sortKey} onSort={sortBy} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((r) => (
                    <TxTableRow
                      key={r.id}
                      row={r}
                      amount={bare(convert(r))}
                      original={r.currency !== currency ? mask(formatMoney(r.amount, r.currency, locale)) : null}
                      locale={locale}
                      editLabel={t("editExpense")}
                      onOpen={() => setSelected(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Below lg: day-grouped touch list */}
            <div className="lg:hidden">
              <div className="divide-y divide-border">
                {dayGroups.map((g) => {
                  const dayNet = g.rows.reduce((s, r) => s + (r.type === "income" ? convert(r) : -convert(r)), 0);
                  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(parseISO(g.date));
                  return (
                    <div key={g.date} className="py-3.5 first:pt-2 last:pb-0">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="numeric rounded-lg border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-extrabold text-text">
                            {formatShortDate(g.date.slice(0, 10), locale)}
                          </span>
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{weekday}</span>
                        </span>
                        <span
                          className="numeric text-[11.5px] font-extrabold"
                          style={{ color: dayNet >= 0 ? "var(--sf-income)" : "var(--sf-danger)" }}
                        >
                          {dayNet >= 0 ? "+" : "−"}
                          {money(Math.abs(dayNet))}
                        </span>
                      </div>
                      {g.rows.map((r) => (
                        <RegisterRow
                          key={r.id}
                          row={r}
                          amount={bare(convert(r))}
                          original={r.currency !== currency ? mask(formatMoney(r.amount, r.currency, locale)) : null}
                          locale={locale}
                          editLabel={t("editExpense")}
                          onOpen={() => setSelected(r)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pager footer */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-[11px] text-faint">{t("histPerPage")}:</span>
                <FloatingSelect
                  className="relative w-[74px]"
                  label={String(pageSize)}
                  open={pageSizeOpen}
                  onToggle={() => setPageSizeOpen((o) => !o)}
                >
                  {PAGE_SIZES.map((n) => (
                    <SelectRow
                      key={n}
                      selected={pageSize === n}
                      label={String(n)}
                      onSelect={() => {
                        setPageSize(n);
                        setPage(1);
                        setPageSizeOpen(false);
                      }}
                    />
                  ))}
                </FloatingSelect>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="numeric text-[11px] font-semibold text-faint">
                  {t("histPage")} {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={13} aria-hidden />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={13} aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <ExpenseDetailSheet
        row={selected}
        amount={selected ? money(convert(selected)) : ""}
        displayCurrency={currency}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
