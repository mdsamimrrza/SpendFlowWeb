"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FlowSummaryBar } from "@/components/dashboard/FlowSummaryBar";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import { Modal } from "@/components/ui/Modal";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PAYMENT_METHODS, type PaymentMethod } from "@/constants/app";
import {
  formatMoney,
  getCycleWindow,
  todayISO,
  toISODate,
  isValidISODate,
} from "@/utils/format";
import type { ExpenseFilters, ExpenseRow, ExpenseSort } from "@/services/expenses";

type FlowFilter = "all" | "expense" | "income";
type DatePreset = "all" | "today" | "week" | "cycle" | "custom";
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const PAGE = 15;

const SORTS: { key: SortKey; label: string; sort: ExpenseSort }[] = [
  { key: "date_desc", label: "Newest first", sort: { field: "date", direction: "desc" } },
  { key: "date_asc", label: "Oldest first", sort: { field: "date", direction: "asc" } },
  { key: "amount_desc", label: "Largest amount", sort: { field: "amount", direction: "desc" } },
  { key: "amount_asc", label: "Smallest amount", sort: { field: "amount", direction: "asc" } },
];

/**
 * History — mobile-first register. The phone is the base layout: thumb-sized
 * search/flow bar, a filter bottom-sheet, day-grouped touch rows and a
 * load-more footer. From lg up the same state enhances into the ledger:
 * inline filter register, aligned data table with the end-of-statement
 * double rule and page-prev/next. Deep links (?from=&to=&category=&method=
 * &account=&type=&sort=&q=) drive both layouts identically.
 *
 * `inject` is the /preview-history design seam: a static row set filtered
 * client-side with the same rule set (no auth, no network).
 */
export function HistoryRegister({
  inject,
}: {
  inject?: { rows: ExpenseRow[] };
}) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();

  // Deep-link capture (window read once — redirect-landing pattern).
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
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
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
    let peak = 0;
    let peakLabel = "";
    for (const row of rows) {
      const v = convert(row);
      if (row.type === "income") inflow += v;
      else {
        outflow += v;
        if (v > peak) {
          peak = v;
          peakLabel = row.description || row.categories?.name || "";
        }
      }
    }
    return { outflow, inflow, peak, peakLabel, net: inflow - outflow };
  }, [rows, convert]);

  // Mobile base: progressive reveal (load-more). Desktop table: classic paging.
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
  const sheetFilterCount = [preset !== "all", !!categoryId, !!method, !!accountId, !!min, !!max].filter(
    Boolean,
  ).length;
  const isFiltered = !!(debounced || flow !== "all" || sheetFilterCount > 0 || sortKey !== "date_desc");

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

  // Desktop inline register markup (the mobile sheet has its own labeled
  // controls; both drive the same state, so deep links work identically).
  const filterFields = (
    <>
      <div className="flex items-center gap-1" role="group" aria-label="Date range">
        {(["all", "today", "week", "cycle"] as DatePreset[]).map((p) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className={`h-7 border px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] transition ${
              preset === p ? "border-primary bg-primary text-white" : "border-border text-text-muted hover:text-text"
            }`}
          >
            {p === "all" ? "All time" : p === "cycle" ? "Cycle" : p}
          </button>
        ))}
        <button
          onClick={() => applyPreset("custom")}
          className={`h-7 border px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] transition ${
            preset === "custom" ? "border-primary bg-primary text-white" : "border-border text-text-muted hover:text-text"
          }`}
        >
          Custom
        </button>
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-7 border border-border bg-input px-2 text-xs text-text"
          />
          <span className="text-faint">→</span>
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-7 border border-border bg-input px-2 text-xs text-text"
          />
        </div>
      )}
      <select
        aria-label="Filter by category"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="h-7 border border-border bg-input px-2 text-[11px] font-bold text-text-muted"
      >
        <option value="">Any category</option>
        {categories
          .filter((c) => flow === "all" || c.type === flow)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <select
        aria-label="Filter by payment method"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        className="h-7 border border-border bg-input px-2 text-[11px] font-bold text-text-muted"
      >
        <option value="">Any channel</option>
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by account"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="h-7 border border-border bg-input px-2 text-[11px] font-bold text-text-muted"
      >
        <option value="">Any account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="Min"
          aria-label="Minimum amount"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-7 w-20 border border-border bg-input px-2 text-xs text-text placeholder:text-faint"
        />
        <input
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="Max"
          aria-label="Maximum amount"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-7 w-20 border border-border bg-input px-2 text-xs text-text placeholder:text-faint"
        />
      </div>
      <select
        aria-label="Sort entries"
        value={sortKey}
        onChange={(e) => setSortKey(e.target.value as SortKey)}
        className="ml-auto h-7 border border-border bg-input px-2 text-[11px] font-bold text-text-muted"
      >
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <header className="mb-4 flex items-center justify-between gap-3 sm:mb-5 sm:flex-wrap sm:gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-text sm:text-2xl">{t("history")}</h1>
          <p className="text-[11px] text-text-muted sm:text-sm">
            {totalCount} transaction{totalCount === 1 ? "" : "s"}
            {flow !== "all" ? ` · ${t(flow)} only` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <PrivacyEyeButton />
          <ThemeToggle />
        </div>
      </header>

      <div className="mb-4">
        <FlowSummaryBar
          income={summary.inflow}
          expense={summary.outflow}
          formatted={fmt}
          netLabel={t("cashFlow")}
          peak={summary.peak > 0 ? { label: summary.peakLabel, value: fmt(summary.peak) } : null}
          entriesLabel={t("totalInflow")}
        />
      </div>

      {/* Search + flow + filter entry point (always inline — phone-first). */}
      <div className="panel overflow-hidden" ref={panelRef}>
        <div className="flex flex-wrap items-center gap-2 p-3 sm:gap-3">
          <div className="relative min-w-[120px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-10 w-full rounded-md border border-border bg-input pl-9 pr-8 text-sm text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary lg:h-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label={t("clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {/* Phone: flow switcher collapses to a dropdown so search + flow +
              Filters share one line. Tablet/desktop keeps the segmented row. */}
          <select
            value={flow}
            onChange={(e) => {
              setFlow(e.target.value as FlowFilter);
              setPage(0);
            }}
            aria-label="Filter by flow"
            className="h-10 shrink-0 border border-border bg-input px-2 text-xs font-bold text-text-muted lg:hidden"
          >
            <option value="all">{t("allFlow")}</option>
            <option value="expense">{t("expense")}</option>
            <option value="income">{t("income")}</option>
          </select>
          <div className="hidden rounded-md border border-border bg-input p-0.5 lg:flex">
            {(["all", "expense", "income"] as FlowFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFlow(f);
                  setPage(0);
                }}
                className={`h-8 rounded px-3.5 text-xs font-bold transition active:scale-[0.97] ${
                  flow === f
                    ? f === "income"
                      ? "bg-income text-white"
                      : f === "expense"
                        ? "bg-danger text-white"
                        : "bg-primary text-white"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {f === "all" ? t("allFlow") : t(f)}
              </button>
            ))}
          </div>
          {/* Sheet trigger with active-filter badge (replaced by the inline register at lg). */}
          <button
            onClick={() => setFiltersOpen(true)}
            className="relative flex h-10 shrink-0 items-center gap-1.5 border border-border px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted transition hover:text-text lg:hidden"
          >
            <SlidersHorizontal size={14} /> Filters
            {sheetFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {sheetFilterCount}
              </span>
            )}
          </button>
          {isFiltered && (
            <button
              onClick={resetAll}
              className="flex h-10 items-center gap-1 rounded-full bg-rust-tint px-3 text-[11px] font-bold text-rust transition hover:opacity-80 lg:h-auto lg:py-1.5"
            >
              {t("filtered")} <X size={12} />
            </button>
          )}
        </div>

        {/* Desktop enhancement: inline filter register. */}
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-surface-elevated/20 px-3 py-2 lg:flex">
          {filterFields}
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full lg:h-11" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={t("error")} message={error} />
        ) : rows.length === 0 ? (
          <EmptyState title={t("noTransactions")} message={t("noTransactionsHint")} />
        ) : (
          <>
            {/* ── MOBILE BASE: day-grouped touch register ── */}
            <div className="lg:hidden">
              {sections.map((section) => (
                <Fragment key={section.date}>
                  <div className="flex items-center justify-between border-b border-border bg-surface-elevated/60 px-4 py-1.5">
                    <span className="caps">{groupDate(section.date, locale)}</span>
                    <span
                      className={`numeric text-xs font-bold ${section.total >= 0 ? "text-income" : "text-danger"}`}
                    >
                      {section.total >= 0 ? "+" : "−"}
                      {fmt(Math.abs(section.total)).replace(/^[^\d]*/, "")}
                    </span>
                  </div>
                  {section.rows.map((row) => (
                    <MobileRow
                      key={row.id}
                      row={row}
                      amount={fmt(convert(row))}
                      original={
                        row.currency !== displayCurrency
                          ? mask(formatMoney(row.amount, row.currency, locale))
                          : null
                      }
                      locale={locale}
                      onOpen={() => setSelected(row)}
                    />
                  ))}
                </Fragment>
              ))}

              {/* End of register: totals double rule + load more (mobile). */}
              <div className="end-rule bg-surface-elevated/50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="caps">Totals — {rows.length} matching</span>
                  <span className="numeric text-xs font-extrabold text-text">
                    <span className="text-income">+{fmt(summary.inflow).replace(/^[^\d]*/, "")}</span>
                    {" / "}
                    <span className="text-danger">−{fmt(summary.outflow).replace(/^[^\d]*/, "")}</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="caps-faint">Net</span>
                  <span className={`numeric text-xs font-extrabold ${summary.net >= 0 ? "text-income" : "text-danger"}`}>
                    {summary.net >= 0 ? "+" : "−"}
                    {fmt(Math.abs(summary.net)).replace(/^[^\d]*/, "")}
                  </span>
                </div>
              </div>
              {/* Touch pager — same page window as the desktop register. */}
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <button
                  onClick={() => goPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex h-11 items-center gap-1 border border-border px-4 text-xs font-bold uppercase tracking-[0.06em] text-text-muted transition hover:border-primary hover:text-primary disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> {t("prev")}
                </button>
                <span className="numeric text-[11px] font-bold text-faint">
                  Page {page + 1} of {pageCount} · {pageRows.length} of {rows.length}
                </span>
                <button
                  onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                  disabled={page >= pageCount - 1}
                  className="flex h-11 items-center gap-1 border border-border px-4 text-xs font-bold uppercase tracking-[0.06em] text-text-muted transition hover:border-primary hover:text-primary disabled:opacity-40"
                >
                  {t("next")} <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* ── DESKTOP ENHANCEMENT: aligned ledger table ── */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-faint">
                    <th className="px-5 py-2.5">Transaction</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Account</th>
                    <th className="px-3 py-2.5">Channel</th>
                    <th className="px-3 py-2.5">Time</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="w-10 py-2.5" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <Fragment key={section.date}>
                      <tr className="border-b border-border bg-surface-elevated/60">
                        <td colSpan={7} className="px-5 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="caps">{groupDate(section.date, locale)}</span>
                            <span
                              className={`numeric text-xs font-bold ${
                                section.total >= 0 ? "text-income" : "text-danger"
                              }`}
                            >
                              {section.total >= 0 ? "+" : "−"}
                              {fmt(Math.abs(section.total)).replace(/^[^\d]*/, "")}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {section.rows.map((row) => (
                        <HistoryRow
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
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="end-rule bg-surface-elevated/50">
                    <td colSpan={5} className="px-5 py-2.5">
                      <span className="caps">Totals — {rows.length} matching entries</span>
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-xs font-extrabold text-text">
                      <span className="text-income">+{fmt(summary.inflow).replace(/^[^\d]*/, "")}</span>
                      {" / "}
                      <span className="text-danger">−{fmt(summary.outflow).replace(/^[^\d]*/, "")}</span>
                    </td>
                    <td className="px-5 py-2.5" />
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-5 pb-2 pt-1">
                      <span className="caps-faint">Net</span>
                    </td>
                    <td
                      className={`numeric px-3 pb-2 pt-1 text-right text-xs font-extrabold ${
                        summary.net >= 0 ? "text-income" : "text-danger"
                      }`}
                    >
                      {summary.net >= 0 ? "+" : "−"}
                      {fmt(Math.abs(summary.net)).replace(/^[^\d]*/, "")}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Desktop pager only; mobile pager sits above. */}
            <div className="hidden items-center justify-between border-t border-border px-5 py-3 lg:flex">
              <span className="text-xs font-bold text-faint">
                Showing {pageRows.length} of {rows.length} matching · page {page + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-bold text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
                >
                  <ChevronLeft size={13} /> {t("prev")}
                </button>
                <button
                  onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                  disabled={page >= pageCount - 1}
                  className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-bold text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
                >
                  {t("next")} <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile filter sheet — same state as the desktop register. */}
      <Modal open={filtersOpen} title="Filter register" onClose={() => setFiltersOpen(false)} maxWidth="max-w-lg">
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            <label className="caps col-span-2">Period</label>
            {(["all", "today", "week", "cycle", "custom"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`h-11 border text-xs font-bold uppercase tracking-[0.06em] transition ${
                  preset === p ? "border-primary bg-primary text-white" : "border-border text-text-muted hover:text-text"
                }`}
              >
                {p === "all" ? "All time" : p === "cycle" ? "This cycle" : p}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 caps">Custom range</label>
              <input
                type="date"
                aria-label="From date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-11 border border-border bg-input px-2 text-sm text-text"
              />
              <input
                type="date"
                aria-label="To date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-11 border border-border bg-input px-2 text-sm text-text"
              />
            </div>
          )}
          <div className="space-y-3">
            <p className="caps">Narrow</p>
            <select
              aria-label="Filter by category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 w-full border border-border bg-input px-2 text-sm text-text"
            >
              <option value="">Any category</option>
              {categories
                .filter((c) => flow === "all" || c.type === flow)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Filter by payment method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-11 w-full border border-border bg-input px-2 text-sm text-text"
              >
                <option value="">Any channel</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-11 w-full border border-border bg-input px-2 text-sm text-text"
              >
                <option value="">Any account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Min amount"
                aria-label="Minimum amount"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                className="h-11 w-full border border-border bg-input px-3 text-sm text-text placeholder:text-faint"
              />
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Max amount"
                aria-label="Maximum amount"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className="h-11 w-full border border-border bg-input px-3 text-sm text-text placeholder:text-faint"
              />
            </div>
            <select
              aria-label="Sort entries"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-11 w-full border border-border bg-input px-2 text-sm text-text"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={resetAll}
              className="h-11 px-3 text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-danger"
            >
              Clear all
            </button>
            <button
              onClick={() => setFiltersOpen(false)}
              className="h-11 min-w-[140px] flex-1 border border-primary bg-primary text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
            >
              Show {totalCount} result{totalCount === 1 ? "" : "s"}
            </button>
          </div>
        </div>
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

/* ── mobile touch row (base layout): category avatar, explicit income/
   expense stamp — the flow type must be readable without decoding colors ── */
function MobileRow({
  row,
  amount,
  original,
  locale,
  onOpen,
}: {
  row: ExpenseRow;
  amount: string;
  original: string | null;
  locale: string;
  onOpen: () => void;
}) {
  const isIncome = row.type === "income";
  const catColor = row.categories?.color ?? "var(--sf-faint)";
  const avatarStyle = isIncome
    ? { borderColor: "var(--sf-income)", backgroundColor: "var(--sf-primary-light)", color: "var(--sf-income)" }
    : { borderColor: catColor, backgroundColor: `${catColor}14`, color: catColor };
  const CategoryGlyph = row.categories?.icon
    ? categoryGlyph(row.categories.icon)
    : isIncome
      ? Plus
      : Tag;
  const time = row.time
    ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
        new Date(`${row.date}T${row.time}`),
      )
    : null;
  const meta = [row.categories?.name, row.payment_method, row.bank_accounts?.name, time]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition active:bg-surface-elevated/70"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
        style={avatarStyle}
        aria-hidden
      >
        <CategoryGlyph size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text">
            {row.description || row.categories?.name || "Transaction"}
          </span>
          {row.notes && <StickyNote size={11} className="shrink-0 text-faint" aria-label="Has notes" />}
          {row.receipt_image_url && <ImageIcon size={11} className="shrink-0 text-faint" aria-label="Receipt attached" />}
          {(row.is_recurring || row.recurring_rule_id) && (
            <Repeat size={11} className="shrink-0 text-brass" aria-label="Recurring entry" />
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-faint">{meta}</span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`figures flex items-center justify-end gap-0.5 text-[15px] font-bold ${
            isIncome ? "text-income" : "text-text"
          }`}
          style={{ minWidth: "104px" }}
        >
          {isIncome ? (
            <ArrowUpRight size={12} className="text-income" />
          ) : (
            <ArrowDownLeft size={12} className="text-danger" />
          )}
          {original && <span className="mr-0.5 text-[10px] font-bold text-faint">{row.currency}</span>}
          {isIncome ? "+" : "−"}
          {amount.replace(/^[^\d]*/, "")}
        </span>
        <span className={`caps mt-0.5 !text-[9px] ${isIncome ? "!text-income" : "!text-faint"}`}>
          {isIncome ? "Income" : "Expense"}
        </span>
        {original && <span className="numeric mt-0.5 block text-[10px] text-faint">{original}</span>}
      </span>
      <ChevronRight size={14} className="shrink-0 text-faint" aria-hidden />
    </button>
  );
}

/* ── desktop table row (enhanced layout) ── */
function HistoryRow({
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
  const CategoryGlyph = row.categories?.icon ? categoryGlyph(row.categories.icon) : Tag;
  const time = row.time
    ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
        new Date(`${row.date}T${row.time}`),
      )
    : null;
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
      aria-label={`Open record for ${row.description || row.categories?.name || "transaction"}`}
      className="group cursor-pointer border-b border-border/50 transition last:border-0 hover:bg-surface-elevated/40 focus:bg-surface-elevated/60 focus:outline-none"
    >
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className="h-7 w-1 shrink-0"
            style={{ backgroundColor: row.categories?.color ?? "var(--sf-faint)" }}
            aria-hidden
          />
          <span className="max-w-[280px] truncate font-semibold text-text">
            {row.description || row.categories?.name || "Transaction"}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-faint">
            {row.notes && <StickyNote size={11} aria-label="Has notes" />}
            {row.receipt_image_url && <ImageIcon size={11} aria-label="Receipt attached" />}
            {(row.is_recurring || row.recurring_rule_id) && <Repeat size={11} aria-label="Recurring entry" />}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-text-muted">
          <CategoryGlyph
            size={13}
            style={{ color: row.categories?.color ?? "var(--sf-faint)" }}
            aria-hidden
          />
          {row.categories?.name ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {row.bank_accounts ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-text-muted">
            {(() => {
              const AccountGlyph = accountGlyph(row.bank_accounts!.icon, row.bank_accounts!.account_type);
              return <AccountGlyph size={13} aria-hidden />;
            })()}
            <span className="max-w-[130px] truncate">{row.bank_accounts.name}</span>
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
          {row.payment_method}
        </span>
      </td>
      <td className="numeric px-3 py-2.5 text-xs text-text-muted">{time ?? <span className="text-faint">—</span>}</td>
      {/* Amount cell keeps a locked min-width so privacy reveal never shifts. */}
      <td
        className={`numeric px-5 py-2.5 text-right font-extrabold ${isIncome ? "text-income" : "text-text"}`}
        style={{ minWidth: "150px" }}
      >
        <span className="inline-flex items-center gap-0.5">
          {isIncome ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} className="text-danger" />}
          {original && <span className="mr-0.5 text-[10px] font-bold text-faint">{row.currency}</span>}
          {isIncome ? "+" : "−"}
          {amount.replace(/^[^\d]*/, "")}
        </span>
        {original && <span className="block text-[10px] font-normal text-faint">{original}</span>}
      </td>
      <td className="py-2.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/expense/${row.id}`}
          aria-label={editLabel}
          className="inline-flex rounded-md p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:bg-primary-light hover:text-primary focus:opacity-100"
        >
          <Pencil size={14} />
        </Link>
      </td>
    </tr>
  );
}

function groupDate(date: string, locale: string): string {  const d = new Date(`${date}T00:00:00`);
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
  if (date === iso(today)) return `Today — ${label}`.toUpperCase();
  if (date === iso(yest)) return `Yesterday — ${label}`.toUpperCase();
  return label.toUpperCase();
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
