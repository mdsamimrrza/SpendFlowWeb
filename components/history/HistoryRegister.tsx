"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
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
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { SheetSelect } from "@/components/ui/SheetSelect";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { useRowConverter } from "@/hooks/useRates";
import { ExpenseDetailSheet } from "@/components/expense/ExpenseDetailSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatingSelect, SelectRow } from "@/components/ui/FloatingSelect";
import { PAYMENT_METHODS, type PaymentMethod } from "@/constants/app";
import {
  formatMoney,
  getCycleWindow,
  getPreviousCycleWindow,
  todayISO,
  toISODate,
  isValidISODate,
} from "@/utils/format";
import { TodayRateLine } from "@/components/ui/TodayRateLine";
import type { ExpenseFilters, ExpenseRow, ExpenseSort } from "@/services/expenses";

type FlowFilter = "all" | "expense" | "income";
type DatePreset = "all" | "today" | "week" | "cycle" | "custom";
export type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const PAGE_SIZES = [10, 25, 50];

const SORTS: { key: SortKey; label: string; sort: ExpenseSort }[] = [
  { key: "date_desc", label: "Newest first", sort: { field: "date", direction: "desc" } },
  { key: "date_asc", label: "Oldest first", sort: { field: "date", direction: "asc" } },
  { key: "amount_desc", label: "Largest amount", sort: { field: "amount", direction: "desc" } },
  { key: "amount_asc", label: "Smallest amount", sort: { field: "amount", direction: "asc" } },
];

/**
 * History - transactions register, "Ledger Console" rebuild (2026-10-25,
 * user-directed reference: a neutral transactions-list console). Same engine
 * (deep links, 300 ms server-side search, filters, paging, privacy mask,
 * detail sheet, preview seam), new skin:
 *  · Masthead - title + subtitle, Export CSV / New Transaction actions.
 *  · 4 stat cards - outflow / inflow with like-for-like previous-window
 *    delta chips, average ticket, net flow.
 *  · One register card - search + every filter as a console dropdown +
 *    reset + result count, then the lg+ ledger table (sortable Date/Amount
 *    headers) with the day-grouped touch list below lg, and a pager footer
 *    with a per-page selector.
 *  · Insights row - category share bars (drills to /analytics) beside
 *    payment-channel share.
 */
export function HistoryRegister({
  inject,
}: {
  inject?: { rows: ExpenseRow[] };
}) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();

  // Deep-link params: live via useSearchParams so a client-side navigation
  // (e.g. the shell header's search) applies without a remount. Initial
  // filter state still reads them redirect-landing style.
  const url = useSearchParams();

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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ExpenseRow | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toggleMenu = (key: string) => setOpenMenu((cur) => (cur === key ? null : key));

  // Header-search handoff: when the query string changes after mount
  // (shell search bar navigates to /history?q=...), apply it to the box.
  const paramsString = url.toString();
  const firstParams = useRef(true);
  useEffect(() => {
    if (firstParams.current) {
      firstParams.current = false;
      return;
    }
    setSearch(url.get("q") ?? "");
    setDebounced(url.get("q") ?? "");
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsString]);

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
  }, [filters, sort, pageSize]);

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
  const bare = (n: number) => fmt(n).replace(/^[^\d]*/, "");

  const summary = useMemo(() => {
    let outflow = 0;
    let inflow = 0;
    let expenseCount = 0;
    for (const row of rows) {
      const v = convert(row);
      if (row.type === "income") inflow += v;
      else {
        outflow += v;
        expenseCount += 1;
      }
    }
    return { outflow, inflow, net: inflow - outflow, expenseCount };
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

  // Like-for-like previous window (same length, immediately before) for the
  // stat-card delta chips; "All time" has no predecessor.
  const prevWindow = useMemo<{ from: string; to: string } | null>(() => {
    if (preset === "all") return null;
    if (preset === "cycle") {
      const p = getPreviousCycleWindow(
        new Date(),
        profile?.cycle_start_day ?? 1,
        profile?.cycle_end_day ?? null,
      );
      return { from: toISODate(p.start), to: toISODate(p.end) };
    }
    if (!from || !to || !isValidISODate(from) || !isValidISODate(to)) return null;
    const len = Math.max(
      1,
      Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1,
    );
    const pEnd = new Date(`${from}T00:00:00`);
    pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd);
    pStart.setDate(pStart.getDate() - (len - 1));
    return { from: toISODate(pStart), to: toISODate(pEnd) };
  }, [preset, from, to, profile?.cycle_start_day, profile?.cycle_end_day]);

  const [prevTotals, setPrevTotals] = useState<{ inflow: number; outflow: number } | null>(null);
  useEffect(() => {
    if (inject || !user || !prevWindow) {
      setPrevTotals(null);
      return;
    }
    let cancelled = false;
    listExpenses(
      supabase,
      user.id,
      0,
      { ...filters, from: prevWindow.from, to: prevWindow.to },
      sort,
      5000,
    )
      .then(({ rows: prevRows }) => {
        if (cancelled) return;
        let inflow = 0;
        let outflow = 0;
        for (const r of prevRows) {
          const v = convert(r);
          if (r.type === "income") inflow += v;
          else outflow += v;
        }
        setPrevTotals({ inflow, outflow });
      })
      .catch(() => {
        if (!cancelled) setPrevTotals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inject, user, supabase, filters, sort, prevWindow, convert]);

  // ±999% past that a tiny previous window makes the pct meaningless.
  const pctDelta = (cur: number, prev: number | undefined): number | null => {
    if (prev == null || prev === 0) return null;
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return Number.isFinite(pct) && Math.abs(pct) <= 999 ? pct : null;
  };

  const totalCount = count || rows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const filterCount = [preset !== "cycle", !!categoryId, !!method, !!accountId, !!min, !!max].filter(
    Boolean,
  ).length;

  const [filtersOpen, setFiltersOpen] = useState(false);
  useBodyScrollLock(filtersOpen);
  const activeFilterCount = filterCount + (flow !== "all" ? 1 : 0);

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
  // no extra queries) so the dropdowns are never blank.
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
  // extra query): the category dropdown shows how many entries each holds.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.category_id) m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const pageRows = useMemo(
    () => rows.slice(page * pageSize, page * pageSize + pageSize),
    [rows, page, pageSize],
  );

  // Insights row: outflow share by category (drills to /analytics) and
  // entry share by payment channel, both over the FULL filtered set.
  const categoryInsights = useMemo(() => {
    const m = new Map<string, { label: string; value: number }>();
    for (const r of rows) {
      if (r.type !== "expense") continue;
      const key = r.categories?.id ?? r.categories?.name ?? "other";
      const cur = m.get(key) ?? { label: r.categories?.name ?? "Other", value: 0 };
      cur.value += convert(r);
      m.set(key, cur);
    }
    return [...m.values()]
      .map((c) => ({
        label: c.label,
        pct: summary.outflow > 0 ? Math.max(1, Math.round((c.value / summary.outflow) * 100)) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  }, [rows, convert, summary.outflow]);
  const channelInsights = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const key = r.payment_method || "Other";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    const total = rows.length || 1;
    return [...m.entries()]
      .map(([label, n]) => ({ label, n, pct: Math.round((n / total) * 100) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 4);
  }, [rows]);

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

  const sortBy = (field: "date" | "amount") => {
    setSortKey((cur) =>
      cur === `${field}_desc` ? (`${field}_asc` as SortKey) : (`${field}_desc` as SortKey),
    );
  };

  // Every filter control in one block — rendered inside the Filters popover
  // (lg+) and the bottom sheet (below lg).
  // Filter controls, split so the laptop row lays them out inline while the
  // mobile Filters sheet groups them with labels.
  const periodControl = (
    <>
            <FloatingSelect
        className="relative w-full"
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
            className="h-9 rounded-lg border border-border bg-input px-2.5 text-[12px] text-text focus:border-primary focus:outline-none"
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
            className="h-9 rounded-lg border border-border bg-input px-2.5 text-[12px] text-text focus:border-primary focus:outline-none"
          />
        </div>
        )}
    </>
  );

  const typeControl = (
            <FloatingSelect
        className="relative w-full"
        label={flow === "all" ? t("histAllTypes") : flow === "expense" ? t("expense") : t("income")}
        open={openMenu === "type"}
        onToggle={() => toggleMenu("type")}
        >
        {[
          { key: "all" as FlowFilter, label: t("histAllTypes") },
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
  );

  const categoryControl = (
            <FloatingSelect
        className="relative w-full"
        label={
          categoryId
            ? railCategories.find((c) => c.value === categoryId)?.label ?? t("histAllCategories")
            : t("histAllCategories")
        }
        open={openMenu === "category"}
        onToggle={() => toggleMenu("category")}
        menuClassName="max-h-64 overflow-y-auto"
        >
        <SelectRow
          selected={categoryId === ""}
          label={t("histAllCategories")}
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
  );

  const accountControl = (
            <FloatingSelect
        className="relative w-full"
        label={
          accountId
            ? railAccounts.find((a) => a.value === accountId)?.label ?? t("histAllAccounts")
            : t("histAllAccounts")
        }
        open={openMenu === "account"}
        onToggle={() => toggleMenu("account")}
        menuClassName="max-h-64 overflow-y-auto"
        >
        <SelectRow
          selected={accountId === ""}
          label={t("histAllAccounts")}
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
  );

  const channelControl = (
            <FloatingSelect
        className="relative w-full"
        label={method || t("histAllChannels")}
        open={openMenu === "channel"}
        onToggle={() => toggleMenu("channel")}
        menuClassName="max-h-64 overflow-y-auto"
        >
        <SelectRow
          selected={method === ""}
          label={t("histAllChannels")}
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
  );

  const sortControl = (
            <FloatingSelect
        className="relative w-full"
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
  );

  return (
    <main className="mx-auto w-full max-w-[1240px]">
      {/* ── Masthead: title + subtitle left, actions right ── */}
      <header className="rise flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold tracking-tight text-text">{t("histTitle")}</h1>
          <p className="mt-1 text-xs text-text-muted">{t("histSubtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <Link
            href="/export"
            aria-label={t("histExportCsv")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text shadow-soft transition-colors hover:bg-surface-elevated lg:hidden"
          >
            <Download size={14} />
          </Link>
          <Link
            href="/export"
            className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-text shadow-soft transition-colors hover:bg-surface-elevated lg:flex"
          >
            <Download size={13} className="text-text-muted" aria-hidden />
            <span>{t("histExportCsv")}</span>
          </Link>
          <Link
            href="/expense/new"
            className="hidden h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-ink shadow-soft transition-colors hover:bg-primary-strong lg:flex"
          >
            <Plus size={14} aria-hidden />
            <span>{t("histNewTx")}</span>
          </Link>
        </div>
      </header>

      {/* ── 4 stat cards ── */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={t("statTotalOutflow")}
          value={bare(summary.outflow)}
          caption={
            prevTotals ? (
              <DeltaChip pct={pctDelta(summary.outflow, prevTotals.outflow)} tone="danger" label={t("histVsPrevPeriod")} />
            ) : (
              <span className="text-[11px] text-faint">
                {summary.expenseCount} {t("expense")}
              </span>
            )
          }
        />
        <StatCard
          label={t("statTotalInflow")}
          value={bare(summary.inflow)}
          caption={
            prevTotals ? (
              <DeltaChip pct={pctDelta(summary.inflow, prevTotals.inflow)} tone="income" label={t("histVsPrevPeriod")} />
            ) : (
              <span className="text-[11px] text-faint">
                {totalCount - summary.expenseCount} {t("income")}
              </span>
            )
          }
        />
        <StatCard
          label={t("statAvgTicket")}
          value={bare(summary.expenseCount > 0 ? summary.outflow / summary.expenseCount : 0)}
          caption={
            <span className="text-[11px] text-faint">
              {summary.expenseCount} {t("expense")}
            </span>
          }
        />
        <StatCard
          label={t("statNetFlow")}
          value={`${summary.net >= 0 ? "+" : "−"}${bare(Math.abs(summary.net))}`}
          caption={
            <span className={`text-[11px] font-semibold ${summary.net >= 0 ? "text-income" : "text-danger"}`}>
              {summary.inflow > 0
                ? t("histSavedPct").replace("{n}", String(Math.round((summary.net / summary.inflow) * 100)))
                : `${totalCount} ${t("entriesLabel")}`}
            </span>
          }
        />
      </section>

      <div className="mt-2 px-1">
        <TodayRateLine
          live={{ income: summary.inflow, expense: summary.outflow }}
          frozen={historyFrozenTotals}
          fmt={fmt}
        />
      </div>

      {/* ── Register card: filter row + ledger + pager ── */}
      <div ref={panelRef} className="mt-5 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-3.5">
          <div className="relative min-w-[200px] flex-1">
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
            <div className="w-[150px]">{periodControl}</div>
            <div className="w-[130px]">{typeControl}</div>
            <div className="w-[170px]">{categoryControl}</div>
            <div className="w-[150px]">{accountControl}</div>
            <div className="w-[150px]">{channelControl}</div>
            <div className="w-[150px]">{sortControl}</div>
          </div>

          {/* below lg: Filters button */}
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
              <ChevronDown
                size={13}
                aria-hidden
                className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {(filterCount > 0 || search) && (
            <button
              onClick={resetAll}
              className="flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors hover:bg-[var(--sf-tint-danger)]"
            >
              {t("clear")}
            </button>
          )}

          <span className="numeric ml-auto whitespace-nowrap text-[11px] font-semibold text-faint">
            {t("histShowing").replace("{n}", String(totalCount))}
          </span>
        </div>

        {/* below lg: filter bottom sheet */}
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
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Period</p>
                  {periodControl}
                </div>
                {/* Native selects in the sheet: the OS renders the option
                    list, so a dropdown can never nest a second scrollbar
                    inside the sheet's own scroll container. Period stays a
                    FloatingSelect (it opens the custom-range calendar). */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Type</p>
                    <SheetSelect
                      ariaLabel="Type"
                      value={flow}
                      onChange={(v) => {
                        setFlow(v as FlowFilter);
                        setPage(0);
                      }}
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
                      onChange={(v) => {
                        setMethod(v);
                        setPage(0);
                      }}
                      options={[
                        { value: "", label: t("histAllChannels") },
                        ...PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Category</p>
                  <SheetSelect
                    ariaLabel="Category"
                    value={categoryId}
                    onChange={(v) => {
                      setCategoryId(v);
                      setPage(0);
                    }}
                    options={[{ value: "", label: t("histAllCategories") }, ...railCategories]}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Account</p>
                  <SheetSelect
                    ariaLabel="Account"
                    value={accountId}
                    onChange={(v) => {
                      setAccountId(v);
                      setPage(0);
                    }}
                    options={[{ value: "", label: t("histAllAccounts") }, ...railAccounts]}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Sort by</p>
                  <SheetSelect
                    ariaLabel="Sort by"
                    value={sortKey}
                    onChange={(v) => {
                      setSortKey(v as SortKey);
                      setPage(0);
                    }}
                    options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
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

        {/* Ledger body */}
        {loading && rows.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={t("error")} message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("noTransactions")}
            message={t("noTransactionsHint")}
            action={
              <button
                onClick={resetAll}
                className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-strong"
              >
                <X size={14} aria-hidden /> {t("clear")}
              </button>
            }
          />
        ) : (
          <>
            {/* lg+ ledger table */}
            <div className="hidden lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-faint">
                    <th className="py-3 pl-5 pr-4 font-semibold">
                      <SortHead label={t("histColDate")} field="date" sortKey={sortKey} onSort={sortBy} />
                    </th>
                    <th className="py-3 px-4 font-semibold">{t("histColMerchant")}</th>
                    <th className="py-3 px-4 font-semibold">{t("histColCategory")}</th>
                    <th className="py-3 px-4 font-semibold">{t("histColAccount")}</th>
                    <th className="py-3 pl-4 pr-5 text-right font-semibold">
                      <SortHead label={t("histColAmount")} field="amount" sortKey={sortKey} onSort={sortBy} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((row) => (
                    <TxTableRow
                      key={row.id}
                      row={row}
                      amount={bare(convert(row))}
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

            {/* Below lg: day-grouped touch list */}
            <div className="lg:hidden">
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
                      {bare(Math.abs(section.total))}{" "}
                      <span className="font-semibold text-faint">{t("histDayNet")}</span>
                    </p>
                  </div>
                  {section.rows.map((row) => (
                    <RegisterRow
                      key={row.id}
                      row={row}
                      amount={bare(convert(row))}
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

            {/* Pager footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <div className="hidden items-center gap-2 sm:flex">
                <span className="hidden text-[11px] text-faint sm:inline">{t("histPerPage")}:</span>
                <FloatingSelect
                  className="relative w-[74px]"
                  label={String(pageSize)}
                  open={openMenu === "pagesize"}
                  onToggle={() => toggleMenu("pagesize")}
                >
                  {PAGE_SIZES.map((n) => (
                    <SelectRow
                      key={n}
                      selected={pageSize === n}
                      label={String(n)}
                      onSelect={() => {
                        setPageSize(n);
                        setPage(0);
                        setOpenMenu(null);
                      }}
                    />
                  ))}
                </FloatingSelect>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="numeric text-[11px] font-semibold text-faint">
                  {t("histPage")} {page + 1} / {pageCount}
                </span>
                <button
                  onClick={() => goPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={13} aria-hidden /> {t("prev")}
                </button>
                <button
                  onClick={() => goPage(Math.min(pageCount - 1, page + 1))}
                  disabled={page >= pageCount - 1}
                  className="flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("next")} <ChevronRight size={13} aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Insights row: category share + channel share ── */}
      {!loading && !error && rows.length > 0 && (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="text-[15px] font-bold text-text">{t("histCategoryInsights")}</h2>
            <div className="mt-4 space-y-3.5">
              {categoryInsights.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-text">{c.label}</span>
                    <span className="numeric font-semibold text-text-muted">{c.pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full bg-income transition-all duration-500" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/analytics"
              className="mt-5 flex items-center justify-center gap-1 border-t border-border pt-3.5 text-xs font-semibold text-income transition-colors hover:brightness-75"
            >
              <span>{t("histViewAnalytics")}</span>
              <ChevronRight size={13} aria-hidden />
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="text-[15px] font-bold text-text">{t("histChannelsTitle")}</h2>
            <div className="mt-4 space-y-3.5">
              {channelInsights.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-text">{c.label}</span>
                    <span className="numeric font-semibold text-text-muted">
                      {c.n} · {c.pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <ExpenseDetailSheet
        row={selected}
        amount={selected ? fmt(convert(selected)) : ""}
        displayCurrency={displayCurrency}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}

/* ── Stat card (console look): caps label, mono figure, caption row. ── */
function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-soft sm:p-5">
      <p className="truncate text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <p className="numeric mt-2.5 truncate text-[22px] font-bold tracking-tight text-text sm:text-[24px]">
        {value}
      </p>
      <div className="mt-2 flex min-h-4 items-center gap-1.5">{caption}</div>
    </div>
  );
}

/* ── Prev-window delta chip: arrow + signed pct + caption. ── */
function DeltaChip({
  pct,
  tone,
  label,
}: {
  pct: number | null;
  tone: "income" | "danger";
  label: string;
}) {
  if (pct == null) {
    return <span className="text-[11px] text-faint">{label}</span>;
  }
  return (
    <>
      <span
        className={`flex items-center gap-0.5 text-xs font-semibold ${
          tone === "income" ? "text-income" : "text-danger"
        }`}
      >
        {pct >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownLeft size={12} aria-hidden />}
        {pct >= 0 ? "+" : "−"}
        {Math.abs(pct)}%
      </span>
      <span className="text-[11px] text-faint">{label}</span>
    </>
  );
}

/* ── Table sort header button. ── */
export function SortHead({
  label,
  field,
  sortKey,
  onSort,
}: {
  label: string;
  field: "date" | "amount";
  sortKey: SortKey;
  onSort: (field: "date" | "amount") => void;
}) {
  const active = sortKey.startsWith(field);
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={label}
      className={`flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-text ${active ? "text-text" : ""}`}
    >
      {label}
      <ArrowUpDown size={11} className={active ? "text-primary" : "opacity-60"} aria-hidden />
    </button>
  );
}

/* ── lg+ ledger table row: date, chip + merchant, category pill, account,
      locked-width mono amount (neutral spend, blue income), hover edit. ── */
export function TxTableRow({
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
  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${row.date}T00:00:00`));
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open record for ${row.description || row.categories?.name || "transaction"}`}
      className="group cursor-pointer text-xs transition-colors hover:bg-surface-elevated/60 focus:bg-surface-elevated/60 focus:outline-none"
    >
      <td className="py-3.5 pl-5 pr-4 text-text-muted">{dateLabel}</td>
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={tileStyle}
            aria-hidden
          >
            <CategoryGlyph size={14} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-text">
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
            <span className="mt-0.5 block truncate text-[10px] text-faint">
              {[row.payment_method, time].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
      </td>
      <td className="py-3.5 px-4">
        {row.categories?.name ? (
          <span className="inline-block max-w-[130px] truncate rounded-full bg-surface-elevated px-2.5 py-1 text-[10px] font-medium text-text-muted">
            {row.categories.name}
          </span>
        ) : null}
      </td>
      <td className="py-3.5 px-4 text-text-muted">{row.bank_accounts?.name ?? row.payment_method ?? "—"}</td>
      <td className="py-3.5 pr-5 pl-4 text-right">
        <span
          className={`numeric inline-block text-right font-bold ${isIncome ? "text-income" : "text-text"}`}
          style={{ minWidth: "104px" }}
        >
          {original && <span className="mr-1 text-[10px] font-bold text-faint">{row.currency}</span>}
          {isIncome ? "+" : "−"}
          {amount}
        </span>
        <Link
          href={`/expense/${row.id}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={editLabel}
          className="ml-2 hidden rounded-md p-1.5 align-middle text-faint opacity-0 transition group-hover:opacity-100 hover:bg-[var(--sf-primary-light)] hover:text-primary focus:opacity-100 lg:inline-block"
        >
          <Pencil size={13} />
        </Link>
      </td>
    </tr>
  );
}

/* ── Touch register row (below lg): chip, name + markers, method · account ·
    time, locked-width amount, hover edit. ── */
export function RegisterRow({
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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
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

      {/* Amount + hover edit. Locked min-width: privacy reveal never shifts. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <span
          className={`figures flex items-center justify-end gap-0.5 text-[14.5px] font-bold ${
            isIncome ? "text-income" : "text-text"
          }`}
          style={{ minWidth: "104px" }}
        >
          {original && <span className="mr-0.5 text-[10px] font-bold text-faint">{row.currency}</span>}
          {isIncome ? "+" : "−"}
          {amount}
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
