"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Pencil,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  StickyNote,
  Tag,
  X,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { listExpenses } from "@/services/expenses";
import { listBankAccounts, type BankAccountRow } from "@/services/bankAccounts";
import { accountGlyph, categoryGlyph } from "@/components/ui/Glyph";
import { useCategories } from "@/hooks/useExpenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { useRowConverter } from "@/hooks/useRates";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { RangeField } from "@/components/ui/CalendarModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PAYMENT_METHODS, type PaymentMethod } from "@/constants/app";
import {
  formatMoney,
  getCycleWindow,
  todayISO,
  toISODate,
  isValidISODate,
} from "@/utils/format";
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import type { ExpenseFilters, ExpenseRow, ExpenseSort } from "@/services/expenses";

type FlowFilter = "all" | "expense" | "income";
type DatePreset = "all" | "today" | "week" | "cycle" | "custom";
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const PAGE = 10;

const SORTS: { key: SortKey; label: string; sort: ExpenseSort }[] = [
  { key: "date_desc", label: "Newest first", sort: { field: "date", direction: "desc" } },
  { key: "date_asc", label: "Oldest first", sort: { field: "date", direction: "asc" } },
  { key: "amount_desc", label: "Largest amount", sort: { field: "amount", direction: "desc" } },
  { key: "amount_asc", label: "Smallest amount", sort: { field: "amount", direction: "asc" } },
];

/**
 * History - transactions register, Monarch / Copilot Money pattern
 * (2026-10-11 structural rebuild). Same engine (deep links, 300 ms
 * server-side search, filters, paging, privacy mask, detail sheet), new
 * structure:
 *  · Masthead - overline + title (theme + privacy live in the shell topbar).
 *  · Desktop lg+: sticky LEFT FILTER RAIL that IS the filter UI - search on
 *    top, then sort, date presets, flow type, categories (with live counts
 *    from the filtered set), accounts, channels and min/max as vertical
 *    lists with inline active states. No filter button, no chips, no
 *    popover.
 *  · RIGHT MAIN COLUMN - slim summary header (entry count, Net figure,
 *    IN / OUT inline, 4 px income/expense share line under the row, all
 *    live with the filters), then transactions grouped BY DAY: day header
 *    row with the day net on the right, register list rows under it.
 *  · Mobile <lg: the rail becomes a slide-over behind a Filters button;
 *    the list keeps the day grouping.
 * `inject` is the /preview-history design seam (static rows, no auth/network).
 */
export function HistoryRegister({
  inject,
}: {
  inject?: { rows: ExpenseRow[] };
}) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();

  // Deep-link capture (window read once - redirect-landing pattern).
  const url = useMemo(
    () => (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()),
    [],
  );

  const [search, setSearch] = useState(() => url.get("q") ?? "");
  const [debounced, setDebounced] = useState(() => url.get("q") ?? "");
  const [flow, setFlow] = useState<FlowFilter>(() => {
    const v = url.get("type");
    return v === "expense" || v === "income" ? v : "all";
  });
  const [preset, setPreset] = useState<DatePreset>(() => {
    const f = url.get("from");
    const to = url.get("to");
    if (isValidISODate(f ?? "") || isValidISODate(to ?? "")) return "custom";
    return "all";
  });
  const [from, setFrom] = useState(() => (isValidISODate(url.get("from") ?? "") ? url.get("from")! : ""));
  const [to, setTo] = useState(() => (isValidISODate(url.get("to") ?? "") ? url.get("to")! : ""));
  const [categoryId, setCategoryId] = useState(() => url.get("category") ?? "");
  const [method, setMethod] = useState<string>(() => {
    const v = url.get("method");
    return PAYMENT_METHODS.includes(v as PaymentMethod) ? v! : "";
  });
  const [accountId, setAccountId] = useState(() => url.get("account") ?? "");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = url.get("sort");
    return SORTS.some((s) => s.key === v) ? (v as SortKey) : "date_desc";
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ExpenseRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // 300 ms debounce (mobile parity).
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { categories } = useCategories(user?.id);
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  useEffect(() => {
    if (!user) return;
    void listBankAccounts(getSupabaseBrowserClient(), user.id)
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [user]);

  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );

  // Rail placement: sticky sidebar from lg up, slide-over below.
  const [compactViewport, setCompactViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setCompactViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    setPage(0);
    if (p === "all") {
      setFrom("");
      setTo("");
    } else if (p === "today") {
      setFrom(todayISO());
      setTo(todayISO());
    } else if (p === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFrom(toISODate(d));
      setTo(todayISO());
    } else if (p === "cycle") {
      setFrom(toISODate(cycle.start));
      setTo(toISODate(cycle.end));
    }
    // custom: keep whatever from/to are on screen.
  };

  const filters: ExpenseFilters = useMemo(
    () => ({
      search: debounced || undefined,
      type: flow === "all" ? undefined : flow,
      from: from || undefined,
      to: to || undefined,
      categoryId: categoryId || undefined,
      paymentMethod: (method || undefined) as PaymentMethod | undefined,
      bankAccountId: accountId || undefined,
      minAmount: min !== "" && Number.isFinite(Number(min)) ? Number(min) : undefined,
      maxAmount: max !== "" && Number.isFinite(Number(max)) ? Number(max) : undefined,
    }),
    [debounced, flow, from, to, categoryId, method, accountId, min, max],
  );
  const sort = useMemo(() => SORTS.find((s) => s.key === sortKey)?.sort ?? SORTS[0].sort, [sortKey]);

  useEffect(() => {
    setPage(0);
  }, [filters, sort]);

  // Full filtered dataset (server-side filters, 5000 cap): totals, grouping
  // and paging must cover every matching entry, not just a page slice.
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const { convert, convertFrozen } = useRowConverter(profile?.preferred_currency, rows);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    // Design-preview seam: mirror the server filter locally.
    if (inject) {
      const local = filterRowsLocally(inject.rows, filters, sort);
      setRows(local);
      setCount(local.length);
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { rows: fresh, count: total } = await listExpenses(supabase, user.id, 0, filters, sort, 5000);
        if (!cancelled) {
          setRows(fresh);
          setCount(total);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase, filters, sort, t, inject]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const summary = useMemo(() => {
    let outflow = 0;
    let inflow = 0;
    for (const row of rows) {
      const v = convert(row);
      if (row.type === "income") inflow += v;
      else outflow += v;
    }
    return { outflow, inflow, net: inflow - outflow };
  }, [rows, convert]);

  // "At transaction-date rates" debugger counterpart of the filtered totals
  // (TodayRateLine hides it when the two bases agree; headline is LIVE for
  // rows in the active month).
  const historyFrozenTotals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const r of rows) {
      if (r.type === "income") inc += convertFrozen(r);
      else exp += convertFrozen(r);
    }
    return { income: inc, expense: exp };
  }, [rows, convertFrozen]);

  // Per-category counts inside the current filtered set (client-side, no
  // extra query): the rail shows how many entries each category holds.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.category_id) m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  // Mobile base: progressive paging. Desktop: classic paging.
  const pageRows = useMemo(() => rows.slice(page * PAGE, page * PAGE + PAGE), [rows, page]);

  const groupRows = useCallback(
    (list: ExpenseRow[]) => {
      const out: { date: string; rows: ExpenseRow[]; total: number }[] = [];
      for (const row of list) {
        const last = out[out.length - 1];
        const signed = row.type === "income" ? convert(row) : -convert(row);
        if (last && last.date === row.date) {
          last.rows.push(row);
          last.total += signed;
        } else {
          out.push({ date: row.date, rows: [row], total: signed });
        }
      }
      return out;
    },
    [convert],
  );
  const sections = useMemo(() => groupRows(pageRows), [groupRows, pageRows]);

  // Paging scrolls back to the top of the register on both layouts.
  const panelRef = useRef<HTMLDivElement>(null);
  const goPage = (n: number) => {
    setPage(n);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const totalCount = count || rows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE));
  const filterCount = [preset !== "all", !!categoryId, !!method, !!accountId, !!min, !!max].filter(
    Boolean,
  ).length;

  const resetAll = useCallback(() => {
    setSearch("");
    setFlow("all");
    setPreset("all");
    setFrom("");
    setTo("");
    setCategoryId("");
    setMethod("");
    setAccountId("");
    setMin("");
    setMax("");
    setSortKey("date_desc");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Rail category / account lists. The hooks need auth; when they come back
  // empty but rows are loaded, derive the options from the rows themselves
  // (client-side, no extra queries) so the rail is never blank.
  const railCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories.map((c) => ({ value: c.id, label: c.name, type: c.type }));
    }
    const seen = new Map<string, { value: string; label: string; type: string }>();
    for (const r of rows) {
      if (r.categories && !seen.has(r.categories.id)) {
        seen.set(r.categories.id, { value: r.categories.id, label: r.categories.name, type: r.categories.type });
      }
    }
    return [...seen.values()];
  }, [categories, rows]);
  const railAccounts = useMemo(() => {
    if (accounts.length > 0) {
      return accounts.map((a) => ({ value: a.id, label: a.name }));
    }
    const seen = new Map<string, { value: string; label: string }>();
    for (const r of rows) {
      if (r.bank_accounts && !seen.has(r.bank_accounts.id)) {
        seen.set(r.bank_accounts.id, { value: r.bank_accounts.id, label: r.bank_accounts.name });
      }
    }
    return [...seen.values()];
  }, [accounts, rows]);

  const rail = (
    <FilterRail
      search={search}
      onSearch={setSearch}
      sortKey={sortKey}
      onSort={(v) => setSortKey(v as SortKey)}
      preset={preset}
      applyPreset={applyPreset}
      from={from}
      to={to}
      onRange={(f, t2) => {
        setFrom(f);
        setTo(t2);
      }}
      flow={flow}
      onFlow={(f) => {
        setFlow(f);
        setPage(0);
      }}
      categoryId={categoryId}
      onCategory={(v) => setCategoryId((cur) => (cur === v ? "" : v))}
      categories={railCategories}
      categoryCounts={categoryCounts}
      accountId={accountId}
      onAccount={(v) => setAccountId((cur) => (cur === v ? "" : v))}
      accounts={railAccounts}
      method={method}
      onMethod={(v) => setMethod((cur) => (cur === v ? "" : v))}
      min={min}
      onMin={setMin}
      max={max}
      onMax={setMax}
      onClear={resetAll}
      compactSearch={compactViewport}
    />
  );

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      {/* ── Masthead: overline + title (shell topbar owns theme + privacy) ── */}
      <header className="mb-4 sm:mb-5">
        <p className="text-[13px] font-medium text-faint">{t("histOverline")}</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
          {t("history")}
        </h1>
      </header>

      <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-7">
        {/* ── LEFT FILTER RAIL (desktop): the filter UI itself ── */}
        <aside
          aria-label={t("histFilters")}
          className="hidden lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto lg:block lg:pb-4"
        >
          {rail}
        </aside>

        {/* ── RIGHT MAIN COLUMN ── */}
        <div className="min-w-0" ref={panelRef}>
          {/* Mobile toolbar: search row, then sort + Filters trigger for the
              rail slide-over. Desktop owns these inside the rail. */}
          <div className="mb-3 space-y-2 lg:hidden">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="h-11 w-full rounded-lg border border-border bg-input pl-9 pr-8 text-sm text-text placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label={t("clear")}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-text"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Sort entries"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-input px-2 text-[13px] font-semibold text-text-muted"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setFiltersOpen(true)}
                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold transition-colors ${
                  filterCount > 0
                    ? "border-primary bg-[var(--sf-primary-light)] text-primary-strong"
                    : "border-border bg-surface text-text-muted"
                }`}
              >
                <SlidersHorizontal size={14} /> {t("histFilters")}
              </button>
            </div>
          </div>

          {/* ── Slim summary header: count + Net + IN / OUT + share line,
              all live with the rail filters ── */}
          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="caps-faint">
                  {totalCount} {t("entriesLabel")}
                </p>
                <p className="figures-display mt-0.5 truncate text-[24px] leading-8 sm:text-[28px] sm:leading-9">
                  <span className={summary.net >= 0 ? "text-income" : "text-danger"}>
                    <span className="mr-0.5 text-[0.6em] text-faint">
                      {summary.net >= 0 ? "+" : "−"}
                    </span>
                    {fmt(Math.abs(summary.net)).replace(/^[^\d]*/, "")}
                  </span>
                  <span className="ml-1.5 align-middle text-[11px] font-medium tracking-normal text-faint">
                    {t("cfNet")}
                  </span>
                </p>
              </div>
              <div className="ml-auto flex items-end gap-4 pb-0.5">
                <div className="text-right">
                  <p className="caps-faint">IN</p>
                  <p className="figures mt-0.5 text-sm text-income sm:text-[15px]">
                    {fmt(summary.inflow).replace(/^[^\d]*/, "")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="caps-faint">OUT</p>
                  <p className="figures mt-0.5 text-sm text-danger sm:text-[15px]">
                    {fmt(summary.outflow).replace(/^[^\d]*/, "")}
                  </p>
                </div>
              </div>
            </div>
            {/* Income / expense share - one 4 px line under the row. */}
            <div className="flex h-1" style={{ background: "var(--sf-track)" }}>
              <span
                className="bg-income transition-[width] duration-500"
                style={{ width: `${summary.inflow + summary.outflow > 0 ? Math.round((summary.inflow / (summary.inflow + summary.outflow)) * 100) : 50}%` }}
              />
              <span
                className="bg-danger transition-[width] duration-500"
                style={{ width: `${summary.inflow + summary.outflow > 0 ? 100 - Math.round((summary.inflow / (summary.inflow + summary.outflow)) * 100) : 50}%` }}
              />
            </div>
          </section>

          <div className="mt-2 px-1">
            <TodayRateLine
              live={{ income: summary.inflow, expense: summary.outflow }}
              frozen={historyFrozenTotals}
              fmt={fmt}
            />
          </div>

          {/* ── Register: day groups + pager ── */}
          {loading && rows.length === 0 ? (
            <div className="panel mt-3 space-y-3 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="panel mt-3">
              <EmptyState title={t("error")} message={error} />
            </div>
          ) : rows.length === 0 ? (
            <div className="panel mt-3">
              <EmptyState title={t("noTransactions")} message={t("noTransactionsHint")} />
            </div>
          ) : (
            <div className="panel mt-3 overflow-hidden">
              {sections.map((section, gi) => (
                <section key={section.date} className={gi > 0 ? "border-t border-border" : undefined}>
                  {/* Day header: label left, signed day net right. */}
                  <div className="flex items-baseline justify-between gap-3 border-b border-border/60 bg-surface-elevated/40 px-3 py-2 sm:px-4">
                    <p className="caps truncate">{groupDate(section.date, locale)}</p>
                    <p
                      className={`numeric shrink-0 text-[11px] font-bold ${
                        section.total >= 0 ? "text-income" : "text-danger"
                      }`}
                    >
                      {section.total >= 0 ? "+" : "−"}
                      {fmt(Math.abs(section.total)).replace(/^[^\d]*/, "")}{" "}
                      <span className="font-semibold text-faint">{t("histDayNet")}</span>
                    </p>
                  </div>
                  {section.rows.map((row) => (
                    <RegisterRow
                      key={row.id}
                      row={row}
                      amount={fmt(convert(row))}
                      original={
                        row.currency !== displayCurrency
                          ? mask(formatMoney(row.amount, row.currency, locale))
                          : null
                      }
                      locale={locale}
                      editLabel={t("editExpense")}
                      onOpen={() => setSelected(row)}
                    />
                  ))}
                </section>
              ))}

              {/* Pager */}
              <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <button
                  onClick={() => goPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex h-10 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> {t("prev")}
                </button>
                <span className="numeric whitespace-nowrap text-[11px] font-bold text-faint">
                  {t("histPage")} {page + 1} / {pageCount}
                </span>
                <button
                  onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                  disabled={page >= pageCount - 1}
                  className="flex h-10 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("next")} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile slide-over: the same rail, minus the search/sort that the
          toolbar already owns. */}
      <Modal
        open={filtersOpen && compactViewport}
        title="Filter register"
        onClose={() => setFiltersOpen(false)}
        maxWidth="max-w-sm"
      >
        <div className="p-4">{rail}</div>
      </Modal>

      <ExpenseDetailSheet
        row={selected}
        amount={selected ? fmt(convert(selected)) : ""}
        displayCurrency={displayCurrency}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}

/* ── LEFT FILTER RAIL: search, sort, presets, flow, categories (with
    counts), accounts, channels, min/max. Rendered as the sticky desktop
    sidebar and inside the mobile slide-over. ── */
function FilterRail({
  search,
  onSearch,
  sortKey,
  onSort,
  preset,
  applyPreset,
  from,
  to,
  onRange,
  flow,
  onFlow,
  categoryId,
  onCategory,
  categories,
  categoryCounts,
  accountId,
  onAccount,
  accounts,
  method,
  onMethod,
  min,
  onMin,
  max,
  onMax,
  onClear,
  compactSearch,
}: {
  search: string;
  onSearch: (v: string) => void;
  sortKey: SortKey;
  onSort: (v: string) => void;
  preset: DatePreset;
  applyPreset: (p: DatePreset) => void;
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  flow: FlowFilter;
  onFlow: (f: FlowFilter) => void;
  categoryId: string;
  onCategory: (v: string) => void;
  categories: { value: string; label: string; type: string }[];
  categoryCounts: Map<string, number>;
  accountId: string;
  onAccount: (v: string) => void;
  accounts: { value: string; label: string }[];
  method: string;
  onMethod: (v: string) => void;
  min: string;
  onMin: (v: string) => void;
  max: string;
  onMax: (v: string) => void;
  onClear: () => void;
  /** Mobile slide-over hides search + sort (toolbar owns them there). */
  compactSearch: boolean;
}) {
  const { t } = useLanguage();
  const presets: { key: DatePreset; label: string }[] = [
    { key: "all", label: t("periodAll") },
    { key: "today", label: t("histChipToday") },
    { key: "week", label: t("histChipWeek") },
    { key: "cycle", label: t("histChipCycle") },
    { key: "custom", label: t("filterCustom") },
  ];
  const flows: { key: FlowFilter; label: string }[] = [
    { key: "all", label: t("allFlow") },
    { key: "expense", label: t("expense") },
    { key: "income", label: t("income") },
  ];
  return (
    <div className="space-y-5">
      {/* Search on top of the rail. */}
      {!compactSearch && (
        <div>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-10 w-full rounded-lg border border-border bg-input pl-9 pr-8 text-sm text-text placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
            />
            {search && (
              <button
                onClick={() => onSearch("")}
                aria-label={t("clear")}
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-text"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select
            aria-label="Sort entries"
            value={sortKey}
            onChange={(e) => onSort(e.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-border bg-input px-2 text-[13px] font-semibold text-text-muted"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date presets - vertical list, active highlighted. */}
      <RailGroup label={t("histFilters")}>
        {presets.map((p) => (
          <RailItem key={p.key} active={preset === p.key} onClick={() => applyPreset(p.key)}>
            {p.label}
          </RailItem>
        ))}
        {preset === "custom" && (
          <div className="pt-1">
            <RangeField from={from} to={to} boxClassName="h-10 justify-center" onChange={onRange} />
          </div>
        )}
      </RailGroup>

      {/* Flow type. */}
      <RailGroup label={t("allFlow")}>
        {flows.map((f) => (
          <RailItem
            key={f.key}
            active={flow === f.key}
            onClick={() => onFlow(f.key)}
            tint={f.key === "income" ? "income" : f.key === "expense" ? "danger" : undefined}
          >
            {f.label}
          </RailItem>
        ))}
      </RailGroup>

      {/* Categories with live counts from the filtered set. */}
      <RailGroup label={t("histTabCategories")}>
        {categories
          .filter((c) => flow === "all" || c.type === flow)
          .map((c) => (
            <RailItem
              key={c.value}
              active={categoryId === c.value}
              onClick={() => onCategory(c.value)}
              count={categoryCounts.get(c.value) ?? 0}
            >
              {c.label}
            </RailItem>
          ))}
      </RailGroup>

      {/* Accounts. */}
      {accounts.length > 0 && (
        <RailGroup label={t("accounts")}>
          {accounts.map((a) => (
            <RailItem key={a.value} active={accountId === a.value} onClick={() => onAccount(a.value)}>
              {a.label}
            </RailItem>
          ))}
        </RailGroup>
      )}

      {/* Payment channels. */}
      <RailGroup label={t("histTabChannels")}>
        {PAYMENT_METHODS.map((m) => (
          <RailItem key={m} active={method === m} onClick={() => onMethod(m)}>
            {m}
          </RailItem>
        ))}
      </RailGroup>

      {/* Amount bounds. */}
      <RailGroup label={t("amount")}>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="Min"
            aria-label="Minimum amount"
            value={min}
            onChange={(e) => onMin(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-text placeholder:text-faint"
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="Max"
            aria-label="Maximum amount"
            value={max}
            onChange={(e) => onMax(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-text placeholder:text-faint"
          />
        </div>
      </RailGroup>

      <button
        onClick={onClear}
        className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-faint transition-colors hover:text-danger"
      >
        <X size={13} /> {t("clear")}
      </button>
    </div>
  );
}

function RailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="caps-faint mb-1.5">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RailItem({
  active,
  onClick,
  children,
  count,
  tint,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  tint?: "income" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors ${
        active
          ? tint === "income"
            ? "bg-income text-white"
            : tint === "danger"
              ? "bg-danger text-white"
              : "bg-[var(--sf-primary-light)] text-primary-strong"
          : "text-text-muted hover:bg-surface-elevated/60 hover:text-text"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count != null && (
        <span className={`numeric shrink-0 text-[11px] font-semibold ${active ? "text-primary-strong" : "text-faint"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Register list row (list anatomy, not table columns): category tile |
    name + markers over method-account | category right-aligned | signed
    amount with arrow, locked width so privacy reveal never shifts. ── */
function RegisterRow({
  row,
  amount,
  original,
  locale,
  editLabel,
  onOpen,
}: {
  row: ExpenseRow;
  amount: string;
  original: string | null;
  locale: string;
  editLabel: string;
  onOpen: () => void;
}) {
  const isIncome = row.type === "income";
  const catColor = row.categories?.color ?? "var(--sf-faint)";
  const tileStyle = isIncome
    ? { backgroundColor: "var(--sf-primary-light)", color: "var(--sf-income)" }
    : { backgroundColor: `${catColor}14`, color: catColor };
  const CategoryGlyph = row.categories?.icon ? categoryGlyph(row.categories.icon) : isIncome ? Plus : Tag;
  const AccountGlyph = row.bank_accounts
    ? accountGlyph(row.bank_accounts.icon, row.bank_accounts.account_type)
    : null;
  const time = row.time
    ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
        new Date(`${row.date}T${row.time}`),
      )
    : null;
  const secondLine = [row.payment_method, row.bank_accounts?.name].filter(Boolean).join(" - ");
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open record for ${row.description || row.categories?.name || "transaction"}`}
      className="group flex min-h-[56px] cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-surface-elevated/40 focus:bg-surface-elevated/60 focus:outline-none sm:px-4"
    >
      {/* Category icon tile. */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-border"
        style={tileStyle}
        aria-hidden
      >
        <CategoryGlyph size={16} />
      </span>

      {/* Name + markers, method - account underneath. */}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium text-text">
            {row.description || row.categories?.name || "Transaction"}
          </span>
          {row.notes && <StickyNote size={11} className="shrink-0 text-faint" aria-label="Has notes" />}
          {row.receipt_image_url && (
            <ImageIcon size={11} className="shrink-0 text-faint" aria-label="Receipt attached" />
          )}
          {(row.is_recurring || row.recurring_rule_id) && (
            <Repeat size={11} className="shrink-0 text-brass" aria-label="Recurring entry" />
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
          {AccountGlyph && <AccountGlyph size={11} className="shrink-0" aria-hidden />}
          <span className="truncate">
            {secondLine}
            {secondLine && time ? " · " : ""}
            {time ?? ""}
          </span>
        </span>
      </span>

      {/* Category name, quiet, right-aligned before the amount. */}
      <span className="hidden max-w-[110px] shrink-0 truncate text-right text-[12px] text-faint md:block">
        {row.categories?.name ?? ""}
      </span>

      {/* Amount + hover edit. Locked min-width: privacy reveal never shifts. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <span
          className={`figures flex items-center justify-end gap-0.5 text-[14.5px] font-bold ${
            isIncome ? "text-income" : "text-danger"
          }`}
          style={{ minWidth: "104px" }}
        >
          {isIncome ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
          {original && <span className="mr-0.5 text-[10px] font-bold text-faint">{row.currency}</span>}
          {isIncome ? "+" : "−"}
          {amount.replace(/^[^\d]*/, "")}
        </span>
        <span
          className="numeric hidden w-[72px] shrink-0 text-right text-[10px] text-faint lg:block"
          style={{ minWidth: "72px" }}
        >
          {original ?? ""}
        </span>
        <Link
          href={`/expense/${row.id}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={editLabel}
          className="hidden rounded-md p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:bg-[var(--sf-primary-light)] hover:text-primary focus:opacity-100 sm:block"
        >
          <Pencil size={14} />
        </Link>
      </span>
    </div>
  );
}

function groupDate(date: string, locale: string): string {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  if (date === iso(today)) return `Today · ${label}`;
  if (date === iso(yest)) return `Yesterday · ${label}`;
  return label;
}

/* ── Preview seam: client-side mirror of listExpenses' filtering + sorting. ── */
function filterRowsLocally(all: ExpenseRow[], f: ExpenseFilters, sort: ExpenseSort): ExpenseRow[] {
  const q = f.search?.trim().toLowerCase() ?? "";
  const out = all.filter((row) => {
    if (f.type && row.type !== f.type) return false;
    if (f.from && row.date < f.from) return false;
    if (f.to && row.date > f.to) return false;
    if (f.categoryId && row.category_id !== f.categoryId) return false;
    if (f.paymentMethod && row.payment_method !== f.paymentMethod) return false;
    if (f.bankAccountId && row.bank_accounts?.id !== f.bankAccountId) return false;
    if (f.minAmount != null && Number(row.amount) < f.minAmount) return false;
    if (f.maxAmount != null && Number(row.amount) > f.maxAmount) return false;
    if (q) {
      const hay = [row.description, row.notes, row.categories?.name, row.payment_method, row.bank_accounts?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return [...out].sort((a, b) => {
    const dir = sort.direction === "asc" ? 1 : -1;
    if (sort.field === "amount") return (Number(a.amount) - Number(b.amount)) * dir;
    if (a.date === b.date) return a.id < b.id ? -1 : 1;
    return (a.date < b.date ? -1 : 1) * dir;
  });
}
