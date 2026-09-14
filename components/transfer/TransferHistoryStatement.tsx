"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { ConfirmDialog } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, toISODate } from "@/utils/format";
import { deleteTransfer, listTransfers, type TransferRow } from "@/services/transfers";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";

type Preset = "all" | "month" | "3m" | "year" | "custom";
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const SORTS: { key: SortKey; labelKey: TranslationKey }[] = [
  { key: "date_desc", labelKey: "sortNewest" as const },
  { key: "date_asc", labelKey: "sortOldest" as const },
  { key: "amount_desc", labelKey: "sortLargest" as const },
  { key: "amount_asc", labelKey: "sortSmallest" as const },
];

const PRESETS: { id: Preset; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "filterAll" as const },
  { id: "month", labelKey: "filterThisMonth" as const },
  { id: "3m", labelKey: "filter3Months" as const },
  { id: "year", labelKey: "filterThisYear" as const },
  { id: "custom", labelKey: "filterCustom" as const },
];

/** Mock dataset for the static design preview (no auth, no network). */
export interface TransferHistoryInject {
  rows: TransferRow[];
}

interface TransferHistoryPageProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: TransferHistoryInject;
}

/** Transfer log — chronological register of internal movements, web-sized:
 *  filter register (period/sort), per-row detail sheet with the locked FX
 *  math, and all-time movement between the shown pair. */
/** Statement implementation — the default page export renders it bare;
 *  preview harnesses pass inject (mock data, no auth, no network). */
export function TransferHistoryStatement({ inject }: TransferHistoryPageProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<TransferRow | null>(null);
  const [selected, setSelected] = useState<TransferRow | null>(null);

  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setRows(await listTransfers(supabase, user.id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setLoading(false);
    }
  }, [user, supabase, showToast, t]);

  useEffect(() => {
    if (inject) {
      setRows(inject.rows);
      setLoading(false);
      return;
    }
    void load();
  }, [inject, load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number, cur: string) => mask(formatMoney(n, cur, locale));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "all") {
      setFrom("");
      setTo("");
    } else if (p === "month") {
      setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      setTo(toISODate(now));
    } else if (p === "3m") {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 3);
      setFrom(toISODate(s));
      setTo(toISODate(now));
    } else if (p === "year") {
      setFrom(`${now.getFullYear()}-01-01`);
      setTo(toISODate(now));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!q) return true;
      return (
        (r.from_account?.name ?? "").toLowerCase().includes(q) ||
        (r.to_account?.name ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    });
    out = [...out].sort((a, b) => {
      if (sortKey === "amount_desc") return b.amount - a.amount;
      if (sortKey === "amount_asc") return a.amount - b.amount;
      const c = a.date.localeCompare(b.date);
      return sortKey === "date_asc" ? c : -c;
    });
    return out;
  }, [rows, search, from, to, sortKey]);

  const isFiltered = !!(search.trim() || preset !== "all");

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteTransfer(supabase, user!.id, confirmDelete.id);
      setConfirmDelete(null);
      showToast(t("deleted"), "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  // Register telemetry — shape of the movement history at a glance.
  const crossCurrency = filtered.filter((r) => r.from_currency !== r.to_currency).length;
  const withFees = filtered.filter((r) => r.fee > 0).length;

  return (
    <main className="mx-auto w-full max-w-[1000px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">{t("registerEyebrow")}</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("transferLog")}</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchTransfers")}
              aria-label={t("searchTransfers")}
              className="h-10 w-full rounded-full border border-border bg-input pl-9 pr-4 text-sm text-text placeholder:text-faint focus:border-primary focus:outline-none sm:w-56"
            />
          </div>
          <Link href="/transfer">
            <Button variant="secondary">{t("newTransfer")}</Button>
          </Link>
        </div>
      </header>

      {/* Register telemetry strip */}
      <div className="panel mb-4 grid grid-cols-3 divide-x divide-border">
        <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
          <p className="caps">{t("entriesLabel")}</p>
          <p className="figures mt-1 text-xl font-bold text-text sm:text-2xl">
            {filtered.length}
            {isFiltered && <span className="text-sm font-semibold text-faint"> / {rows.length}</span>}
          </p>
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
          <p className="caps">
            <span className="sm:hidden">{t("fxShort")}</span>
            <span className="hidden sm:inline">{t("crossCurrencyLabel")}</span>
          </p>
          <p className="figures mt-1 text-xl font-bold text-text sm:text-2xl">{crossCurrency}</p>
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
          <p className="caps">
            <span className="sm:hidden">{t("feesShort")}</span>
            <span className="hidden sm:inline">{t("withFeeLabel")}</span>
          </p>
          <p className={`figures mt-1 text-xl font-bold sm:text-2xl ${withFees > 0 ? "text-brass" : "text-text"}`}>
            {withFees}
          </p>
        </div>
      </div>

      {/* Filter band */}
      <div className="panel mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              aria-pressed={preset === p.id}
              className={`h-8 rounded-full px-3 text-[11px] font-bold uppercase tracking-[0.06em] transition ${
                preset === p.id
                  ? "bg-primary text-white shadow-soft dark:text-background"
                  : "bg-surface-elevated text-text-muted hover:text-text"
              }`}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-full border border-border bg-input px-3 text-xs text-text focus:border-primary focus:outline-none"
            />
            <span className="text-faint">→</span>
            <input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-full border border-border bg-input px-3 text-xs text-text focus:border-primary focus:outline-none"
            />
          </div>
        )}
        {isFiltered && (
          <button
            onClick={() => {
              setSearch("");
              applyPreset("all");
            }}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rust transition-colors hover:bg-rust-tint"
          >
            {t("resetFilter")}
          </button>
        )}
        <select
          aria-label="Sort entries"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="ml-auto h-8 rounded-full border border-border bg-input px-3 text-[11px] font-bold text-text-muted focus:border-primary focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("noTransfersTitle")}
          message={
            rows.length === 0
              ? t("noTransfersMsg")
              : t("noTransfersFilteredMsg")
          }
        />
      ) : (
        <Panel label={`${t("movementsLabel")} — ${filtered.length}${isFiltered ? ` of ${rows.length}` : ""}`}>
          <div>
            {filtered.map((r, i) => (
              <div
                key={r.id}
                onClick={() => setSelected(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(r);
                }}
                tabIndex={0}
                role="button"
                aria-label={t("transferRecord")}
                className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-surface-elevated/40 focus:bg-surface-elevated/60 focus:outline-none sm:px-5 ${
                  i < filtered.length - 1 ? "border-b border-border/60" : ""
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary"
                  aria-hidden
                >
                  <ArrowRight size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {r.from_account?.name ?? "—"}{" "}
                    <ArrowRight size={11} className="inline text-faint" /> {r.to_account?.name ?? "—"}
                  </p>
                  <p className="truncate text-[11px] text-faint">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
                      new Date(`${r.date}T00:00:00`),
                    )}
                    {r.notes ? ` · ${r.notes}` : ""}
                    {r.fee > 0 ? ` · fee ${fmt(r.fee, r.from_currency)}` : ""}
                  </p>
                </div>
                <div className="w-[112px] shrink-0 text-right sm:w-auto">
                  <p className="numeric text-sm font-extrabold text-text">
                    {CURRENCY_DETAILS[r.from_currency as CurrencyCode]?.symbol ?? ""}
                    {mask(formatMoney(r.amount, r.from_currency, locale)).replace(/^[^\d]*/, "")}
                  </p>
                  {r.from_currency !== r.to_currency && (
                    <p className="numeric text-[10px] text-faint">
                      @ {r.exchange_rate.toFixed(4)} →{" "}
                      {mask(formatMoney(r.converted_amount, r.to_currency, locale)).replace(/^[^\d]*/, "")}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(r);
                  }}
                  aria-label={t("deleteTransferTitle")}
                  className="shrink-0 p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-danger focus:opacity-100 max-sm:hidden"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <TransferDetailSheet
        row={selected}
        all={rows}
        locale={locale}
        mask={mask}
        onClose={() => setSelected(null)}
        onDelete={(r) => {
          setSelected(null);
          setConfirmDelete(r);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title={t("deleteTransferTitle")}
        body={t("deleteTransferBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </main>
  );
}

/** Movement record sheet — locked FX math + all-time movement between the pair. */
function TransferDetailSheet({
  row,
  all,
  locale,
  mask,
  onClose,
  onDelete,
}: {
  row: TransferRow | null;
  all: TransferRow[];
  locale: string;
  mask: (v: string) => string;
  onClose: () => void;
  onDelete: (row: TransferRow) => void;
}) {
  const { t } = useLanguage();
  if (!row) return null;
  const sameCurrency = row.from_currency === row.to_currency;
  const pair = all.filter(
    (r) => r.from_account_id === row.from_account_id && r.to_account_id === row.to_account_id,
  );
  const pairTotal = pair.reduce((s, r) => s + r.amount, 0);
  const fmt = (n: number, cur: string) => mask(formatMoney(n, cur, locale));
  const dFmt = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const tFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });

  return (
    <SlideOver
      open={!!row}
      title={t("transferRecord")}
      onClose={onClose}
      footer={
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            className="!text-danger hover:bg-rust-tint"
            onClick={() => onDelete(row)}
          >
            <Trash2 size={14} /> {t("delete")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      }
    >
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-elevated px-2.5 py-1 text-[11px] font-semibold text-text">
            {row.from_account?.name ?? "—"}
          </span>
          <ArrowRight size={13} className="shrink-0 text-faint" aria-hidden />
          <span className="rounded-full bg-surface-elevated px-2.5 py-1 text-[11px] font-semibold text-text">
            {row.to_account?.name ?? "—"}
          </span>
        </div>
        <p className="figures mt-3 text-[32px] font-bold leading-none text-text">
          {fmt(row.amount, row.from_currency)}
          <span className="ml-1.5 text-xs font-normal text-faint">{row.from_currency}</span>
        </p>
        {!sameCurrency && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-bg px-3 py-1 text-xs text-text-muted">
            {t("arrivesAs")}{" "}
            <span className="numeric font-bold text-text">{fmt(row.converted_amount, row.to_currency)}</span>{" "}
            ({row.to_currency})
          </p>
        )}
        <p className="stamp mt-3 leading-relaxed">
          {sameCurrency
            ? "Same currency — no conversion"
            : `1 ${row.from_currency} = ${row.exchange_rate.toFixed(6)} ${row.to_currency} · rate locked at posting (DB-enforced ±0.05)`}
        </p>
      </div>

      <div className="border-t border-border px-5">
        <Field label={t("date")}>
          {dFmt.format(new Date(`${row.date}T00:00:00`))}
          {row.time ? ` · ${tFmt.format(new Date(`${row.date}T${row.time}`))}` : ""}
        </Field>
        <Field label={t("feeLabel")}>{row.fee > 0 ? fmt(row.fee, row.from_currency) : <span className="text-faint">—</span>}</Field>
        <Field label={t("notesLabel")}>{row.notes || <span className="text-faint">—</span>}</Field>
        <Field label="Movement between these two">
          <span className="numeric font-bold text-text">{pair.length}</span> transfer
          {pair.length === 1 ? "" : "s"} ·{" "}
          <span className="numeric font-bold text-text">{fmt(pairTotal, row.from_currency)}</span>{" "}
          {row.from_currency} all-time
        </Field>
        <Field label="Recorded">
          <span className="numeric text-xs">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</span>
        </Field>
      </div>

      <div className="px-5 py-4">
        <p className="stamp">Form SF-01 · movement ref {row.id.slice(0, 8).toUpperCase()}</p>
      </div>
    </SlideOver>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border/60 py-2.5 last:border-0">
      <span className="caps-faint shrink-0 pt-0.5">{label}</span>
      <span className="min-w-0 text-right text-sm text-text">{children}</span>
    </div>
  );
}
