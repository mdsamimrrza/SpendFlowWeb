/**
 * Export builders — mobile services/export.ts parity (APK Export Center):
 * statement file names, CSV (full column set), multi-sheet Excel workbook
 * data, and the comprehensive PDF financial statement HTML. Web only swaps
 * expo-print/SAF for the browser (Blob download + print window); the file
 * CONTENT mirrors the APK section-for-section and column-for-column.
 */
import { formatMoney } from "@/utils/format";
import type { ExpenseRow } from "@/services/expenses";

export type ExportExt = "pdf" | "xlsx" | "csv";

/** APK generateExportFileName parity: SpendFlow-Statement-<Month>-<Year>.<ext>
 *  (single month) or <-from>-to-<to> when the period spans months. */
export function generateExportFileName(rows: { date: string }[], ext: ExportExt): string {
  const months = Array.from(new Set(rows.map((r) => r.date?.slice(0, 7)).filter(Boolean)));
  if (months.length === 1) {
    const [year, month] = months[0].split("-");
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "long" });
    return `SpendFlow-Statement-${monthName}-${year}.${ext}`;
  }
  if (months.length > 1) {
    const sorted = [...months].sort();
    return `SpendFlow-Statement-${sorted[0]}-to-${sorted[sorted.length - 1]}.${ext}`;
  }
  return `SpendFlow-Statement-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/**
 * APK sanitizeSpreadsheetCell parity: neutralize spreadsheet formula injection
 * (=, +, -, @, tab, CR). Numeric amount cells never pass through here.
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Strip the exporter's `'` guard so round-tripped cells are byte-identical. */
export function stripExportQuote(value: string): string {
  return value.startsWith("'") ? value.slice(1) : value;
}

/** APK escapeHtml parity — user text must never break out of the PDF's HTML. */
export function escapePdf(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Category icons are stored as lucide icon names for default categories
// ('utensils', 'landmark', 'car'…) and as emojis for custom ones. Exports
// can't render lucide names — map them to emojis; unknown names fall back to
// 💳. (APK ICON_EMOJI parity.)
const ICON_EMOJI: Record<string, string> = {
  utensils: "🍽️", food: "🍲", car: "🚗", transport: "🚗", fuel: "⛽",
  film: "🎬", entertainment: "🎬", "heart-pulse": "🩺", medical: "🩺",
  zap: "⚡", utilities: "💡", "shopping-bag": "🛍️", shopping: "🛍️",
  plane: "✈️", travel: "✈️", "graduation-cap": "🎓", education: "🎓",
  tag: "🏷️", other: "💳", home: "🏠", rent: "🏠", house: "🏠",
  landmark: "🏦", loan: "🏦", bank: "🏦", briefcase: "💼", coins: "🪙",
  building: "🏢", "trending-up": "📈", gift: "🎁", banknote: "💵",
  wallet: "👛", "credit-card": "💳", "piggy-bank": "🐷", coffee: "☕",
  dumbbell: "🏋️", pet: "🐾", pets: "🐾", baby: "👶", subscription: "🔄",
  insurance: "🛡️", savings: "🐷", phone: "📱", internet: "🌐", gym: "🏋️",
};
export function categoryEmoji(raw: string | null | undefined): string {
  if (!raw) return "💳";
  if (/\p{Extended_Pictographic}/u.test(raw)) return raw;
  return ICON_EMOJI[raw.trim().toLowerCase()] ?? "💳";
}

function quoteCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** APK exportCsv parity — every column, plus the web-only converted amount. */
export function csvText(rows: ExpenseRow[], convert: (r: ExpenseRow) => number, displayCurrency: string): string {
  const header = [
    "Date", "Type", "Time", "Amount", "Currency", "Category", "Payment Method", "Description", "Notes",
    `Converted ${displayCurrency}`,
  ];
  const body = rows.map((r) => [
    r.date,
    sanitizeSpreadsheetCell(r.type || "expense"),
    sanitizeSpreadsheetCell(r.time || ""),
    String(r.amount),
    sanitizeSpreadsheetCell(r.currency),
    sanitizeSpreadsheetCell(r.categories?.name ?? "Other"),
    sanitizeSpreadsheetCell(r.payment_method),
    sanitizeSpreadsheetCell(r.description ?? ""),
    sanitizeSpreadsheetCell(r.notes ?? ""),
    convert(r).toFixed(2),
  ]);
  // UTF-8 BOM (APK parity): without it Excel on Windows reads the file in the
  // system ANSI codepage and emoji/glyphs become mojibake.
  return "\uFEFF" + [header, ...body].map((row) => row.map(quoteCell).join(",")).join("\n");
}

// ── Excel workbook data (APK exportExcel parity) ─────────────────────────────

export type Cell = { value: string | number };

/** Category aggregates in the display currency — APK groupByCategory parity:
 *  expense (outflow) records only, integer minor units, converted per row. */
export interface CategoryTotal {
  label: string;
  icon: string;
  total: number;
}
export function categoryTotals(rows: ExpenseRow[], convert: (r: ExpenseRow) => number): CategoryTotal[] {
  const minor = new Map<string, number>();
  const meta = new Map<string, string>();
  for (const r of rows) {
    if ((r.type || "expense") === "income") continue;
    const name = r.categories?.name ?? "Other";
    minor.set(name, (minor.get(name) ?? 0) + Math.round(convert(r) * 100));
    if (!meta.has(name)) meta.set(name, r.categories?.icon ?? "");
  }
  return Array.from(minor.entries())
    .map(([label, m]) => ({ label, icon: meta.get(label) ?? "", total: m / 100 }))
    .sort((a, b) => b.total - a.total);
}

/** Sheet 1 "Expenses Ledger" + sheet 2 "Category Analytics" — same 10 columns
 *  as the CSV; amounts stay raw numbers with a converted display column. */
export function excelSheets(
  rows: ExpenseRow[],
  convert: (r: ExpenseRow) => number,
  displayCurrency: string,
): Cell[][][] {
  const ledger: Cell[][] = [
    [
      { value: "Date" }, { value: "Type" }, { value: "Time" }, { value: "Amount" }, { value: "Currency" },
      { value: "Category" }, { value: "Payment Method" }, { value: "Description" }, { value: "Notes" },
      { value: `Converted ${displayCurrency}` },
    ],
    ...rows.map((r) => [
      { value: r.date }, { value: sanitizeSpreadsheetCell(r.type || "expense") }, { value: sanitizeSpreadsheetCell(r.time || "") },
      { value: Number(r.amount) }, { value: sanitizeSpreadsheetCell(r.currency) },
      { value: sanitizeSpreadsheetCell(r.categories?.name ?? "Other") }, { value: sanitizeSpreadsheetCell(r.payment_method) },
      { value: sanitizeSpreadsheetCell(r.description ?? "") }, { value: sanitizeSpreadsheetCell(r.notes ?? "") },
      { value: convert(r) },
    ]),
  ];
  const totals = categoryTotals(rows, convert);
  const base = totals.reduce((s, t) => s + t.total, 0);
  const summary: Cell[][] = [
    [{ value: "Category" }, { value: "Total" }, { value: "Share %" }],
    ...totals.map((t) => [
      { value: `${categoryEmoji(t.icon)} ${t.label}` },
      { value: formatMoney(t.total, displayCurrency) },
      { value: `${base > 0 ? Math.round((t.total / base) * 100) : 0}%` },
    ]),
  ];
  return [ledger, summary];
}

// ── PDF statement (APK exportPdf parity) ─────────────────────────────────────

export interface StatementPdfOptions {
  rows: ExpenseRow[];
  convert: (r: ExpenseRow) => number;
  displayCurrency: string;
  userName: string;
  userEmail: string;
  /** Monthly budget already resolved to the display currency (useBudget), or null. */
  budgetConverted: number | null;
}

/**
 * The APK's "COMPREHENSIVE PROFESSIONAL FINANCIAL STATEMENT" letter-for-letter
 * in structure: letterhead + meta box, KPI cards, Budget vs Actual, CSS pie,
 * category breakdown with share bars, payment methods, itemized outflow
 * ledger, footer. Outflow-only totals (the header says EXPENSE REPORT).
 * Colors follow the web Neo palette (docs/FEATURE-PARITY.md) instead of the
 * mobile teal.
 */
export function statementHtml(o: StatementPdfOptions): string {
  const { rows, convert, displayCurrency, userName, userEmail, budgetConverted } = o;
  const fmt = (n: number) => formatMoney(n, displayCurrency);
  const esc = escapePdf;

  const now = new Date();
  const generated = now.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const outflow = rows
    .filter((r) => (r.type || "expense") !== "income")
    .map((r) => ({ record: r, converted: convert(r) }));
  const totalSpent = Math.round(outflow.reduce((s, r) => s + r.converted, 0) * 100) / 100;
  const totalTransactions = outflow.length;
  const averageSpent = totalTransactions > 0 ? Math.round((totalSpent / totalTransactions) * 100) / 100 : 0;
  const totals = categoryTotals(rows, convert);
  const topCategory = totals[0]?.label ?? "N/A";

  const budget = budgetConverted && budgetConverted > 0 ? budgetConverted : 0;
  const budgetRemaining = budget - totalSpent;
  const budgetPctUsed = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0;

  const KNOWN_METHODS = ["Cash", "Card", "UPI", "Other"];
  const methodTotals = new Map<string, number>();
  for (const { record, converted } of outflow) {
    const method = KNOWN_METHODS.includes(record.payment_method) ? record.payment_method : record.payment_method || "Other";
    methodTotals.set(method, (methodTotals.get(method) ?? 0) + converted);
  }
  const methodRows = Array.from(methodTotals.entries())
    .map(([method, total]) => ({ method, total, pct: totalSpent > 0 ? Math.round((total / totalSpent) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const PIE_COLORS = ["#0b8457", "#2563EB", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#4F46E5"];
  let cumulative = 0;
  const stops: string[] = [];
  totals.forEach((item, i) => {
    if (totalSpent <= 0) return;
    const start = cumulative;
    cumulative = Math.min(100, cumulative + (item.total / totalSpent) * 100);
    stops.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${start.toFixed(2)}% ${cumulative.toFixed(2)}%`);
  });
  const pieGradient = stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "#E2E8F0";
  const pieLegend = totals
    .map((item, i) => {
      const pct = totalSpent > 0 ? Math.round((item.total / totalSpent) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:10px;height:10px;border-radius:2px;background-color:${PIE_COLORS[i % PIE_COLORS.length]};flex-shrink:0;"></span>
        <span style="font-size:11px;color:#334155;flex:1;">${esc(item.label)}</span>
        <span style="font-size:11px;font-weight:700;color:#0F172A;">${pct}%</span></div>`;
    })
    .join("");

  const categoryRowsHtml = totals
    .map((item) => {
      const pct = totalSpent > 0 ? Math.round((item.total / totalSpent) * 100) : 0;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${esc(categoryEmoji(item.icon))}</span>
          <span style="font-weight:600;color:#1E293B;">${esc(item.label)}</span></div></td>
        <td style="text-align:right;font-weight:700;color:#0F172A;">${fmt(item.total)}</td>
        <td style="text-align:right;font-weight:600;color:#0b8457;">${pct}%</td>
        <td><div style="background-color:#E2E8F0;border-radius:999px;height:6px;width:100%;overflow:hidden;">
          <div style="background-color:#0b8457;height:100%;width:${pct}%;"></div></div></td></tr>`;
    })
    .join("");

  const paymentRowsHtml = methodRows
    .map(
      (row) => `<tr>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background-color:#F1F5F9;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;">${esc(row.method)}</span></td>
        <td style="text-align:right;font-weight:700;color:#0F172A;">${fmt(row.total)}</td>
        <td style="text-align:right;font-weight:600;color:#0b8457;">${row.pct}%</td></tr>`,
    )
    .join("");

  const transactionRowsHtml = outflow
    .map(({ record: e, converted }, i) => {
      const desc = e.description || e.notes || "—";
      const subNotes =
        e.description && e.notes
          ? `<div style="font-size:11px;color:#64748B;">${esc(e.notes)}</div>`
          : "";
      return `<tr style="background-color:${i % 2 === 0 ? "#FFFFFF" : "#F8FAFC"};">
        <td style="color:#94A3B8;font-size:11px;font-weight:600;">#${i + 1}</td>
        <td style="font-weight:600;color:#334155;white-space:nowrap;">${esc(e.date)}${e.time ? ` <span style="font-size:11px;color:#94A3B8;">${esc(e.time)}</span>` : ""}</td>
        <td><span style="font-size:13px;">${esc(categoryEmoji(e.categories?.icon))}</span>
          <span style="font-weight:600;color:#1E293B;">${esc(e.categories?.name ?? "Uncategorized")}</span></td>
        <td><div style="font-weight:500;color:#334155;">${esc(desc)}</div>${subNotes}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background-color:#F1F5F9;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;">${esc(e.payment_method)}</span></td>
        <td style="text-align:right;font-weight:800;color:#0b8457;white-space:nowrap;">${fmt(converted)}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SpendFlow Statement</title>
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    /* @page margins only apply at print time; on screen the letterhead and
       KPI cards would run flush to the viewport edge (a 900px print window).
       Centered padded column keeps a uniform margin in both modes. */
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0 auto; padding: 28px 28px 40px; max-width: 800px; font-size: 12px; line-height: 1.5; background-color: #FFFFFF; }
    .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0b8457; padding-bottom: 16px; margin-bottom: 20px; }
    .brand-title { font-size: 26px; font-weight: 900; color: #0b8457; letter-spacing: -0.5px; margin: 0; }
    .brand-subtitle { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
    .meta-box { text-align: right; font-size: 11px; color: #475569; }
    .meta-title { font-size: 14px; font-weight: 800; color: #0F172A; margin-bottom: 4px; }
    .summary-cards { display: flex; gap: 12px; margin-bottom: 24px; }
    .card { flex: 1; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; }
    .card-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-value { font-size: 18px; font-weight: 800; color: #0b8457; margin-top: 4px; }
    .card-subtext { font-size: 10px; color: #94A3B8; margin-top: 2px; }
    .section-title { font-size: 14px; font-weight: 800; color: #0F172A; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background-color: #F1F5F9; color: #475569; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; border-bottom: 1px solid #CBD5E1; }
    td { padding: 9px 10px; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
    .footer-note { margin-top: 30px; padding-top: 12px; border-top: 1px dashed #CBD5E1; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="header-container">
    <div>
      <h1 class="brand-title">SpendFlow</h1>
      <div class="brand-subtitle">Official Financial Statement</div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:#1E293B;">
        Account Holder: <span style="color:#0b8457;">${esc(userName)}</span>
        ${userEmail ? `<span style="font-weight:400;color:#64748B;"> (${esc(userEmail)})</span>` : ""}
      </div>
    </div>
    <div class="meta-box">
      <div class="meta-title">EXPENSE REPORT</div>
      <div><strong>Generated:</strong> ${generated}</div>
      <div><strong>Currency:</strong> ${esc(/^[A-Za-z]{3}$/.test(displayCurrency) ? displayCurrency.toUpperCase() : "INR")}</div>
      <div><strong>Total Transactions:</strong> ${totalTransactions}</div>
    </div>
  </div>

  <div class="summary-cards">
    <div class="card"><div class="card-label">Total Outflow</div><div class="card-value">${fmt(totalSpent)}</div><div class="card-subtext">Across ${totalTransactions} expense records</div></div>
    <div class="card"><div class="card-label">Top Category</div><div class="card-value" style="font-size:15px;color:#1E293B;margin-top:6px;">${esc(topCategory)}</div><div class="card-subtext">Highest expenditure sector</div></div>
    <div class="card"><div class="card-label">Average Spend</div><div class="card-value" style="color:#2563EB;">${fmt(averageSpent)}</div><div class="card-subtext">Per transaction average</div></div>
  </div>

  ${budget > 0 ? `
  <div class="section-title">🎯 Budget vs Actual (Monthly)</div>
  <div class="summary-cards">
    <div class="card"><div class="card-label">Monthly Budget</div><div class="card-value" style="color:#0F172A;">${fmt(budget)}</div><div class="card-subtext">Converted for display</div></div>
    <div class="card"><div class="card-label">Exported Spending</div><div class="card-value">${fmt(totalSpent)}</div><div class="card-subtext">${budgetPctUsed}% of budget used</div></div>
    <div class="card"><div class="card-label">${budgetRemaining >= 0 ? "Remaining" : "Over Budget"}</div><div class="card-value" style="color:${budgetRemaining >= 0 ? "#0b8457" : "#DC2626"};">${fmt(Math.abs(budgetRemaining))}</div><div class="card-subtext">${budgetRemaining >= 0 ? "Under budget" : "Exceeded"}</div></div>
  </div>
  <div style="background-color:#E2E8F0;border-radius:999px;height:10px;width:100%;overflow:hidden;margin-bottom:24px;">
    <div style="background-color:${budgetPctUsed >= 100 ? "#DC2626" : "#0b8457"};height:100%;width:${Math.min(100, budgetPctUsed)}%;"></div>
  </div>
  ` : ""}

  ${totalSpent > 0 ? `
  <div class="section-title">🥧 Spending by Category</div>
  <div style="display:flex;align-items:center;gap:28px;margin-bottom:24px;">
    <div style="position:relative;width:150px;height:150px;border-radius:50%;background:${pieGradient};flex-shrink:0;">
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:92px;height:92px;border-radius:50%;background-color:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-size:8px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Total</div>
        <div style="font-size:12px;font-weight:800;color:#0F172A;">${fmt(totalSpent)}</div></div>
    </div>
    <div style="flex:1;">${pieLegend}</div>
  </div>
  ` : ""}

  <div class="section-title">📊 Category Breakdown</div>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right;">Total Spent</th><th style="text-align:right;">Share</th><th style="width:140px;">Distribution</th></tr></thead>
    <tbody>${categoryRowsHtml || '<tr><td colspan="4" style="text-align:center;color:#94A3B8;">No categorized expenses</td></tr>'}</tbody>
  </table>

  ${methodRows.length > 0 ? `
  <div class="section-title">💳 Payment Methods</div>
  <table>
    <thead><tr><th>Method</th><th style="text-align:right;">Total Spent</th><th style="text-align:right;">Share</th></tr></thead>
    <tbody>${paymentRowsHtml}</tbody>
  </table>
  ` : ""}

  <div class="section-title">🧾 Itemized Transaction Ledger</div>
  <table>
    <thead><tr><th>No.</th><th>Date</th><th>Category</th><th>Description &amp; Notes</th><th>Method</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${transactionRowsHtml || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;">No transactions found in this period</td></tr>'}</tbody>
  </table>

  <div class="footer-note">
    <div>🔒 Verified by SpendFlow Financial Observability &amp; Security Engine</div>
    <div>Auto-Generated Confidential Report · ${esc(/^[A-Za-z]{3}$/.test(displayCurrency) ? displayCurrency.toUpperCase() : "INR")}</div>
  </div>
</body>
</html>`;
}
