"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Image as ImageIcon,
  Layers,
  Pencil,
  Plus,
  Repeat,
  Search,
  StickyNote,
  Tag,
  Wallet,
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
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatingSelect, SelectRow } from "@/components/ui/FloatingSelect";
import { StatCard } from "@/components/dash/primitives";
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
 * History - transactions register, V5 "Sage Ledger" rebuild (2026-10-13).
 * Same engine (deep links, 300 ms server-side search, filters, paging,
 * privacy mask, detail sheet), completely new structure:
 *  · Masthead - title + pill search on the right.
 *  · Summary stat cards - Net / Money in / Money out / Entries, then a thin
 *    two-tone in:out share line.
 *  · Filter TOOLBAR - every filter is a pill dropdown in one wrap row
 *    (period + custom range, type, category with live counts, account,
 *    channel, amount range, sort) plus a clear-all chip. No left rail, no
 *    slide-over - the same toolbar serves every viewport.
 *  · Register - one soft card per day: sage day-header band (label + day
 *    net), register rows under it. Pill pager.
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

  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
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
    return "cycle";
  });
  const [from, setFrom] = useState(() => {
    const f = url.get("from");
    if (isValidISODate(f ?? "")) return f!;
    return toISODate(cycle.start);
  });
  const [to, setTo] = useState(() => {
    const t = url.get("to");
    if (isValidISODate(t ?? "")) return t!;
    return toISODate(cycle.end);
  });
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toggleMenu = (key: string) => setOpenMenu((cur) => (cur === key ? null : key));

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
  const historyFrozenTotals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const row of rows) {
      const v = convertFrozen(row);
      if (row.type === "income") inc += v;
      else exp += v;
    }
    return { income: inc, expense: exp };
  }, [rows, convertFrozen]);

  const totalCount = count || rows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE));
  const filterCount = [preset !== "cycle", !!categoryId, !!method, !!accountId, !!min, !!max].filter(
    Boolean,
  ).length;

  const resetAll = useCallback(() => {
    setSearch("");
    setFlow("all");
    setPreset("cycle");
    setFrom(toISODate(cycle.start));
    setTo(toISODate(cycle.end));
    setCategoryId("");
    setMethod("");
    setAccountId("");
    setMin("");
    setMax("");
    setSortKey("date_desc");
    setOpenMenu(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [cycle]);

  // Filter option lists. The hooks need auth; when they come back empty but
  // rows are loaded, derive the options from the rows themselves (client-side,
  // no extra queries) so the pills are never blank.
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

  // Per-category counts inside the current filtered set (client-side, no
  // extra query): the category pill shows how many entries each holds.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.category_id) m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

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

  // Paging scrolls back to the top of the register.
  const panelRef = useRef<HTMLDivElement>(null);

  const goPage = (n: number) => {
    setPage(n);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="mx-auto w-full max-w-[1100px]">
      {/* ── Masthead: title left, pill search right ── */}
      <header className="rise flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
          {t("history")}
        </h1>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-10 w-full rounded-full border border-border bg-input pl-10 pr-8 text-sm text-text placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label={t("clear")}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Summary strip: count + net + in/out + share line */}
      <section className="panel mt-5 overflow-hidden">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5">
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
          <div className="ml-auto flex items-end gap-5 pb-0.5">
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

      {/* ── Filter toolbar: every filter as a pill dropdown ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FloatingSelect
          className="relative w-[150px]"
          pill
          label={
            preset === "custom"
              ? t("filterCustom")
              : preset === "all"
                ? t("periodAll")
                : preset === "today"
                  ? t("histChipToday")
                  : preset === "week"
                    ? t("histChipWeek")
                    : t("histChipCycle")
          }
          open={openMenu === "period"}
          onToggle={() => toggleMenu("period")}
          menuClassName="max-h-64 overflow-y-auto"
        >
          {[
            { key: "all" as DatePreset, label: t("periodAll") },
            { key: "today" as DatePreset, label: t("histChipToday") },
            { key: "week" as DatePreset, label: t("histChipWeek") },
            { key: "cycle" as DatePreset, label: t("histChipCycle") },
            { key: "custom" as DatePreset, label: t("filterCustom") },
          ].map((p) => (
            <SelectRow
              key={p.key}
              selected={preset === p.key}
              label={p.label}
              onSelect={() => {
                applyPreset(p.key);
                setOpenMenu(null);
              }}
            />
          ))}
        </FloatingSelect>

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
              aria-label={t("anCalFrom")}
              className="h-10 rounded-full border border-border bg-input px-3 text-[12.5px] text-text focus:border-primary focus:outline-none"
            />
            <span className="text-[12px] text-faint">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
              aria-label={t("anCalTo")}
              className="h-10 rounded-full border border-border bg-input px-3 text-[12.5px] text-text focus:border-primary focus:outline-none"
            />
          </div>
        )}

        <FloatingSelect
          className="relative w-[130px]"
          pill
          label={flow === "all" ? t("allFlow") : flow === "expense" ? t("expense") : t("income")}
          open={openMenu === "type"}
          onToggle={() => toggleMenu("type")}
        >
          {[
            { key: "all" as FlowFilter, label: t("allFlow") },
            { key: "expense" as FlowFilter, label: t("expense") },
            { key: "income" as FlowFilter, label: t("income") },
          ].map((f) => (
            <SelectRow
              key={f.key}
              selected={flow === f.key}
              label={f.label}
              onSelect={() => {
                setFlow(f.key);
                setPage(0);
                setOpenMenu(null);
              }}
            />
          ))}
        </FloatingSelect>

        <FloatingSelect
          className="relative w-[170px]"
          pill
          label={
            categoryId
              ? railCategories.find((c) => c.value === categoryId)?.label ?? t("histTabCategories")
              : t("histTabCategories")
          }
          open={openMenu === "category"}
          onToggle={() => toggleMenu("category")}
          menuClassName="max-h-64 overflow-y-auto"
        >
          <SelectRow
            selected={categoryId === ""}
            label={t("histTabCategories")}
            onSelect={() => {
              setCategoryId("");
              setPage(0);
              setOpenMenu(null);
            }}
          />
          {railCategories.map((c) => (
            <SelectRow
              key={c.value}
              selected={categoryId === c.value}
              label={`${c.label}${categoryCounts.get(c.value) ? ` · ${categoryCounts.get(c.value)}` : ""}`}
              onSelect={() => {
                setCategoryId((cur) => (cur === c.value ? "" : c.value));
                setPage(0);
                setOpenMenu(null);
              }}
            />
          ))}
        </FloatingSelect>

        <FloatingSelect
          className="relative w-[150px]"
          pill
          label={
            accountId
              ? railAccounts.find((a) => a.value === accountId)?.label ?? t("accounts")
              : t("accounts")
          }
          open={openMenu === "account"}
          onToggle={() => toggleMenu("account")}
          menuClassName="max-h-64 overflow-y-auto"
        >
          <SelectRow
            selected={accountId === ""}
            label={t("accounts")}
            onSelect={() => {
              setAccountId("");
              setPage(0);
              setOpenMenu(null);
            }}
          />
          {railAccounts.map((a) => (
            <SelectRow
              key={a.value}
              selected={accountId === a.value}
              label={a.label}
              onSelect={() => {
                setAccountId((cur) => (cur === a.value ? "" : a.value));
                setPage(0);
                setOpenMenu(null);
              }}
            />
          ))}
        </FloatingSelect>

        <FloatingSelect
          className="relative w-[150px]"
          pill
          label={method || t("histTabChannels")}
          open={openMenu === "channel"}
          onToggle={() => toggleMenu("channel")}
          menuClassName="max-h-64 overflow-y-auto"
        >
          <SelectRow
            selected={method === ""}
            label={t("histTabChannels")}
            onSelect={() => {
              setMethod("");
              setPage(0);
              setOpenMenu(null);
            }}
          />
          {PAYMENT_METHODS.map((m) => (
            <SelectRow
              key={m}
              selected={method === m}
              label={m}
              onSelect={() => {
                setMethod((cur) => (cur === m ? "" : m));
                setPage(0);
                setOpenMenu(null);
              }}
            />
          ))}
        </FloatingSelect>

        <FloatingSelect
          className="relative w-[150px]"
          pill
          label={SORTS.find((s) => s.key === sortKey)?.label ?? SORTS[0].label}
          open={openMenu === "sort"}
          onToggle={() => toggleMenu("sort")}
        >
          {SORTS.map((s) => (
            <SelectRow
              key={s.key}
              selected={sortKey === s.key}
              label={s.label}
              onSelect={() => {
                setSortKey(s.key);
                setOpenMenu(null);
              }}
            />
          ))}
        </FloatingSelect>

        {filterCount > 0 && (
          <button
            onClick={resetAll}
            className="flex h-10 items-center gap-1 rounded-full bg-[var(--sf-tint-danger)] px-3.5 text-[12.5px] font-semibold text-danger transition-colors hover:brightness-95"
          >
            <X size={13} aria-hidden /> {t("clear")}
          </button>
        )}
      </div>

      {/* ── Register: one soft card per day ── */}
      <div ref={panelRef} className="mt-4">
        {loading && rows.length === 0 ? (
          <div className="panel space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="panel">
            <EmptyState title={t("error")} message={error} />
          </div>
        ) : rows.length === 0 ? (
          <div className="panel">
            <EmptyState
              title={t("noTransactions")}
              message={t("noTransactionsHint")}
              action={
                <button
                  onClick={resetAll}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-strong"
                >
                  <X size={14} aria-hidden /> {t("clear")}
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="panel">
            {sections.map((section, gi) => (
              <section key={section.date} className={gi > 0 ? "border-t border-border" : undefined}>
                <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">
                    {groupDate(section.date, locale)}
                  </p>
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
            </div>

            {/* Pager */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => goPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="flex h-10 items-center gap-1 rounded-full border border-border bg-surface px-4 text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> {t("prev")}
              </button>
              <span className="numeric whitespace-nowrap text-[11px] font-bold text-faint">
                {t("histPage")} {page + 1} / {pageCount}
              </span>
              <button
                onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                disabled={page >= pageCount - 1}
                className="flex h-10 items-center gap-1 rounded-full border border-border bg-surface px-4 text-[13px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("next")} <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
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

/* ── One register row: pastel chip, name + markers, method · account ·
    time, quiet category on wide screens, locked-width amount, hover edit. ── */
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
  const CategoryGlyph = row.categories?.icon ? categoryGlyph(row.categories.icon) : isIncome ? Plus : Tag;
  const AccountGlyph = row.bank_accounts?.icon ? accountGlyph(row.bank_accounts.icon) : null;
  const tileStyle = row.categories?.color
    ? {
        backgroundColor: `color-mix(in srgb, ${row.categories.color} 13%, transparent)`,
        color: row.categories.color,
      }
    : undefined;
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
      className="group flex min-h-[56px] cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-surface-elevated/60 focus:bg-surface-elevated/60 focus:outline-none sm:px-4"
    >
      {/* Category icon chip. */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
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
