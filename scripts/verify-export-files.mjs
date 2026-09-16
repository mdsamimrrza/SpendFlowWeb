/**
 * End-to-end check of the Export Center file generators via /preview/export
 * (mock rows incl. income, no auth): clicks Print/PDF, Excel and CSV, captures
 * the downloads and the print popup, and asserts content.
 * Run: node scripts/verify-export-files.mjs  (dev server; PORT=3000 default)
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = `${process.env.BASE ?? "http://localhost:3000"}`;

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "shots/export-files";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await page.addInitScript(() => localStorage.setItem("spendflow_theme_preference", "light"));
// The dev server may be mid-recompile; retry until the route serves HTML.
for (let i = 0; i < 8; i++) {
  try {
    await page.goto(`${BASE}/preview/export`, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (page.url().endsWith("/preview/export")) break;
  } catch { /* retry */ }
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(2500);

const clickAndDownload = async (labelRe) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.getByRole("button", { name: labelRe }).click(),
  ]);
  const path = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(path);
  return { path, name: download.suggestedFilename() };
};

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures += 1;
};

// ── CSV ──
const csv = await clickAndDownload(/Download CSV/);
const csvText = readFileSync(csv.path, "utf8");
check(csv.name === "SpendFlow-Statement-September-2026.csv", `csv filename: ${csv.name}`);
check(csvText.charCodeAt(0) === 0xfeff, "csv has UTF-8 BOM");
const csvHeader = csvText.split("\n")[0];
check(
  ["Date", "Type", "Time", "Amount", "Currency", "Category", "Payment Method", "Description", "Notes", "Converted NPR"].every(
    (c) => csvHeader.includes(`"${c}"`),
  ),
  `csv has all 10 columns: ${csvHeader}`,
);
check(/"income"/.test(csvText), "csv contains income row");

// ── Excel ──
const xlsx = await clickAndDownload(/Excel/);
const bytes = readFileSync(xlsx.path);
check(xlsx.name === "SpendFlow-Statement-September-2026.xlsx", `xlsx filename: ${xlsx.name}`);
check(bytes[0] === 0x50 && bytes[1] === 0x4b, `xlsx starts with PK zip magic (${bytes.length} bytes)`);
check(bytes.length > 3000, "xlsx has real content");

// ── PDF (print popup) ──
const [popup] = await Promise.all([
  page.waitForEvent("popup", { timeout: 20000 }),
  page.getByRole("button", { name: /Print \/ PDF/ }).click(),
]);
await popup.waitForLoadState("domcontentloaded");
await popup.waitForTimeout(1500);
const html = await popup.content();
check(/Official Financial Statement/.test(html), "pdf: letterhead");
check(/Total Outflow/.test(html) && /Average Spend/.test(html), "pdf: KPI cards");
check(/Spending by Category/.test(html) && /conic-gradient/.test(html), "pdf: category pie");
check(/Category Breakdown/.test(html), "pdf: breakdown table");
check(/Payment Methods/.test(html), "pdf: methods table");
check(/Itemized Transaction Ledger/.test(html), "pdf: ledger");
check(!/September salary/.test(html), "pdf: ledger excludes income (APK parity)");
await popup.screenshot({ path: `${OUT}/statement-preview.png`, fullPage: true });

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
