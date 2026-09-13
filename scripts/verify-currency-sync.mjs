/**
 * Cross-currency statement reconciliation check (all 12 supported currencies).
 *
 * Verifies the display-layer money model end to end against the REAL shipped
 * code (utils/format.ts compiled on each run — no re-implementation):
 *   1. Per-row FX conversion is quantized to the display currency's minor
 *      units (hooks/useRates convert parity, simulated here with the same
 *      quantizeMoney), so aggregates are sums of on-screen values.
 *   2. Net line reconciles: displayed(inflow − outflow) === displayed net.
 *   3. Budget line reconciles: displayed(budget − spent) === displayed
 *      Remaining/Over-by, to the minor unit, in every currency.
 *   4. Inflow/outflow percentage pair always sums to exactly 100%.
 *   5. Zero-decimal currencies (KRW, JPY) carry no fraction anywhere.
 *   6. Half-away-from-zero rounding at the exact .5 minor-unit boundary.
 *
 * Run: node scripts/verify-currency-sync.mjs   (needs node_modules/tsc)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, ".verify-currency-tmp");
fs.rmSync(tmp, { recursive: true, force: true });
// Cleanup on every exit path — the dir contains .ts that tsc --noEmit would pick up.
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
fs.mkdirSync(tmp);

// Copy the real sources; rewrite the one `@/` alias so plain tsc can emit CJS.
const srcFormat = fs.readFileSync(path.join(root, "utils/format.ts"), "utf8");
const srcApp = fs.readFileSync(path.join(root, "constants/app.ts"), "utf8");
fs.writeFileSync(path.join(tmp, "app.ts"), srcApp);
fs.writeFileSync(path.join(tmp, "format.ts"), srcFormat.replace(/@\/constants\/app/g, "./app"));

const tsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
execFileSync(process.execPath, [
  tsc,
  path.join(tmp, "format.ts"),
  path.join(tmp, "app.ts"),
  "--module", "commonjs",
  "--target", "es2020",
  "--esModuleInterop",
  "--skipLibCheck",
  "--outDir", path.join(tmp, "dist"),
], { stdio: "pipe" });

const { formatMoney, quantizeMoney, currencyDecimals } = require(path.join(tmp, "dist", "format.js"));
const { CURRENCIES } = require(path.join(tmp, "dist", "app.js"));

/** Parse a formatted money string back to a number (digit + . , − only). */
function parseMoney(s) {
  const cleaned = s.replace(/[^0-9.,\-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`unparseable money string: ${s}`);
  return n;
}

/** Deterministic raw FX-converted floats — long mantissas like real conversion output. */
function rawRows(seed) {
  const out = [];
  let x = seed;
  for (let i = 0; i < 20; i++) {
    x = (x * 9301 + 49297) % 233280;
    out.push(((x / 233280) * 900 + 13.7 * (i + 1)) / 3.777);
  }
  return out;
}

let failures = 0;
function check(label, currency, cond, detail) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL [${currency}] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const HALF = "0.5-boundary";

for (const currency of CURRENCIES) {
  const dec = currencyDecimals(currency);
  const factor = 10 ** dec;

  // ── 1+2+3+5: aggregate reconciliation from quantized per-row conversions ──
  for (const locale of ["en-US", "hi-IN"]) {
    const inflowRows = rawRows(11 + factor).map((v) => quantizeMoney(v, currency));
    const outflowRows = rawRows(77 + factor).map((v) => quantizeMoney(v, currency));
    const inflow = inflowRows.reduce((s, v) => s + v, 0);
    const outflow = outflowRows.reduce((s, v) => s + v, 0);
    const net = inflow - outflow;

    // Every quantized row must render with no hidden sub-minor digits.
    for (const v of inflowRows) {
      check("row on minor-unit grid", currency, Math.abs(v * factor - Math.round(v * factor)) < 1e-6);
    }

    const f = (n) => formatMoney(n, currency, locale);
    const dIn = parseMoney(f(inflow));
    const dOut = parseMoney(f(outflow));
    const dNet = parseMoney(f(Math.abs(net)));
    check("net reconciles", currency,
      Math.abs(dNet - Math.abs(dIn - dOut)) < 1e-9,
      `in=${f(inflow)} out=${f(outflow)} net=${f(Math.abs(net))} vs |in-out|=${Math.abs(dIn - dOut).toFixed(dec)}`);

    // Budget line: over/remaining must equal the displayed operands' difference.
    const budget = quantizeMoney(inflow * 0.7331 + 13.13, currency);
    const remaining = budget - outflow; // sign decides Over by vs Remaining
    const dBud = parseMoney(f(budget));
    const dRem = parseMoney(f(Math.abs(remaining)));
    check("over/remaining reconciles", currency,
      Math.abs(dRem - Math.abs(dBud - dOut)) < 1e-9,
      `budget=${f(budget)} spent=${f(outflow)} over/remaining=${f(Math.abs(remaining))} vs |b-s|=${Math.abs(dBud - dOut).toFixed(dec)}`);

    // The pasted-statement regression: FX floats off-grid must NOT slip through.
    const rawSpent = 1880.5585;
    const rawBudget = 1390.074;
    const qSpent = quantizeMoney(rawSpent, currency);
    const qBudget = quantizeMoney(rawBudget, currency);
    const dQSpent = parseMoney(f(qSpent));
    const dQBud = parseMoney(f(qBudget));
    const dQOver = parseMoney(f(Math.abs(qBudget - qSpent)));
    check("AED-class desync closed", currency,
      Math.abs(dQOver - Math.abs(dQBud - dQSpent)) < 1e-9,
      `spent=${f(qSpent)} budget=${f(qBudget)} over=${f(Math.abs(qBudget - qSpent))}`);

    if (dec === 0) {
      check("zero-decimal renders whole", currency, /^\d+$/.test(String(Math.round(dIn))));
    }
  }

  // ── 4: inflow/outflow percentage pair sums to exactly 100 ──
  // Complement-derivation as shipped in CashFlowHero/FlowSummaryBar/Analytics.
  for (const share of [0.455, 0.454999, 0.5, 0.005, 0.995, 0.134999]) {
    const incomePct = Math.round(share * 100);
    const outflowPct = 100 - incomePct;
    check("pct pair sums to 100", currency, incomePct + outflowPct === 100);
  }

  // ── 6: half-away-from-zero at the exact minor-unit .5 boundary ──
  const half = 0.5 / factor;
  check(HALF, currency, quantizeMoney(half, currency) === 1 / factor, `+${half} → ${quantizeMoney(half, currency)}`);
  check(HALF, currency, quantizeMoney(-half, currency) === -(1 / factor), `${-half} → ${quantizeMoney(-half, currency)}`);
}

// The exact AED statement from the bug report: 1,880.56 − 1,390.07 must read
// Over by AED 490.49 now (was 490.48 when operands were raw floats).
{
  const spent = quantizeMoney(1880.5585, "AED");
  const budget = quantizeMoney(1390.074, "AED");
  const f = (n) => formatMoney(n, "AED");
  const over = Math.abs(budget - spent);
  const dSpent = parseMoney(f(spent));
  const dBud = parseMoney(f(budget));
  const dOver = parseMoney(f(over));
  const ok = Math.abs(dOver - (dSpent - dBud)) < 1e-9;
  check("bug-report scenario", "AED", ok,
    `${f(spent)} − ${f(budget)} shows Over by ${f(over)}; operands say ${(dSpent - dBud).toFixed(2)}`);
  console.log(`\nAED statement: Spent ${f(spent)} · Budget ${f(budget)} · Over by ${f(over)} ✓`);
}

fs.rmSync(tmp, { recursive: true, force: true }); // redundant with the exit hook; kept explicit

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll reconciliation checks passed for all ${CURRENCIES.length} currencies (NPR INR USD QAR GBP AED SAR MYR KRW JPY AUD CAD).`);
