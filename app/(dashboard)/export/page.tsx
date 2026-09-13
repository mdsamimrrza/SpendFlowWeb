"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { useRowConverter } from "@/hooks/useRates";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Card";
import { listExpenses } from "@/services/expenses";
import { getRateSnapshot } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, currencyDecimals, todayISO, isValidISODate , toISODate } from "@/utils/format";

type Period = "month" | "year" | "all";

/**
 * Export / import — client-side only (mobile services/export.ts parity):
 * CSV ledger export of the selected period, CSV import with guards
 * (≤ 2 MB, ≤ 1000 rows), PDF via the browser print dialog.
 */
export default function ExportPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [period, setPeriod] = useState<Period>("month");
  const [busy, setBusy] = useState<null | "csv" | "pdf" | "import">(null);
  const [importResult, setImportResult] = useState<string | null>(null);

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
    void load();
  }, [load]);

  const range = useMemo((): { from: string; to: string } => {
    const now = new Date();
    if (period === "month") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISODate(from), to: todayISO() };
    }
    if (period === "year") {
      return { from: `${now.getFullYear()}-01-01`, to: todayISO() };
    }
    return { from: "2000-01-01", to: todayISO() };
  }, [period]);

  const scoped = useMemo(
    () => rows.filter((r) => r.date >= range.from && r.date <= range.to),
    [rows, range],
  );
  const total = useMemo(
    () => scoped.reduce((s, r) => s + (r.type === "income" ? convert(r) : -convert(r)), 0),
    [scoped, convert],
  );

  const onExportCsv = async () => {
    setBusy("csv");
    try {
      const header = "date,type,category,description,payment_method,currency,amount,converted_" + displayCurrency;
      const lines = scoped.map((r) => {
        const cells = [
          r.date,
          r.type,
          r.categories?.name ?? "",
          r.description ?? "",
          r.payment_method,
          r.currency,
          String(r.amount),
          convert(r).toFixed(currencyDecimals(displayCurrency)),
        ];
        // Quote + escape per RFC 4180; neutralize formula injection.
        return cells
          .map((c) => {
            const v = /^[=+\-@]/.test(c) ? `'${c}` : c;
            return `"${v.replace(/"/g, '""')}"`;
          })
          .join(",");
      });
      const csv = `\uFEFF${header}\n${lines.join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      triggerDownload(blob, `spendflow-${period}-${todayISO()}.csv`);
      showToast(`Exported ${scoped.length} entries`, "success");
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
      const body = scoped
        .map(
          (r) => `<tr>
            <td>${r.date}</td>
            <td>${escapeHtml(r.categories?.name ?? "")}</td>
            <td>${escapeHtml(r.description ?? "")}</td>
            <td style="text-align:right">${escapeHtml(fmt(convert(r)))}</td>
          </tr>`,
        )
        .join("");
      win.document.write(`<!doctype html><html><head><title>SpendFlow statement</title>
        <style>
          body{font-family:Georgia,serif;margin:40px;color:#17241f}
          h1{font-size:22px;border-bottom:2px solid #0f5c4d;padding-bottom:8px}
          .caps{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#4b5c55}
          table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px;font-family:sans-serif}
          th{text-align:left;border-bottom:1px solid #999;padding:6px;text-transform:uppercase;font-size:10px;letter-spacing:.08em}
          td{border-bottom:1px solid #ddd;padding:6px}
        </style></head><body>
        <h1>SpendFlow — Statement</h1>
        <p class="caps">${range.from} → ${range.to} · ${displayCurrency} · ${scoped.length} entries · net ${fmt(total)}</p>
        <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${body}</tbody></table>
        </body></html>`);
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

      const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
      const idx = (name: string) => header.indexOf(name);
      const iDate = idx("date");
      const iType = idx("type");
      const iCat = idx("category");
      const iDesc = idx("description");
      const iMethod = idx("payment_method");
      const iAmount = idx("amount");
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
      }[] = [];
      for (const line of lines.slice(1)) {
        const c = parseLine(line);
        const date = c[iDate]?.trim() ?? "";
        const amount = Number(c[iAmount]);
        if (!isValidISODate(date) || !Number.isFinite(amount) || amount <= 0) continue;
        const category = (iCat >= 0 ? c[iCat]?.trim() : "") || "Other";
        categoryNames.add(category);
        parsed.push({
          date,
          type: (iType >= 0 ? c[iType]?.trim().toLowerCase() : "expense") === "income" ? "income" : "expense",
          category,
          description: iDesc >= 0 ? c[iDesc]?.trim() ?? "" : "",
          method: iMethod >= 0 ? c[iMethod]?.trim() || "Cash" : "Cash",
          amount,
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
          const snapKey = `${displayCurrency}:${p.date}`;
          if (!snapshotCache.has(snapKey)) {
            snapshotCache.set(snapKey, await getRateSnapshot(supabase, displayCurrency, p.date));
          }
          inserts.push({
            user_id: user!.id,
            category_id: catByName.get(p.category.toLowerCase())?.id ?? fallback.id,
            amount: p.amount,
            currency: displayCurrency,
            type: p.type,
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
        <p className="caps !text-primary-strong">Records</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Export &amp; import</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>

      <Panel label="Statement">
        <div className="p-5">
          <div className="flex border border-border">
            {(["month", "year", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`h-9 flex-1 text-xs font-bold uppercase tracking-[0.08em] transition ${
                  period === p ? "bg-primary text-white" : "text-text-muted hover:text-text"
                }`}
              >
                {p === "month" ? "This month" : p === "year" ? "This year" : "All time"}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between border-t border-border pt-4">
            <div>
              <p className="caps">Preview</p>
              <p className="numeric mt-1 text-sm font-bold text-text">
                {range.from} → {range.to}
              </p>
            </div>
            <div className="text-right">
              <p className="figures text-2xl font-bold text-text">{fmt(total)}</p>
              <p className="caps">{scoped.length} entries</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onExportCsv} loading={busy === "csv"} disabled={scoped.length === 0}>
              Download CSV
            </Button>
            <Button variant="secondary" onClick={onExportPdf} disabled={scoped.length === 0}>
              Print / PDF
            </Button>
          </div>
        </div>
      </Panel>

      <Panel label="Import" className="mt-4">
        <div className="p-5">
          <p className="text-sm text-text-muted">
            Import a CSV with columns <code className="text-text">date, type, category, description,
            payment_method, currency, amount</code> — only <code className="text-text">date</code> and{" "}
            <code className="text-text">amount</code> are required. Guards: ≤ 2 MB, ≤ 1000 rows.
          </p>
          <label className="mt-4 inline-flex h-10 cursor-pointer items-center border border-border px-5 text-xs font-bold uppercase tracking-[0.08em] text-text transition-colors hover:border-primary">
            {busy === "import" ? "Importing…" : "Choose CSV"}
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
          {importResult && <p className="mt-3 text-xs font-bold text-income">{importResult}</p>}
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function listCategoriesSafe(supabase: ReturnType<typeof getSupabaseBrowserClient>, userId: string) {
  const { data } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("user_id", userId)
    .order("name");
  return (data ?? []) as { id: string; name: string; type: string }[];
}
