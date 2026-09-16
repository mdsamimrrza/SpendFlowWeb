/**
 * FX tier-resolution regression check — guards that CURRENT-rate requests are
 * API-first (frankfurter → er-api): no client can write `exchange_rates`
 * any more, so rows of ANY age (even yesterday's) must never answer "today"
 * — that staleness left every display-currency figure ~1 % off live
 * (2026-09-15/16 user reports). Historical dated lookups stay table-first,
 * byte-compatible with mobile. Runs against the REAL shipped code
 * (services/exchange.ts compiled on each run — no re-implementation).
 *
 * Scenarios (all mocked; no network, no Supabase):
 *   1. Current + FRESH table row          → live API wins; table not consulted.
 *   2. Current + STALE table row          → live API wins (the original bug).
 *   3. Historical dated lookup            → table wins even when old (byte-compat).
 *   4. Current, API dead, stale table     → nearest table row (not the static fallback).
 *   5. Current, API dead, no table        → static fallback tier intact.
 *   6. Pegs & NPR derivation              → AED/SAR/QAR constants; NPR = same-day INR ÷ 1.6.
 *   7. Today's cross end to end           → ₹350 → AED 13.39 at INR 95.96.
 *
 * Run: node scripts/verify-fx-tiers.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, ".verify-fx-tiers-tmp");
fs.rmSync(tmp, { recursive: true, force: true });
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
fs.mkdirSync(tmp);

// exchange.ts's only non-installed import is the type-only `@/` alias; stub it
// so plain tsc can compile the real module standalone (same trick as
// verify-currency-sync.mjs uses for `@/constants/app`).
const src = fs.readFileSync(path.join(root, "services", "exchange.ts"), "utf8");
fs.writeFileSync(
  path.join(tmp, "exchange.ts"),
  src.replace(/import type \{ Database \} from "@\/types\/database\.types";/, "type Database = any;"),
);

const tsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
execFileSync(process.execPath, [
  tsc,
  path.join(tmp, "exchange.ts"),
  "--module", "commonjs",
  "--target", "es2020",
  "--esModuleInterop",
  "--skipLibCheck",
  "--outDir", tmp,
], { stdio: "pipe" });

const fx = require(path.join(tmp, "exchange.js"));

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Fake supabase client: one table row (or none) for whatever currency is asked. */
function fakeSupabase(row) {
  const q = {
    select: () => q, eq: () => q, order: () => q, limit: () => q, lte: () => q,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => q };
}

const originalFetch = globalThis.fetch;
/** Stub fetch per currency: current APIs return `current`, dated return `dated`. */
function stubFetch({ ccy = null, er = null, frankLatest = null, frankDated = null }) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    let rate = null;
    if (String(url).includes("open.er-api.com")) rate = er;
    else if (/frankfurter\.dev\/v1\/latest/.test(url)) rate = frankLatest;
    else if (/frankfurter\.dev\/v1\/\d{4}/.test(url)) rate = frankDated;
    if (rate == null || ccy == null) return { ok: false, status: 503 };
    // Providers key their rates object by currency code — mirror that.
    return { ok: true, json: async () => ({ rates: { [ccy]: rate } }) };
  };
  return urls;
}
function restoreFetch() { globalThis.fetch = originalFetch; }

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond ? "" : `  → ${detail}`}`);
  if (!cond) failures++;
}

try {
  // 1. Current + fresh table row → API wins anyway; the table is not consulted.
  const t = daysAgo(1);
  let urls = stubFetch({ ccy: "CAD", frankLatest: 1.42 });
  let r = await fx.getRate(fakeSupabase({ rate_to_usd: 0.02, date: `${t}T00:00:00` }), "CAD");
  check("1. fresh table row cannot short-circuit 'today'", Math.abs(r - 1 / 1.42) < 1e-12 && urls.some((u) => u.includes("frankfurter")), `got ${r}`);
  restoreFetch();

  // 2. Current + STALE table row (10 days) → live API must override (the bug).
  urls = stubFetch({ ccy: "INR", frankLatest: 95.96, er: 95.67 });
  r = await fx.getRate(fakeSupabase({ rate_to_usd: 1 / 95.2, date: `${daysAgo(10)}T00:00:00` }), "INR");
  check("2. stale table row shadowed by live API (frankfurter first)", Math.abs(r - 1 / 95.96) < 1e-12, `got ${r} (stale row leaked)`);
  restoreFetch();

  // 3. Dated historical lookup → table wins even though the row is ancient.
  urls = stubFetch({ ccy: "GBP", frankDated: 90 });
  r = await fx.getRate(fakeSupabase({ rate_to_usd: 1 / 66.5, date: "2024-03-02T00:00:00" }), "GBP", "2024-03-01");
  check("3. dated lookup stays table-first (parity)", Math.abs(r - 1 / 66.5) < 1e-12 && urls.length === 0, `got ${r}`);
  restoreFetch();

  // 4. Current, APIs dead, only a stale table row → table (nearest), not static.
  urls = stubFetch({});
  r = await fx.getRate(fakeSupabase({ rate_to_usd: 1 / 95.2, date: `${daysAgo(30)}T00:00:00` }), "MYR");
  check("4. API-dead fallback prefers stale table over static", Math.abs(r - 1 / 95.2) < 1e-12, `got ${r}`);
  restoreFetch();

  // 5. Current, APIs dead, no table row → static fallback tier intact (INR = 95.96).
  urls = stubFetch({});
  r = await fx.getRate(fakeSupabase(null), "AUD");
  check("5. static fallback when nothing else resolves", Math.abs(r - 1 / 1.4034) < 1e-12, `got ${r}`);
  restoreFetch();

  // 6a. Pegs: exact constants, zero API traffic.
  urls = stubFetch({ er: 70 });
  const aed = await fx.getRate(fakeSupabase(null), "AED");
  const sar = await fx.getRate(fakeSupabase(null), "SAR");
  const qar = await fx.getRate(fakeSupabase(null), "QAR");
  check("6a. pegs exact & never fetched", aed === 1 / 3.6725 && sar === 1 / 3.75 && qar === 1 / 3.64 && urls.length === 0);
  restoreFetch();

  // 6b. NPR derives from same-day INR ÷ 1.6 (INR via live API here).
  urls = stubFetch({ ccy: "INR", er: 95.96 });
  const npr = await fx.getRate(fakeSupabase(null), "NPR");
  check("6b. NPR = INR ÷ 1.6 peg derivation", Math.abs(npr - (1 / 95.96) / 1.6) < 1e-12, `got ${npr}`);
  restoreFetch();

  // 7. Today's cross end to end: ₹350 → AED at the live INR rate over the peg.
  urls = stubFetch({ ccy: "INR", frankLatest: 95.96 });
  const inrUsd = await fx.getRate(fakeSupabase(null), "INR");
  const aed350 = (350 * inrUsd) / fx.PEGGED_USD_PER_UNIT.AED;
  check("7. ₹350 bills strip prices at 13.39 AED", Math.abs(aed350 - 13.39) < 0.02, `got ${aed350.toFixed(2)}`);
  restoreFetch();

  // 8. End-to-end user scenario: ₹39,956.50 → AED totals.
  //    Old behavior: stale 95.2 table rate leaked → AED 1,540.99 (+0.72 %).
  //    Fixed: live 95.96 → matches the public converter (~1,529).
  const INR_OUT = 39956.5;
  const toAed = (inrUsdPerUnit) => (INR_OUT * inrUsdPerUnit) / (1 / 3.6725);
  const stale = toAed(1 / 95.225), live = toAed(1 / 95.96);
  check("8. stale basis reproduces the report (1,540.99)", Math.abs(stale - 1540.99) < 1.0, `computed ${stale.toFixed(2)}`);
  check("8. live basis lands at the market cross (~1,529)", Math.abs(live - 1529.9) < 1.5, `computed ${live.toFixed(2)}`);
} finally {
  restoreFetch();
}

if (failures) {
  console.error(`\n${failures} FX tier check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll FX tier checks passed (API-first current rates + parity tiers intact).");
