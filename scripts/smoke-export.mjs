/**
 * Hermetic smoke test for services/export.ts generators (no browser, no dev
 * server): builds a mock ledger incl. income + notes rows, then writes the
 * real CSV, a real .xlsx via write-excel-file/node, and the statement HTML.
 * Run: node scripts/smoke-export.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";

const mod = await import("../.smoke/export-bundle.mjs");
const { generateExportFileName, csvText, excelSheets, statementHtml } = mod;

const cat = (name, icon) => ({ id: "c", name, icon, color: "#fff", type: "expense" });
const row = (over) => ({
  id: Math.random().toString(36).slice(2),
  user_id: "u",
  category_id: "c",
  currency: "INR",
  description: null,
  time: null,
  payment_method: "Cash",
  notes: null,
  receipt_image_url: null,
  is_recurring: false,
  recurring_rule_id: null,
  recurring_due_date: null,
  bank_account_id: null,
  exchange_rate_to_usd: null,
  base_currency: "USD",
  type: "expense",
  deleted_at: null,
  created_at: "",
  updated_at: "",
  amount: 100,
  date: "2026-09-05",
  categories: cat("Food", "utensils"),
  ...over,
});

const rows = [
  row({ date: "2026-09-01", amount: 95000, type: "income", description: "September salary", categories: { ...cat("Salary", "briefcase"), type: "income" } }),
  row({ date: "2026-09-03", amount: 1250.5, description: "Groceries run", payment_method: "UPI", time: "18:30" }),
  row({ date: "2026-09-10", amount: 20000, description: "Rent", payment_method: "Card", bank_account_id: "b1", notes: "Sept installment", categories: cat("Rent", "home") }),
  row({ date: "2026-09-12", amount: 300, description: "=<script>alert(1)</script>", notes: "@evil", categories: cat("Café ☕", "coffee") }),
];
const convert = (r) => r.amount;

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures += 1;
};

// File names
check(generateExportFileName(rows, "csv") === "SpendFlow-Statement-September-2026.csv", "single-month filename");
check(
  generateExportFileName([{ date: "2026-01-05" }, { date: "2026-03-01" }], "xlsx") === "SpendFlow-Statement-2026-01-to-2026-03.xlsx",
  "multi-month filename",
);

// CSV
const csv = csvText(rows, convert, "INR");
const head = csv.split("\n")[0];
check(
  ["Date", "Type", "Time", "Amount", "Currency", "Category", "Payment Method", "Description", "Notes", "Converted INR"].every((c) => head.includes(`"${c}"`)),
  `csv has all 10 columns: ${head}`,
);
check(csv.charCodeAt(0) === 0xfeff, "csv UTF-8 BOM");
check(/"income"/.test(csv), "income row present in csv");
check(/"'=<script>alert\(1\)<\/script>"/.test(csv), "formula guard prefixes ' on =-cell");
check(/'@evil/.test(csv), "notes @ guarded");
check(csv.includes("Café ☕"), "unicode passes through (BOM'd file)");

// Excel sheets shape
const [ledger, summary] = excelSheets(rows, convert, "INR");
check(ledger.length === 5 && ledger[0].length === 10, `ledger sheet: ${ledger.length} rows × ${ledger[0].length} cols`);
check(typeof ledger[1][3].value === "number" && ledger[1][3].value === 95000, "amount cell is a real number");
check(summary.length === 4, "summary: header + 3 expense categories (income excluded)");
check(String(summary[1][0].value).startsWith("🏠 Rent"), `summary sorted by total, icon: ${summary[1][0].value}`);
check(String(summary[1][2].value) === "93%", "share % computed on converted outflow base");

// Real xlsx bytes via the node build of write-excel-file
const { default: writeXlsxFile } = await import("write-excel-file/node");
await (await writeXlsxFile([
  { sheet: "Expenses Ledger", data: ledger },
  { sheet: "Category Analytics", data: summary },
])).toFile(`${process.cwd()}/.smoke/out.xlsx`);
const xbytes = readFileSync(".smoke/out.xlsx");
check(xbytes[0] === 0x50 && xbytes[1] === 0x4b, `xlsx is a real zip (${xbytes.length} bytes)`);
check(xbytes.length > 3000, "xlsx has content");

// PDF statement HTML
const html = statementHtml({
  rows,
  convert,
  displayCurrency: "INR",
  userName: "Test User",
  userEmail: "test@example.com",
  budgetConverted: 30000,
});
for (const [re, label] of [
  [/Official Financial Statement/, "letterhead"],
  [/Account Holder: <span[^>]*>Test User<\/span>/, "account holder"],
  [/Total Outflow/, "KPI cards"],
  [/Budget vs Actual/, "budget vs actual"],
  [/conic-gradient/, "category pie"],
  [/Category Breakdown/, "breakdown table"],
  [/Payment Methods/, "methods table"],
  [/Itemized Transaction Ledger/, "ledger"],
  [/₹21,550\.50/, "outflow = 1250.5+20000+300 converted"],
]) {
  check(re.test(html), `pdf: ${label}`);
}
check(!html.includes("September salary"), "pdf: income excluded from expense ledger (APK parity)");
check(!/undefined|NaN/.test(html), "pdf: no undefined/NaN leaked");
const { writeFileSync } = await import("node:fs");
writeFileSync("shots/export-files/statement-preview.html", html);

console.log(failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} FAILED`);
process.exit(failures ? 1 : 0);
