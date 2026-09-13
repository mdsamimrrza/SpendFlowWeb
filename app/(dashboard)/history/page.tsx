"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, Search, X } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { useRowConverter } from "@/hooks/useRates";
import { FlowSummaryBar } from "@/components/dashboard/FlowSummaryBar";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney } from "@/utils/format";
import type { ExpenseFilters, ExpenseRow } from "@/services/expenses";

type FlowFilter = "all" | "expense" | "income";

/**
 * History — ledger page: flow summary bar, integrated toolbar, and a data
 * table with color-coded categories and aligned amounts.
 */
export default function HistoryPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [flow, setFlow] = useState<FlowFilter>("all");
  const [page, setPage] = useState(0);

  // 300 ms debounce (mobile parity)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: ExpenseFilters = useMemo(
    () => ({
      search: debounced || undefined,
      type: flow === "all" ? undefined : flow,
    }),
    [debounced, flow],
  );

  // Full filtered dataset (server-side search/filters, 5000 cap): totals and
  // pagination must cover every matching entry, not just a page slice.
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { rows: fresh, count: total } = await listExpenses(
          supabase,
          user.id,
          0,
          filters,
          { field: "date", direction: "desc" },
          5000,
        );
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
  }, [user, supabase, filters, t]);

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
    return { outflow, inflow, peak, peakLabel };
  }, [rows, convert]);

  // Client-side pagination slice over the full filtered set.
  const pageRows = useMemo(
    () => rows.slice(page * 15, page * 15 + 15),
    [rows, page],
  );

  // Ledger grouping: split rows into date sections with day totals.
  const sections = useMemo(() => {
    const out: { date: string; rows: ExpenseRow[]; total: number }[] = [];
    for (const row of pageRows) {
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
  }, [pageRows, convert]);

  const totalCount = count || rows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / 15));
  const isFiltered = !!(debounced || flow !== "all");

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">{t("history")}</h1>
          <p className="text-sm text-text-muted">
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
          peak={
            summary.peak > 0
              ? { label: summary.peakLabel, value: fmt(summary.peak) }
              : null
          }
          entriesLabel={t("totalInflow")}
        />
      </div>

      {/* Table card with integrated toolbar */}
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-elevated/40 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-9 w-full rounded-md border border-border bg-input pl-9 pr-8 text-sm text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label={t("clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex rounded-md border border-border bg-input p-0.5">
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
          {isFiltered && (
            <button
              onClick={() => {
                setSearch("");
                setFlow("all");
              }}
              className="flex items-center gap-1 rounded-full bg-rust-tint px-3 py-1.5 text-[11px] font-bold text-rust transition hover:opacity-80"
            >
              {t("filtered")} <X size={12} />
            </button>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState icon="⚠️" title={t("error")} message={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon="🧾" title={t("noTransactions")} message={t("noTransactionsHint")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              {/* running page totals rendered after tbody via tfoot below */}
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-faint">
                  <th className="px-5 py-2.5">Transaction</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                  <th className="w-10 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <Fragment key={section.date}>
                    <tr className="border-b border-border bg-surface-elevated/60">
                      <td colSpan={6} className="px-5 py-1.5">
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
                        showBadge={row.currency !== displayCurrency}
                        editLabel={t("editExpense")}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
              {(() => {
                const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + convert(r), 0);
                const outflow = rows.filter((r) => r.type !== "income").reduce((s, r) => s + convert(r), 0);
                const net = income - outflow;
                return (
                  <tfoot>
                    <tr className="end-rule bg-surface-elevated/50">
                      <td colSpan={4} className="px-5 py-2.5">
                        <span className="caps">Totals — {rows.length} matching entries</span>
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-xs font-extrabold text-text">
                        <span className="text-income">+{fmt(income).replace(/^[^\d]*/, "")}</span>
                        {" / "}
                        <span className="text-danger">−{fmt(outflow).replace(/^[^\d]*/, "")}</span>
                      </td>
                      <td className="px-5 py-2.5" />
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-5 pb-2 pt-1">
                        <span className="caps-faint">Net</span>
                      </td>
                      <td className={`numeric px-3 pb-2 pt-1 text-right text-xs font-extrabold ${net >= 0 ? "text-income" : "text-danger"}`}>
                        {net >= 0 ? "+" : "−"}
                        {fmt(Math.abs(net)).replace(/^[^\d]*/, "")}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-xs font-bold text-faint">
              Showing {pageRows.length} of {rows.length} matching · page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-bold text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
              >
                <ChevronLeft size={13} /> {t("prev")}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-bold text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
              >
                {t("next")} <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function HistoryRow({
  row,
  amount,
  showBadge,
  editLabel,
}: {
  row: ExpenseRow;
  amount: string;
  showBadge: boolean;
  editLabel: string;
}) {
  const isIncome = row.type === "income";
  return (
    <tr className="group border-b border-border/50 transition last:border-0 hover:bg-surface-elevated/40">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className="h-7 w-1 shrink-0"
            style={{ backgroundColor: row.categories?.color ?? "#8B978F" }}
            aria-hidden
          />
          <span className="max-w-[280px] truncate font-semibold text-text">
            {row.description || row.categories?.name || "Transaction"}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-text-muted">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: row.categories?.color ?? "#8B978F" }}
          />
          {row.categories?.name ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
          {row.payment_method}
        </span>
      </td>
      <td className={`numeric px-3 py-2.5 text-right font-extrabold ${isIncome ? "text-income" : "text-text"}`}>
        <span className="inline-flex items-center gap-0.5">
          {isIncome ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} className="text-danger" />}
          {showBadge && <span className="mr-0.5 text-[10px] font-bold text-faint">{row.currency}</span>}
          {amount}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-right">
        <Link
          href={`/expense/${row.id}`}
          aria-label={editLabel}
          className="inline-flex rounded-md p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:bg-primary-light hover:text-primary"
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
