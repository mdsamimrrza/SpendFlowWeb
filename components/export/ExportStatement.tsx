"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  FileSpreadsheet,
  FileText,
  Printer,
  Share2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { useRowConverter, useBudget } from "@/hooks/useRates";
import { listExpenses, assertAmountAndDate } from "@/services/expenses";
import { getRateSnapshot } from "@/services/exchange";
import {
  generateExportFileName,
  csvText,
  excelSheets,
  statementHtml,
  stripExportQuote,
} from "@/services/export";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { formatMoney, todayISO, isValidISODate, toISODate, getCycleWindow } from "@/utils/format";

type Period = "today" | "week" | "month" | "year" | "all";

/** Mobile PERIODS list (app/export.tsx) — label keys resolve via t(). */
const PERIODS: { value: Period; labelKey: TranslationKey }[] = [
  { value: "today", labelKey: "periodToday" },
  { value: "week", labelKey: "periodWeek" },
  { value: "month", labelKey: "periodMonth" },
  { value: "year", labelKey: "periodYear" },
  { value: "all", labelKey: "periodAll" },
];

/** Mock dataset for the static design preview (no auth, no network). */
export interface ExportInject {
  rows: Awaited<ReturnType<typeof listExpenses>>["rows"];
}

interface ExportPageProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: ExportInject;
}

/**
 * Export / import — client-side only (mobile services/export.ts parity):
 * CSV / multi-sheet Excel / print-PDF statement of the selected period with
 * the full column set, CSV import with guards (≤ 2 MB, ≤ 1000 rows) that
 * round-trips our own exports.
 */
/** Statement implementation — the default page export renders it bare;
 *  preview harnesses pass inject (mock data, no auth, no network). */
export function ExportStatement({ inject }: ExportPageProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [period, setPeriod] = useState<Period>("month");
  const [busy, setBusy] = useState<null | "csv" | "excel" | "pdf" | "import">(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const budgetConverted = useBudget();

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const load = useCallback(async () => {
    if (!user) return;
    const { rows: fresh } = await listExpenses(supabase, user.id, 0, {}, { field: "date", direction: "desc" }, 1000);
    setRows(fresh);
  }, [user, supabase]);

  useEffect(() => {
    if (inject) {
      setRows(inject.rows);
      return;
    }
    void load();
  }, [inject, load]);

  const range = useMemo((): { from: string; to: string } => {
    const now = new Date();
    if (period === "today") {
      const d = todayISO();
      return { from: d, to: d };
    }
    if (period === "week") {
      // Monday–Sunday of the current week (mobile filterExpensesByPeriod parity).
      const dayOfWeek = now.getDay();
      const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - distanceToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toISODate(monday), to: toISODate(sunday) };
    }
    if (period === "month") {
      // "This month" = the user's current billing cycle (History/analytics
      // parity), not the calendar month — custom cycle starts (cycle_start_day
      // 2–31) shift the window. Cycle start day 1 is the calendar-month
      // sentinel, so default profiles are unaffected.
      const cycle = getCycleWindow(now, profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null);
      return { from: toISODate(cycle.start), to: todayISO() };
    }
    if (period === "year") {
      return { from: `${now.getFullYear()}-01-01`, to: todayISO() };
    }
    return { from: "2000-01-01", to: todayISO() };
  }, [period, profile?.cycle_start_day, profile?.cycle_end_day]);

  const scoped = useMemo(
    () => rows.filter((r) => r.date >= range.from && r.date <= range.to),
    [rows, range],
  );
  const total = useMemo(
    () => scoped.reduce((s, r) => s + (r.type === "income" ? convert(r) : -convert(r)), 0),
    [scoped, convert],
  );
  // Period shape — inflow vs outflow drives the split bar.
  const incomeTotal = useMemo(
    () => scoped.reduce((s, r) => (r.type === "income" ? s + convert(r) : s), 0),
    [scoped, convert],
  );
  const expenseTotal = incomeTotal - total;

  const periodLabel = t(PERIODS.find((p) => p.value === period)?.labelKey ?? "periodMonth");

  const onExportCsv = async () => {
    if (scoped.length === 0) {
      showToast(t("expNoData"), "error");
      return;
    }
    setBusy("csv");
    showToast(t("expGeneratingCsv"));
    try {
      // APK services/export.ts parity: full column set (Date, Type, Time,
      // Amount, Currency, Category, Payment Method, Description, Notes) +
      // the web-only converted amount, BOM + formula guards, month filename.
      const csv = csvText(scoped, convert, displayCurrency);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      triggerDownload(blob, generateExportFileName(scoped, "csv"));
      showToast(`Exported ${scoped.length} entries`, "success");
    } finally {
      setBusy(null);
    }
  };

  const onExportExcel = async () => {
    if (scoped.length === 0) {
      showToast(t("expNoData"), "error");
      return;
    }
    setBusy("excel");
    showToast(t("expGeneratingExcel"));
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const [ledger, summary] = excelSheets(scoped, convert, displayCurrency);
      // v4 browser build: sheet objects + toFile(name) triggers the download.
      await writeXlsxFile([
        { sheet: "Expenses Ledger", data: ledger },
        { sheet: "Category Analytics", data: summary },
      ]).toFile(generateExportFileName(scoped, "xlsx"));
      showToast(`Exported ${scoped.length} entries to Excel`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setBusy(null);
    }
  };

  const onExportPdf = () => {
    if (scoped.length === 0) {
      showToast(t("expNoData"), "error");
      return;
    }
    setBusy("pdf");
    showToast(t("expGeneratingPdf"));
    try {
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        showToast("Allow pop-ups to print the statement", "error");
        return;
      }
      // APK comprehensive statement: letterhead, KPI cards, Budget vs Actual,
      // category pie + breakdown, payment methods, itemized outflow ledger.
      // Figures are unmasked (an exported document is the real record).
      const html = statementHtml({
        rows: scoped,
        convert,
        displayCurrency,
        userName: profile?.display_name || "SpendFlow User",
        userEmail: profile?.email ?? "",
        budgetConverted,
      });
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } finally {
      setBusy(null);
    }
  };

  const onImportCsv = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      showToast("File must be ≤ 2 MB", "error");
      return;
    }
    setBusy("import");
    try {
      const text = await file.text();
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 1001) {
        showToast("Maximum 1000 rows per import", "error");
        return;
      }
      const parseLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else if (ch === '"') inQuotes = false;
            else cur += ch;
          } else if (ch === '"') inQuotes = true;
          else if (ch === ",") {
            out.push(cur);
            cur = "";
          } else cur += ch;
        }
        out.push(cur);
        return out;
      };

      // Header names are matched case-insensitively and space-for-underscore
      // so our own exported files (APK labels: "Payment Method", "Notes"…)
      // round-trip without re-labelling.
      const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/ /g, "_"));
      const idx = (name: string) => header.indexOf(name);
      const iDate = idx("date");
      const iType = idx("type");
      const iCat = idx("category");
      const iDesc = idx("description");
      const iMethod = idx("payment_method");
      const iAmount = idx("amount");
      const iTime = idx("time");
      const iNotes = idx("notes");
      const iCurrency = idx("currency");
      if (iDate < 0 || iAmount < 0) {
        showToast("CSV needs at least `date` and `amount` columns", "error");
        return;
      }

      // Create missing categories, then insert in batches of 200.
      const categoryNames = new Set<string>();
      const parsed: {
        date: string;
        type: "expense" | "income";
        category: string;
        description: string;
        method: string;
        amount: number;
        currency: string;
        time: string | null;
        notes: string | null;
      }[] = [];
      for (const line of lines.slice(1)) {
        const c = parseLine(line);
        const date = c[iDate]?.trim() ?? "";
        const amount = Number(c[iAmount]);
        // isValidISODate first (real calendar day — the shared validator only
        // compares ranges), then the same money/date rules as every other
        // write path (services/expenses.ts). Invalid rows are skipped, as before.
        if (!isValidISODate(date)) continue;
        try {
          assertAmountAndDate(amount, date);
        } catch {
          continue;
        }
        const category = stripExportQuote((iCat >= 0 ? c[iCat]?.trim() : "") || "Other");
        // Categories mirror services/categories.ts 1–40-char cap; over-long names
        // are left uncapped in the row and fall back to an existing category.
        if (category && category.length <= 40) categoryNames.add(category);
        const rawTime = iTime >= 0 ? (c[iTime]?.trim() ?? "") : "";
        parsed.push({
          date,
          type: (iType >= 0 ? c[iType]?.trim().toLowerCase() : "expense") === "income" ? "income" : "expense",
          category,
          description: (iDesc >= 0 ? stripExportQuote(c[iDesc]?.trim() ?? "") : "").slice(0, 200),
          method: iMethod >= 0 ? c[iMethod]?.trim() || "Cash" : "Cash",
          amount,
          currency:
            iCurrency >= 0 && /^[A-Za-z]{3}$/.test(c[iCurrency]?.trim() ?? "")
              ? c[iCurrency].trim().toUpperCase()
              : displayCurrency,
          time: /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTime) ? rawTime : null,
          notes: iNotes >= 0 ? stripExportQuote(c[iNotes]?.trim() ?? "").slice(0, 2000) || null : null,
        });
      }
      if (parsed.length === 0) {
        showToast("No valid rows found (need ISO dates, positive amounts)", "error");
        return;
      }

      const existing = await listCategoriesSafe(supabase, user!.id);
      const catByName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
      const fallback =
        existing.find((c) => c.name.toLowerCase() === "other income") ??
        existing.find((c) => c.type === "expense");
      if (!fallback) {
        showToast("Create at least one category first", "error");
        return;
      }
      for (const name of categoryNames) {
        if (!catByName.has(name.toLowerCase())) {
          const { data: created } = await supabase
            .from("categories")
            .insert({
              user_id: user!.id,
              name,
              icon: "🏷️",
              color: "#8B978F",
              type: "expense",
              is_custom: true,
            })
            .select("id, name")
            .single();
          if (created) catByName.set(name.toLowerCase(), created as unknown as { id: string; name: string; type: string });
        }
      }

      let imported = 0;
      const snapshotCache = new Map<string, { exchange_rate_to_usd: number; base_currency: string }>();
      for (let i = 0; i < parsed.length; i += 200) {
        const batch = parsed.slice(i, i + 200);
        const inserts = [];
        for (const p of batch) {
          // FX snapshot per row (mobile parity) — cached per currency+date.
          const snapKey = `${p.currency}:${p.date}`;
          if (!snapshotCache.has(snapKey)) {
            snapshotCache.set(snapKey, await getRateSnapshot(supabase, p.currency, p.date));
          }
          inserts.push({
            user_id: user!.id,
            category_id: catByName.get(p.category.toLowerCase())?.id ?? fallback.id,
            amount: p.amount,
            currency: p.currency,
            type: p.type,
            time: p.time,
            notes: p.notes,
            description: p.description || null,
            date: p.date,
            payment_method: (["Cash", "Card", "UPI", "Other"].includes(p.method) ? p.method : "Other") as
              | "Cash"
              | "Card"
              | "UPI"
              | "Other",
            is_synced: true,
            exchange_rate_to_usd: snapshotCache.get(snapKey)!.exchange_rate_to_usd,
            base_currency: snapshotCache.get(snapKey)!.base_currency,
          });
        }
        const { error } = await supabase.from("expenses").insert(inserts);
        if (error) throw error;
        imported += inserts.length;
      }
      setImportResult(`Imported ${imported} entries into ${displayCurrency}.`);
      showToast(`Imported ${imported} entries`, "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[560px] space-y-4 p-0.5 pb-6">
      {/* ── 1. HEADER ── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.6px] text-text-muted">
            {t("expKicker")}
          </p>
          <h1 className="mt-0.5 text-[28px] font-extrabold leading-[34px] tracking-tight text-text">
            {t("expCenter")}
          </h1>
        </div>
        <Link
          href="/settings"
          aria-label={t("close")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface-elevated text-text transition active:opacity-70"
        >
          <X size={18} aria-hidden />
        </Link>
      </div>

      {/* ── 2. PERIOD SELECTOR PILLS ── */}
      <div className="space-y-2">
        <p className="text-sm font-extrabold text-text">{t("expSelectPeriod")}</p>
        <div className="scroll-x flex gap-2 overflow-x-auto py-0.5">
          {PERIODS.map((p) => {
            const active = period === p.value;
            return (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-4 py-2 text-[13px] transition active:opacity-80 ${
                  active
                    ? "border-primary bg-primary font-extrabold text-white"
                    : "border-border bg-surface-elevated font-semibold text-text-muted"
                }`}
              >
                {t(p.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. STATEMENT PREVIEW CARD ── */}
      <section className="space-y-3 rounded-[16px] border-[1.5px] border-primary bg-[var(--sf-studio-gauge-bg)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Wallet size={16} className="shrink-0 text-primary" aria-hidden />
            <span className="truncate text-[11px] font-extrabold uppercase tracking-[0.6px] text-primary">
              {t("expSummary").replace("{period}", periodLabel)}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-text-muted">
            {t("expTransactionsIncluded").replace("{count}", String(scoped.length))}
          </span>
        </div>
        <div>
          <p className="truncate text-[32px] font-extrabold leading-9 tracking-[-0.5px] text-text tabular-nums">
            {fmt(expenseTotal)}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {t("expVerifiedRecord")} • {displayCurrency}
          </p>
        </div>
      </section>

      {/* ── 4. EXPORT ACTION BUTTONS ── */}
      <div className="space-y-3">
        <p className="text-sm font-extrabold text-text">{t("expGenerate")}</p>

        {/* PDF Statement (primary highlight) */}
        <button
          onClick={() => void onExportPdf()}
          disabled={!!busy}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-primary p-4 text-left shadow-[0_6px_10px_color-mix(in_srgb,var(--sf-primary)_35%,transparent)] transition active:opacity-90 disabled:opacity-70"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20 text-white">
              {busy === "pdf" ? <BusyRing /> : <Printer size={22} aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-white">{t("expPdfTitle")}</span>
                <span className="rounded bg-white px-1.5 py-px text-[10px] font-extrabold text-primary">
                  {t("expRecommended")}
                </span>
              </span>
              <span className="block truncate text-xs text-white/80">{t("expPdfSub")}</span>
            </span>
          </span>
          <ArrowDownToLine size={20} className="shrink-0 text-white" aria-hidden />
        </button>

        {/* Excel XLSX */}
        <button
          onClick={() => void onExportExcel()}
          disabled={!!busy}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated p-4 text-left transition active:opacity-80 disabled:opacity-70"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sf-export-excel-bg)] text-success">
              {busy === "excel" ? <BusyRing tone="text-success" /> : <FileSpreadsheet size={22} aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold text-text">{t("expExcelTitle")}</span>
              <span className="block truncate text-xs text-text-muted">{t("expExcelSub")}</span>
            </span>
          </span>
          <Share2 size={18} className="shrink-0 text-text-muted" aria-hidden />
        </button>

        {/* CSV */}
        <button
          onClick={() => void onExportCsv()}
          disabled={!!busy}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated p-4 text-left transition active:opacity-80 disabled:opacity-70"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sf-export-csv-bg)] text-hue-sky">
              {busy === "csv" ? <BusyRing tone="text-hue-sky" /> : <FileText size={22} aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold text-text">{t("expCsvTitle")}</span>
              <span className="block truncate text-xs text-text-muted">{t("expCsvSub")}</span>
            </span>
          </span>
          <Share2 size={18} className="shrink-0 text-text-muted" aria-hidden />
        </button>
      </div>

      {/* ── 5. IMPORT SECTION ── */}
      <div className="space-y-2.5 pt-1">
        <p className="text-sm font-extrabold text-text">{t("expBackupTitle")}</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-surface-elevated p-3.5 transition active:opacity-75">
          {busy === "import" ? (
            <BusyRing tone="text-primary" />
          ) : (
            <Upload size={16} className="text-primary" aria-hidden />
          )}
          <span className="text-xs font-bold text-primary">{t("expImportCsv")}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportCsv(f);
              e.target.value = "";
            }}
          />
        </label>
        {importResult && (
          <p className="rounded-xl bg-primary-light px-3 py-2 text-xs font-bold text-income">
            {importResult}
          </p>
        )}
      </div>

      <p className="text-center text-[10px] text-text-muted opacity-55">
        Export build v7 · web
      </p>
    </main>
  );
}

/** Mobile ActivityIndicator parity — small ring inside action chips. */
function BusyRing({ tone = "text-white" }: { tone?: string }) {
  return (
    <span
      aria-hidden
      className={`block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${tone}`}
    />
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function listCategoriesSafe(supabase: ReturnType<typeof getSupabaseBrowserClient>, userId: string) {
  const { data } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("user_id", userId)
    .order("name");
  return (data ?? []) as { id: string; name: string; type: string }[];
}
