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
 * History - "market register" redesign (2026-10-11, Copilot / Monarch
 * transactions pattern). Same engine (deep links, 300 ms server-side search,
 * filters, paging, privacy mask, detail sheet), new structure:
 *  · Masthead - overline, title, entry count (theme + privacy live in the
 *    shell topbar on every screen).
 *  · One compact summary band - flow switcher left, Net / IN / OUT / Peak
 *    figures inline, 4 px income/expense split line under the row.
 *  · One toolbar row - search + sort + Filters button (count badge); presets,
 *    selects and min/max live in a desktop popover / the mobile sheet.
 *  · Flat desktop table - sticky header, per-row date column, no day bands.
 *  · One footer bar - totals + in/out/net left, pager right.
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

  // Filters UI: popover panel under the button on desktop, sheet below lg.
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

  // Mobile base: progressive paging. Desktop table: classic paging.
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
  const isFiltered = !!(debounced || flow !== "all" || filterCount > 0 || sortKey !== "date_desc");

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

  // Removable filter chips - one glance shows what the register is narrowed by.
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (preset !== "all")
    chips.push({
      key: "period",
      label:
        preset === "today" ? t("histChipToday") : preset === "week" ? t("histChipWeek") : preset === "cycle" ? t("histChipCycle") : `${from || "..."} - ${to || "..."}`,
      onRemove: () => applyPreset("all"),
    });
  if (categoryId) {
    const c = categories.find((x) => x.id === categoryId);
    if (c) chips.push({ key: "cat", label: c.name, onRemove: () => setCategoryId("") });
  }
  if (method) chips.push({ key: "method", label: method, onRemove: () => setMethod("") });
  if (accountId) {
    const a = accounts.find((x) => x.id === accountId);
    if (a) chips.push({ key: "acct", label: a.name, onRemove: () => setAccountId("") });
  }
  if (min) chips.push({ key: "min", label: `≥ ${min}`, onRemove: () => setMin("") });
  if (max) chips.push({ key: "max", label: `≤ ${max}`, onRemove: () => setMax("") });
  if (debounced) chips.push({ key: "q", label: `“${debounced}”`, onRemove: () => setSearch("") });

  const filterFields = (
    <FilterFields
      preset={preset}
      applyPreset={applyPreset}
      from={from}
      to={to}
      onRange={(f, t2) => {
        setFrom(f);
        setTo(t2);
      }}
      categoryId={categoryId}
      onCategory={setCategoryId}
      method={method}
      onMethod={setMethod}
      accountId={accountId}
      onAccount={setAccountId}
      min={min}
      onMin={setMin}
      max={max}
      onMax={setMax}
      flow={flow}
      categories={categories.map((c) => ({ value: c.id, label: c.name, type: c.type }))}
      accounts={accounts.map((a) => ({ value: a.id, label: a.name }))}
      resetAll={resetAll}
      resultLabel={`Show ${totalCount} result${totalCount === 1 ? "" : "s"}`}
      onDone={() => setFiltersOpen(false)}
    />
  );

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      {/* ── Masthead: overline + title + entry count (shell topbar owns
          theme + privacy on every screen) ── */}
      <header className="mb-4 sm:mb-5">
        <p className="text-[13px] font-medium text-faint">{t("histOverline")}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">{t("history")}</h1>
          <span className="numeric text-[12px] font-semibold text-faint">
            {totalCount} {t("entriesLabel")}
          </span>
        </div>
      </header>

      {/* ── Compact summary band: switcher + inline figures + split line ── */}
      <HistoryBand
        inflow={summary.inflow}
        outflow={summary.outflow}
        net={summary.net}
        peak={
          summary.peak > 0 ? { label: summary.peakLabel, value: fmt(summary.peak) } : null
        }
        fmt={fmt}
        flow={flow}
        onFlow={(f) => {
          setFlow(f);
          setPage(0);
        }}
      />
      <div className="mt-2 space-y-2 px-1">
        <TodayRateLine
          live={{ income: summary.inflow, expense: summary.outflow }}
          frozen={historyFrozenTotals}
          fmt={fmt}
        />
      </div>

      {/* ── Register panel: toolbar + chips + table + footer bar ── */}
      <div className="panel mt-4" ref={panelRef}>
        {/* Toolbar: search + sort + filters (popover on desktop, sheet on
            phones). */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[140px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-11 w-full rounded-lg border border-border bg-input pl-9 pr-8 text-sm text-text placeholder:text-faint transition-colors focus:border-primary focus:outline-none sm:h-10"
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
          <select
            aria-label="Sort entries"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-11 rounded-lg border border-border bg-input px-2.5 text-[13px] font-semibold text-text-muted sm:h-10"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="relative shrink-0">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={`flex h-11 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold transition-colors sm:h-10 ${
                filtersOpen
                  ? "border-primary bg-[var(--sf-primary-light)] text-primary-strong"
                  : "border-border bg-surface text-text-muted hover:border-faint hover:text-text"
              }`}
            >
              <SlidersHorizontal size={14} /> {t("histFilters")}
              {filterCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                  {filterCount}
                </span>
              )}
            </button>
            {/* Desktop popover. */}
            {filtersOpen && !compactViewport && (
              <>
                <button
                  aria-label={t("close")}
                  tabIndex={-1}
                  onClick={() => setFiltersOpen(false)}
                  className="fixed inset-0 z-30 cursor-default"
                />
                <div className="panel shadow-pop absolute right-0 top-[calc(100%+8px)] z-40 w-[min(620px,calc(100vw-2rem))] p-4 sm:p-5">
                  {filterFields}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Removable active-filter chips - the row only exists while filters
            are active. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-elevated/30 px-3 py-2">
            <span className="caps-faint mr-0.5">{t("histActiveFilters")}</span>
            {chips.map((c) => (
              <span
                key={c.key}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface pl-2.5 pr-1 text-[11px] font-semibold text-text"
              >
                <span className="max-w-[160px] truncate">{c.label}</span>
                <button
                  onClick={c.onRemove}
                  aria-label={`${t("clear")} ${c.label}`}
                  className="grid h-5 w-5 place-items-center text-faint transition-colors hover:text-danger"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {isFiltered && (
              <button
                onClick={resetAll}
                className="ml-auto flex h-7 items-center gap-1 px-2 text-[11px] font-semibold text-rust transition-colors hover:opacity-80"
              >
                {t("clear")} <X size={12} />
              </button>
            )}
          </div>
        )}

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
            {/* ── MOBILE BASE: day cards on a journal rail ── */}
            <div className="sf-stagger space-y-3 p-3 sm:p-4 lg:hidden">
              {sections.map((section) => (
                <DayCard
                  key={section.date}
                  date={section.date}
                  total={section.total}
                  locale={locale}
                  fmt={fmt}
                >
                  {section.rows.map((row) => (
                    <JournalRow
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
                </DayCard>
              ))}
            </div>

            {/* ── DESKTOP ENHANCEMENT: flat register table, sticky header.
                No overflow wrapper at xl+ so the header sticks to the page;
                below xl the min-width table scrolls horizontally. ── */}
            <div className="hidden overflow-x-auto border-t border-border lg:block xl:overflow-x-visible">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-faint">
                    <th className="sticky top-14 z-10 border-b border-border bg-surface px-4 py-2.5">Date</th>
                    <th className="sticky top-14 z-10 border-b border-border bg-surface px-3 py-2.5">Transaction</th>
                    <th className="sticky top-14 z-10 border-b border-border bg-surface px-3 py-2.5">Category</th>
                    <th className="sticky top-14 z-10 border-b border-border bg-surface px-3 py-2.5">Account</th>
                    <th className="sticky top-14 z-10 border-b border-border bg-surface px-3 py-2.5">Method</th>
                    <th className="sticky top-14 z-10 border-b border-border bg-surface px-4 py-2.5 text-right">Amount</th>
                    <th className="sticky top-14 z-10 border-b border-border bg-surface" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
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
                </tbody>
              </table>
            </div>

            {/* ── Footer bar: totals left, pager right ── */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                <span className="caps-faint">
                  Totals · {rows.length} {t("entriesLabel")}
                </span>
                <span className="numeric text-xs font-bold text-income">
                  +{fmt(summary.inflow).replace(/^[^\d]*/, "")}
                </span>
                <span className="numeric text-xs font-bold text-danger">
                  −{fmt(summary.outflow).replace(/^[^\d]*/, "")}
                </span>
                <span className="numeric text-xs font-extrabold">
                  <span className="mr-1 font-semibold text-faint">{t("cfNet")}</span>
                  <span className={summary.net >= 0 ? "text-income" : "text-danger"}>
                    {summary.net >= 0 ? "+" : "−"}
                    {fmt(Math.abs(summary.net)).replace(/^[^\d]*/, "")}
                  </span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => goPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> {t("prev")}
                </button>
                <span className="numeric whitespace-nowrap text-[11px] font-bold text-faint">
                  {t("histPage")} {page + 1} / {pageCount}
                </span>
                <button
                  onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                  disabled={page >= pageCount - 1}
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("next")} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile filter sheet - same state as the desktop popover. */}
      <Modal
        open={filtersOpen && compactViewport}
        title="Filter register"
        onClose={() => setFiltersOpen(false)}
        maxWidth="max-w-lg"
      >
        <div className="p-5">{filterFields}</div>
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

/* ── compact summary band: flow switcher + inline stat figures + split line ── */
function HistoryBand({
  inflow,
  outflow,
  net,
  peak,
  fmt,
  flow,
  onFlow,
}: {
  inflow: number;
  outflow: number;
  net: number;
  peak: { label: string; value: string } | null;
  fmt: (n: number) => string;
  flow: FlowFilter;
  onFlow: (f: FlowFilter) => void;
}) {
  const { t } = useLanguage();
  const total = inflow + outflow;
  const incomePct = total > 0 ? Math.round((inflow / total) * 100) : 50;
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-5">
        {/* Flow switcher - segmented, thumb-sized on phones. */}
        <div className="flex rounded-lg border border-border bg-surface-elevated p-0.5" role="group" aria-label={t("allFlow")}>
          {(["all", "expense", "income"] as FlowFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => onFlow(f)}
              aria-pressed={flow === f}
              className={`flex h-8 min-w-[56px] items-center justify-center rounded-md px-2.5 text-[12px] font-semibold transition active:scale-[0.97] ${
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

        <span className="hidden h-9 w-px bg-border md:block" aria-hidden />
        <BandStat
          label={t("cfNet")}
          display
          value={
            <span className={net >= 0 ? "text-income" : "text-danger"}>
              <span className="mr-0.5 text-[0.6em] text-faint">{net >= 0 ? "+" : "−"}</span>
              {fmt(Math.abs(net)).replace(/^[^\d]*/, "")}
            </span>
          }
        />
        <Hairline />
        <BandStat
          label="IN"
          value={<span className="text-income">{fmt(inflow).replace(/^[^\d]*/, "")}</span>}
        />
        <Hairline />
        <BandStat
          label="OUT"
          value={<span className="text-danger">{fmt(outflow).replace(/^[^\d]*/, "")}</span>}
        />
        <Hairline />
        <BandStat
          label={t("analyticsKpiPeakTitle")}
          value={peak ? <span>{peak.value}</span> : <span className="text-faint">-</span>}
          sub={peak ? peak.label : undefined}
        />
      </div>
      {/* Income / expense share - one 4 px line under the whole row. */}
      <div className="flex h-1" style={{ background: "var(--sf-track)" }}>
        <span className="bg-income transition-[width] duration-500" style={{ width: `${incomePct}%` }} />
        <span className="bg-danger transition-[width] duration-500" style={{ width: `${100 - incomePct}%` }} />
      </div>
    </section>
  );
}

function Hairline() {
  return <span className="hidden h-9 w-px bg-border md:block" aria-hidden />;
}

function BandStat({
  label,
  value,
  sub,
  display = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  /** Net gets the Fraunces display figure; the rest stay compact. */
  display?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="caps-faint">{label}</p>
      <div
        className={`numeric mt-0.5 truncate ${
          display ? "figures-display text-[22px] leading-7 sm:text-[26px] sm:leading-8" : "figures text-sm sm:text-[15px]"
        }`}
      >
        {value}
      </div>
      {sub && <p className="mt-0.5 max-w-[140px] truncate text-[10.5px] text-faint">{sub}</p>}
    </div>
  );
}

/* ── shared filter body: presets + range + selects + min/max (popover and
    mobile sheet render the same fields) ── */
function FilterFields({
  preset,
  applyPreset,
  from,
  to,
  onRange,
  categoryId,
  onCategory,
  method,
  onMethod,
  accountId,
  onAccount,
  min,
  onMin,
  max,
  onMax,
  flow,
  categories,
  accounts,
  resetAll,
  resultLabel,
  onDone,
}: {
  preset: DatePreset;
  applyPreset: (p: DatePreset) => void;
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  categoryId: string;
  onCategory: (v: string) => void;
  method: string;
  onMethod: (v: string) => void;
  accountId: string;
  onAccount: (v: string) => void;
  min: string;
  onMin: (v: string) => void;
  max: string;
  onMax: (v: string) => void;
  flow: FlowFilter;
  categories: { value: string; label: string; type: string }[];
  accounts: { value: string; label: string }[];
  resetAll: () => void;
  resultLabel: string;
  onDone: () => void;
}) {
  const presets: DatePreset[] = ["all", "today", "week", "cycle", "custom"];
  return (
    <div className="space-y-4">
      <div>
        <p className="caps">Period</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`h-9 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors ${
                preset === p
                  ? "border-primary bg-[var(--sf-primary-light)] text-primary-strong"
                  : "border-border text-text-muted hover:text-text"
              }`}
            >
              {p === "all" ? "All time" : p === "cycle" ? "This cycle" : p === "custom" ? "Custom" : p}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-2">
            <RangeField from={from} to={to} boxClassName="h-10 justify-center" onChange={onRange} />
          </div>
        )}
      </div>
      <div>
        <p className="caps">Narrow</p>
        <div className="mt-1.5 space-y-2">
          <select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => onCategory(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-input px-2 text-sm text-text"
          >
            <option value="">Any category</option>
            {categories
              .filter((c) => flow === "all" || c.type === flow)
              .map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filter by payment method"
              value={method}
              onChange={(e) => onMethod(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-input px-2 text-sm text-text"
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
              onChange={(e) => onAccount(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-input px-2 text-sm text-text"
            >
              <option value="">Any account</option>
              {accounts.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
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
              onChange={(e) => onMin(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-text placeholder:text-faint"
            />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Max amount"
              aria-label="Maximum amount"
              value={max}
              onChange={(e) => onMax(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-text placeholder:text-faint"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={resetAll}
          className="h-10 rounded-lg px-3 text-[13px] font-semibold text-faint transition-colors hover:text-danger"
        >
          Clear all
        </button>
        <button
          onClick={onDone}
          className="h-10 min-w-[140px] flex-1 rounded-lg border border-primary bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
        >
          {resultLabel}
        </button>
      </div>
    </div>
  );
}

/* ── mobile day card: header rail + journal rows ── */
function DayCard({
  date,
  total,
  locale,
  fmt,
  children,
}: {
  date: string;
  total: number;
  locale: string;
  fmt: (n: number) => string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-surface-elevated/50 px-3 py-2.5">
        <DayChip date={date} locale={locale} />
        <div className="min-w-0 flex-1">
          <p className="caps truncate">{groupDate(date, locale)}</p>
          <p
            className={`numeric mt-0.5 text-[11px] font-bold ${total >= 0 ? "text-income" : "text-danger"}`}
          >
            {total >= 0 ? "+" : "−"}
            {fmt(Math.abs(total)).replace(/^[^\d]*/, "")}{" "}
            <span className="font-semibold text-faint">{t("histDayNet")}</span>
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── day rail chip: big numeral + month overline ── */
function DayChip({ date, locale }: { date: string; locale: string }) {
  const d = new Date(`${date}T00:00:00`);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(d);
  const mon = new Intl.DateTimeFormat(locale, { month: "short" }).format(d);
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface leading-none"
      style={{ background: "var(--sf-select-tint)" }}
      aria-hidden
    >
      <span className="figures text-base font-bold text-text">{day}</span>
      <span className="text-[8px] font-semibold text-faint">{mon}</span>
    </span>
  );
}

/* ── mobile journal row: avatar, notes/receipt/recurring flags, locked
   amount column (privacy reveal never shifts layout) ── */
function JournalRow({
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
      className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition last:border-b-0 hover:bg-surface-elevated/40 active:bg-surface-elevated/70"
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

/* ── desktop flat table row: date stack, icon tile + name, chips, signed
   amount (locked width so privacy reveal never shifts) ── */
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
  const catColor = row.categories?.color ?? "var(--sf-faint)";
  const tileStyle = isIncome
    ? { backgroundColor: "var(--sf-primary-light)", color: "var(--sf-income)" }
    : { backgroundColor: `${catColor}14`, color: catColor };
  const CategoryGlyph = row.categories?.icon ? categoryGlyph(row.categories.icon) : isIncome ? Plus : Tag;
  const d = new Date(`${row.date}T00:00:00`);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(d);
  const mon = new Intl.DateTimeFormat(locale, { month: "short" }).format(d);
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
      className="group cursor-pointer border-b border-border/60 transition last:border-b-0 hover:bg-surface-elevated/40 focus:bg-surface-elevated/60 focus:outline-none"
    >
      <td className="px-4 py-2.5 align-middle">
        <p className="whitespace-nowrap text-[13px] font-bold leading-tight text-text">
          {day} <span className="text-[11px] font-semibold text-faint">{mon}</span>
        </p>
        <p className="numeric text-[11px] leading-tight text-faint">{time ?? "-"}</p>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border" style={tileStyle} aria-hidden>
            <CategoryGlyph size={14} />
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="max-w-[260px] truncate font-semibold text-text">
              {row.description || row.categories?.name || "Transaction"}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-faint">
              {row.notes && <StickyNote size={11} aria-label="Has notes" />}
              {row.receipt_image_url && <ImageIcon size={11} aria-label="Receipt attached" />}
              {(row.is_recurring || row.recurring_rule_id) && <Repeat size={11} className="text-brass" aria-label="Recurring entry" />}
            </span>
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex max-w-[150px] truncate rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-muted">
          {row.categories?.name ?? "-"}
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
          <span className="text-faint">-</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
          {row.payment_method}
        </span>
      </td>
      {/* Amount cell keeps a locked min-width so privacy reveal never shifts. */}
      <td
        className={`numeric px-4 py-2.5 text-right font-extrabold ${isIncome ? "text-income" : "text-danger"}`}
        style={{ minWidth: "150px" }}
      >
        <span className="inline-flex items-center gap-0.5">
          {isIncome ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
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
