"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileUp, Printer } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { useRowConverter, useBudget } from "@/hooks/useRates";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Card";
import { listExpenses } from "@/services/expenses";
import { getRateSnapshot } from "@/services/exchange";
import {
  generateExportFileName,
  csvText,
  excelSheets,
  statementHtml,
  stripExportQuote,
} from "@/services/export";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, todayISO, isValidISODate, toISODate, getCycleWindow } from "@/utils/format";

type Period = "month" | "year" | "all";

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
  const incomeShare = incomeTotal + expenseTotal > 0 ? incomeTotal / (incomeTotal + expenseTotal) : 0;

  const onExportCsv = async () => {
    setBusy("csv");
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
    setBusy("excel");
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
    setBusy("pdf");
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
        if (!isValidISODate(date) || !Number.isFinite(amount) || amount <= 0) continue;
        const category = stripExportQuote((iCat >= 0 ? c[iCat]?.trim() : "") || "Other");
        categoryNames.add(category);
        const rawTime = iTime >= 0 ? (c[iTime]?.trim() ?? "") : "";
        parsed.push({
          date,
          type: (iType >= 0 ? c[iType]?.trim().toLowerCase() : "expense") === "income" ? "income" : "expense",
          category,
          description: iDesc >= 0 ? stripExportQuote(c[iDesc]?.trim() ?? "") : "",
          method: iMethod >= 0 ? c[iMethod]?.trim() || "Cash" : "Cash",
          amount,
          currency:
            iCurrency >= 0 && /^[A-Za-z]{3}$/.test(c[iCurrency]?.trim() ?? "")
              ? c[iCurrency].trim().toUpperCase()
              : displayCurrency,
          time: /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTime) ? rawTime : null,
          notes: iNotes >= 0 ? stripExportQuote(c[iNotes]?.trim() ?? "") || null : null,
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
    <main className="mx-auto w-full max-w-[880px]">
      <header className="mb-5">
        <p className="caps !text-primary-strong">{t("recordsEyebrow")}</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("exportImportTitle")}</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>

      <Panel label={t("statementLabel")}>
        <div className="p-4 sm:p-5">
          {/* Period selector — pill tray */}
          <div className="flex rounded-full bg-surface-elevated p-1" role="group" aria-label="Statement period">
            {(["month", "year", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`h-9 flex-1 rounded-full text-xs font-semibold transition ${
                  period === p ? "bg-primary text-white shadow-soft dark:text-background" : "text-text-muted hover:text-text"
                }`}
              >
                {p === "month" ? t("filterThisMonth") : p === "year" ? t("filterThisYear") : t("filterAll")}
              </button>
            ))}
          </div>

          {/* Preview — range + shape + net */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr] sm:items-end">
            <div>
              <p className="caps">{t("previewLabel")}</p>
              <p className="numeric mt-1 text-sm font-bold text-text">
                {range.from} → {range.to}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">
                {scoped.length} {scoped.length === 1 ? "entry" : "entries"} · {displayCurrency}
              </p>
              {/* Inflow vs outflow split — the period at a glance. */}
              {scoped.length > 0 && (
                <>
                  <div className="mt-3 flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-elevated" role="img" aria-label="Inflow vs outflow split">
                    <span className="h-full bg-income" style={{ width: `${incomeShare * 100}%` }} />
                    <span className="h-full" style={{ width: `${(1 - incomeShare) * 100}%`, backgroundColor: "var(--sf-danger)" }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-income" aria-hidden /> {t("inShort")} {fmt(incomeTotal)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden /> {t("outShort")} {fmt(expenseTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-surface-elevated/50 px-4 py-3 sm:text-right">
              <p className="caps">{t("netLabel")}</p>
              <p className={`figures mt-1 text-2xl font-bold ${total >= 0 ? "text-income" : "text-danger"}`}>
                {fmt(total)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onExportPdf} loading={busy === "pdf"} disabled={scoped.length === 0}>
              <Printer size={15} /> {t("printPdf")}
            </Button>
            <Button variant="secondary" onClick={onExportExcel} loading={busy === "excel"} disabled={scoped.length === 0}>
              <FileSpreadsheet size={15} /> {t("exportExcel")}
            </Button>
            <Button variant="secondary" onClick={onExportCsv} loading={busy === "csv"} disabled={scoped.length === 0}>
              <Download size={15} /> {t("downloadCsv")}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel label={t("importLabel")} className="mt-4">
        <div className="p-4 sm:p-5">
          {/* Dropzone-style chooser — the whole tile is the label. */}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary hover:bg-surface-elevated">
            {busy === "import" ? (
              <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <FileUp size={26} className="text-faint" aria-hidden />
            )}
            <span className="mt-1 text-sm font-bold text-text">
              {busy === "import" ? t("importing") : t("chooseCsv")}
            </span>
            <span className="max-w-sm text-[11px] leading-relaxed text-text-muted">
              Columns <code className="font-bold text-text">date, type, time, amount, currency, category, payment_method, description, notes</code> — only{" "}
              <code className="font-bold text-text">date</code> and <code className="font-bold text-text">amount</code> are required. Our own CSV export round-trips.
            </span>
            <span className="mt-1 flex flex-wrap justify-center gap-1.5">
              {["≤ 2 MB", "≤ 1000 rows", "ISO dates", "Positive amounts"].map((g) => (
                <span key={g} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-faint">
                  {g}
                </span>
              ))}
            </span>
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
            <p className="mt-3 rounded-xl bg-primary-light px-3 py-2 text-xs font-bold text-income">{importResult}</p>
          )}
        </div>
      </Panel>
    </main>
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
