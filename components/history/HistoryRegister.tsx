"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Flame,
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
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { RangeField } from "@/components/ui/CalendarModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FitText } from "@/components/ui/FitText";
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
 * History — "ledger journal" redesign (2026-09-15). Same engine (deep links,
 * 300 ms server-side search, filters, paging, privacy mask, detail sheet),
 * new skin:
 *  · Cash-flow hero — net headline, inflow/outflow split rule, peak chip and
 *    the All/Expense/Income switcher live in one statement card.
 *  · Control bar — search + sort + a row of removable filter chips.
 *  · Phones: day cards with a date rail (journal timeline), staggered reveal.
 *  · lg+: the same register as an aligned statement table with day bands.
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

  // Removable filter chips — one glance shows what the register is narrowed by.
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (preset !== "all")
    chips.push({
      key: "period",
      label:
        preset === "today" ? t("histChipToday") : preset === "week" ? t("histChipWeek") : preset === "cycle" ? t("histChipCycle") : `${from || "…"} → ${to || "…"}`,
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

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      {/* ── Masthead ── */}
      <header className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
        <div>
          <p className="caps-faint">{t("histOverline")}</p>
          <h1 className="font-brand mt-1 text-2xl font-bold tracking-tight text-text sm:text-[28px]">
            {t("history")}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-text-muted">
            {totalCount} {t("entriesLabel")}
          </span>
          <PrivacyEyeButton />
          <ThemeToggle />
        </div>
      </header>

      {/* ── Cash-flow hero: net headline, split rule, peak, flow switcher ── */}
      <HistoryHero
        inflow={summary.inflow}
        outflow={summary.outflow}
        net={summary.net}
        peak={summary.peak > 0 ? { label: summary.peakLabel, value: fmt(summary.peak) } : null}
        fmt={fmt}
        flow={flow}
        onFlow={(f) => {
          setFlow(f);
          setPage(0);
        }}
      />

      {/* ── Control bar ── */}
      <div className="panel mt-4 overflow-hidden" ref={panelRef}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[140px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-11 w-full border border-border bg-input pl-9 pr-8 text-sm text-text placeholder:text-faint transition-colors focus:border-primary focus:outline-none sm:h-10"
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
            className="h-11 border border-border bg-input px-2 text-xs font-bold text-text-muted sm:h-10"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setFiltersOpen(true)}
            className="sf-lift relative flex h-11 shrink-0 items-center gap-1.5 border border-border bg-surface px-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted hover:border-text-muted hover:text-text lg:hidden"
          >
            <SlidersHorizontal size={14} /> {t("histFilters")}
            {sheetFilterCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {sheetFilterCount}
              </span>
            )}
          </button>
          {isFiltered && (
            <button
              onClick={resetAll}
              className="flex h-11 items-center gap-1 px-2 text-[11px] font-bold uppercase tracking-[0.06em] text-rust transition-colors hover:opacity-80 sm:h-10"
            >
              {t("filtered")} <X size={12} />
            </button>
          )}
        </div>

        {/* Removable active-filter chips (both layouts). */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-elevated/30 px-3 py-2">
            <span className="caps-faint mr-0.5">{t("histActiveFilters")}</span>
            {chips.map((c) => (
              <span
                key={c.key}
                className="flex h-7 items-center gap-1.5 border border-border bg-surface pl-2.5 pr-1 text-[11px] font-bold text-text"
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
          </div>
        )}

        {/* Desktop enhancement: inline filter register. */}
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-surface-elevated/20 px-3 py-2 lg:flex">
          <div className="flex items-center gap-1" role="group" aria-label="Date range">
            {(["all", "today", "week", "cycle"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`h-8 border px-3 text-[11px] font-bold uppercase tracking-[0.06em] transition ${
                  preset === p ? "border-primary bg-primary text-white" : "border-border text-text-muted hover:text-text"
                }`}
              >
                {p === "all" ? "All time" : p === "cycle" ? "Cycle" : p}
              </button>
            ))}
            <button
              onClick={() => applyPreset("custom")}
              className={`h-8 border px-3 text-[11px] font-bold uppercase tracking-[0.06em] transition ${
                preset === "custom" ? "border-primary bg-primary text-white" : "border-border text-text-muted hover:text-text"
              }`}
            >
              Custom
            </button>
          </div>
          {preset === "custom" && (
            <RangeField from={from} to={to} boxClassName="h-8 !min-h-[32px]" onChange={(f, t2) => { setFrom(f); setTo(t2); }} />
          )}
          <FilterSelect
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            anyLabel="Any category"
            options={categories
              .filter((c) => flow === "all" || c.type === flow)
              .map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            label="Channel"
            value={method}
            onChange={setMethod}
            anyLabel="Any channel"
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          />
          <FilterSelect
            label="Account"
            value={accountId}
            onChange={setAccountId}
            anyLabel="Any account"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Min"
              aria-label="Minimum amount"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="h-8 w-20 border border-border bg-input px-2 text-xs text-text placeholder:text-faint focus:border-primary focus:outline-none"
            />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Max"
              aria-label="Maximum amount"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="h-8 w-20 border border-border bg-input px-2 text-xs text-text placeholder:text-faint focus:border-primary focus:outline-none"
            />
          </div>
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

            {/* ── DESKTOP ENHANCEMENT: aligned ledger table ── */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-faint">
                    <th className="px-5 py-3">Transaction</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Account</th>
                    <th className="px-3 py-3">Channel</th>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="w-10 py-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <Fragment key={section.date}>
                      <tr className="border-b border-border bg-surface-elevated/50">
                        <td colSpan={7} className="px-5 py-2">
                          <div className="flex items-center gap-2.5">
                            <DayChip date={section.date} locale={locale} compact />
                            <span className="caps">{groupDate(section.date, locale)}</span>
                            <span className="rule-after" />
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

            {/* Pager — same page window on both layouts. */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <button
                onClick={() => goPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="sf-lift flex h-11 items-center gap-1 border border-border bg-surface px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted hover:border-text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> {t("prev")}
              </button>
              <span className="numeric text-center text-[11px] font-bold text-faint">
                <span className="lg:hidden">{t("histPage")} </span>
                {page + 1} / {pageCount} · {pageRows.length} / {rows.length}
              </span>
              <button
                onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                disabled={page >= pageCount - 1}
                className="sf-lift flex h-11 items-center gap-1 border border-border bg-surface px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted hover:border-text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("next")} <ChevronRight size={14} />
              </button>
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
            <div className="space-y-1.5">
              <p className="caps">Custom range</p>
              <RangeField from={from} to={to} boxClassName="h-11 justify-center" onChange={(f, t2) => { setFrom(f); setTo(t2); }} />
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

/* ── cash-flow hero — net headline + split rule + peak + flow switcher ── */
function HistoryHero({
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
    <section className="panel shadow-soft relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-50"
        style={{ background: "radial-gradient(closest-side, var(--sf-primary-light), transparent 75%)" }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 sm:px-5">
        <span className="caps">{t("cashFlow")}</span>
        {/* Flow switcher — segmented, thumb-sized on phones. */}
        <div className="flex border border-border bg-input p-0.5" role="group" aria-label={t("allFlow")}>
          {(["all", "expense", "income"] as FlowFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => onFlow(f)}
              aria-pressed={flow === f}
              className={`h-9 min-w-[64px] px-3 text-[11px] font-bold uppercase tracking-[0.06em] transition active:scale-[0.97] sm:h-8 ${
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
      </div>

      <div className="relative px-4 py-4 sm:px-5">
        <p className="caps-faint">{t("histNetFlow")}</p>
        <div className={`figures mt-1 font-bold ${net >= 0 ? "text-income" : "text-danger"}`}>
          <FitText basePx={34} minPx={18}>
            {net >= 0 ? "+" : "−"}
            {fmt(Math.abs(net)).replace(/^[^\d]*/, "")}
          </FitText>
        </div>
        {/* Inflow / outflow split rule — one rounded bar, complement derived. */}
        <div className="mt-3 flex h-2 overflow-hidden rounded-full" style={{ background: "var(--sf-track)" }}>
          <span className="bg-income transition-[width] duration-500" style={{ width: `${incomePct}%` }} />
          <span className="bg-danger transition-[width] duration-500" style={{ width: `${100 - incomePct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
          <HeroStat label={t("totalInflow")} value={fmt(inflow)} tone="income" icon={ArrowUpRight} />
          <HeroStat label={t("totalOutflow")} value={fmt(outflow)} tone="danger" icon={ArrowDownLeft} />
          <HeroStat
            label={t("analyticsKpiPeakTitle")}
            value={peak ? peak.value : "—"}
            sub={peak ? peak.label : undefined}
            tone="muted"
            icon={Flame}
          />
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "income" | "danger" | "muted";
  icon: typeof ArrowUpRight;
}) {
  const toneCls = tone === "income" ? "text-income" : tone === "danger" ? "text-danger" : "text-text";
  return (
    <div className="min-w-0">
      <p className="caps flex min-h-[26px] items-center gap-1 sm:min-h-0">
        <Icon size={12} className={`shrink-0 ${tone === "muted" ? "text-brass" : toneCls}`} aria-hidden />
        <span>{label}</span>
      </p>
      <div className={`figures mt-1 text-sm font-bold sm:text-base ${toneCls}`}>
        <FitText basePx={16} minPx={11}>{value}</FitText>
      </div>
      {sub && <p className="mt-0.5 truncate text-[10px] text-text-muted">{sub}</p>}
    </div>
  );
}

/* ── laptop inline filter dropdown (caps label + hairline select) ── */
function FilterSelect({
  label,
  value,
  onChange,
  anyLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  anyLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 border bg-input px-2 text-[11px] font-bold text-text-muted ${
          value ? "border-primary text-primary-strong" : "border-border"
        }`}
      >
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ── day rail chip: big numeral + month overline ── */
function DayChip({ date, locale, compact }: { date: string; locale: string; compact?: boolean }) {
  const d = new Date(`${date}T00:00:00`);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(d);
  const mon = new Intl.DateTimeFormat(locale, { month: "short" }).format(d).toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center border border-border bg-surface leading-none ${
        compact ? "h-8 w-8" : "h-11 w-11"
      }`}
      style={{ background: "var(--sf-select-tint)" }}
      aria-hidden
    >
      <span className={`figures font-bold text-text ${compact ? "text-sm" : "text-base"}`}>{day}</span>
      <span className={`font-bold tracking-[0.1em] text-faint ${compact ? "text-[7px]" : "text-[8px]"}`}>{mon}</span>
    </span>
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
            className="h-7 w-1 shrink-0 transition-[height] group-hover:h-8"
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
        <span className="inline-flex items-center gap-1.5 border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-muted">
          <CategoryGlyph
            size={12}
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
