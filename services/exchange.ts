/**
 * FX service — ported from mobile services/exchange.ts, SAME RATE DIRECTION:
 * getRate() returns **USD per 1 unit of currency** (e.g. NPR ≈ 0.00714),
 * matching the `exchange_rates.rate_to_usd` / `expenses.exchange_rate_to_usd`
 * columns that the mobile backfill populates with getRate() output.
 * Tier order: pegged constants → in-memory cache → exchange_rates table →
 * public API → static fallback. QAR/AED/SAR are pegged and never fetched;
 * NPR derives from INR ÷ 1.6.
 * ONE deliberate refinement over the mobile tier list (recorded in
 * docs/FEATURE-PARITY.md): clients can no longer write `exchange_rates`
 * (docs/SUPABASE.md §1 — SELECT-only) and no job refreshes it, so NO table
 * row — however recent — may answer a CURRENT-rate request: undated lookups
 * go straight to the live APIs (frankfurter → er-api), falling back to the
 * table only when both are unreachable. Measured 2026-09-16: table/fallback
 * rows froze INR ≈ 95.2 vs live 95.96 (display figures ~0.7 % off), and
 * provider snapshots differ ~0.3 % among themselves (er-api 95.67, ECB 95.96,
 * Google ≈95.91) — frankfurter leads so web tracks the reference converter
 * users compare against. Dated (historical) lookups keep the documented
 * tier order unchanged: row snapshots and row-date resolvers must stay
 * byte-compatible with mobile (docs/SYNC-STRATEGY.md §6.1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const USD = "USD";
export const NPR_PER_INR = 1.6;

/**
 * USD per 1 unit — pegged currencies (mobile PEGGED_USD_PER_UNIT parity,
 * including the inversion: QAR is 1/3.64 because 3.64 QAR = 1 USD).
 */
export const PEGGED_USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  QAR: 1 / 3.64,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
};

/**
 * Last-resort USD-per-1-unit fallbacks (mobile FALLBACK_UNITS_PER_USD values
 * inverted; refreshed 2026-09-15 — keep roughly current-era so worst case is
 * small drift). NPR has no entry by design: derived from INR ÷ 1.6.
 */
const UNITS_PER_USD_2026: Record<string, number> = {
  INR: 95.96,
  GBP: 0.7417,
  MYR: 4.087,
  KRW: 1359.15,
  JPY: 155.0,
  AUD: 1.4034,
  CAD: 1.392,
};

function fallbackUsdPerUnit(currency: string): number {
  if (currency === "NPR") {
    const inr = UNITS_PER_USD_2026.INR;
    return inr > 0 ? 1 / inr / NPR_PER_INR : 1;
  }
  const units = UNITS_PER_USD_2026[currency] ?? 0;
  return units > 0 ? 1 / units : 1;
}

export function isPegged(currency: string): boolean {
  return currency in PEGGED_USD_PER_UNIT;
}

const MEMORY_TODAY_TTL_MS = 10 * 60 * 1000;
const API_TIMEOUT_MS = 8000;

/**
 * NV-4 source-side hardening: every rate accepted from the shared
 * exchange_rates table or a public feed must be a finite USD-per-unit inside
 * a broad sanity band (all real world currencies sit well inside
 * 1e-6…1e6). A crafted table row (garbage, NaN/Infinity, absurd exponent)
 * is rejected at the boundary instead of flowing into money math and
 * persisted snapshots — the deployed write-revocation is the real
 * boundary; this is the client's last-trust filter, mirroring the
 * audit-P3 URL-validation discipline at the same trust edge.
 */
const RATE_BAND_MIN = 1e-6;
const RATE_BAND_MAX = 1e6;
function inRateBand(usdPerUnit: number): boolean {
  return Number.isFinite(usdPerUnit) && usdPerUnit >= RATE_BAND_MIN && usdPerUnit <= RATE_BAND_MAX;
}

type CacheEntry = { rate: number; fetchedAt: number };

const memoryCache = new Map<string, CacheEntry>();

function cacheKey(currency: string, date: string | null): string {
  return `${currency}:${date ?? "latest"}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Provider APIs answer in units-per-USD; invert to the USD-per-unit basis. */
async function fetchUnitsPerUsdFromApi(currency: string, date: string | null): Promise<number | null> {
  if (isPegged(currency) || currency === USD) return null;
  // Audit P3: never interpolate an unvalidated value into the feed URL, even
  // though callers today pre-check — this function is the last trust boundary.
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try {
    // api.frankfurter.app is retired (301s to .dev); call the live host directly.
    const url = date
      ? `https://api.frankfurter.dev/v1/${date}?from=USD&to=${currency}`
      : `https://api.frankfurter.dev/v1/latest?from=USD&to=${currency}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const units = json.rates?.[currency] ?? 0;
    if (!(units > 0)) return null;
    const usdPerUnit = 1 / units;
    return inRateBand(usdPerUnit) ? usdPerUnit : null;
  } catch {
    return null;
  }
}

/**
 * Current-FX provider mobile uses (docs/00-EXISTING-APP-AUDIT.md §6) — used
 * only for undated requests so a live web stamp matches a live mobile stamp.
 */
async function fetchCurrentFromErApi(currency: string): Promise<number | null> {
  if (isPegged(currency) || currency === USD) return null;
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch(`https://open.er-api.com/v6/latest/USD`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const units = json.rates?.[currency] ?? 0;
    if (!(units > 0)) return null;
    const usdPerUnit = 1 / units;
    return inRateBand(usdPerUnit) ? usdPerUnit : null;
  } catch {
    return null;
  }
}

/** Table rows are already USD-per-unit (written by getRate output). */
async function readFromTable(
  supabase: SupabaseClient<Database>,
  currency: string,
  date: string | null,
): Promise<{ rate: number; date: string } | null> {
  try {
    let query = supabase
      .from("exchange_rates")
      .select("rate_to_usd, date")
      .eq("currency", currency)
      .order("date", { ascending: false })
      .limit(1);
    query = query.lte("date", date ?? todayISO());
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    const rate = Number(data.rate_to_usd);
    return inRateBand(rate) ? { rate, date: String(data.date) } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve USD-per-1-unit for a currency at a date (null = today).
 * Dated requests keep the documented mobile tier order — table first,
 * byte-compat (docs/SYNC-STRATEGY.md §6.1). Current-rate requests go
 * API-FIRST: nothing can write exchange_rates any more, so no row of any
 * age can represent "today" (measured: frozen table rows priced display
 * currency ~1 % off; provider snapshots er-api morning = 95.67 vs ECB =
 * 95.96 vs Google ≈95.91 — frankfurter leads so web tracks the reference
 * converter users compare against, er-api is the secondary).
 */
export async function getRate(
  supabase: SupabaseClient<Database>,
  currency: string,
  date?: string | null,
): Promise<number> {
  const ccy = (currency || USD).toUpperCase();
  if (ccy === USD) return 1;
  if (isPegged(ccy)) return PEGGED_USD_PER_UNIT[ccy];

  const targetDate = date && date < todayISO() ? date : null;

  // Nepal–India peg: NPR derives from the same date's INR rate — never
  // fetched, never read from exchange_rates, never stored.
  if (ccy === "NPR") {
    const inr = await getRate(supabase, "INR", date);
    return inr / NPR_PER_INR;
  }

  const key = cacheKey(ccy, targetDate);
  const cached = memoryCache.get(key);
  if (cached) {
    if (targetDate || Date.now() - cached.fetchedAt < MEMORY_TODAY_TTL_MS) {
      return cached.rate;
    }
  }

  if (targetDate) {
    const row = await readFromTable(supabase, ccy, targetDate);
    if (row) {
      memoryCache.set(key, { rate: row.rate, fetchedAt: Date.now() });
      return row.rate;
    }
  }

  const live = targetDate
    ? await fetchUnitsPerUsdFromApi(ccy, targetDate)
    : (await fetchUnitsPerUsdFromApi(ccy, null)) ?? (await fetchCurrentFromErApi(ccy));
  if (live) {
    memoryCache.set(key, { rate: live, fetchedAt: Date.now() });
    return live;
  }

  // APIs unreachable: the table's nearest row of any date still beats the
  // static fallback (and answers dated misses after the dated API failed).
  const offlineRow = await readFromTable(supabase, ccy, targetDate);
  if (offlineRow) {
    memoryCache.set(key, { rate: offlineRow.rate, fetchedAt: Date.now() });
    return offlineRow.rate;
  }
  return fallbackUsdPerUnit(ccy);
}

/** USD-per-unit basis: amount × from ÷ to (mobile convert parity). */
export async function convert(
  supabase: SupabaseClient<Database>,
  amount: number,
  from: string,
  to: string,
  date?: string | null,
): Promise<number> {
  if (from === to) return amount;
  const [fromRate, toRate] = await Promise.all([
    getRate(supabase, from, date),
    getRate(supabase, to, date),
  ]);
  return (amount * fromRate) / toRate;
}

/**
 * FX snapshot for a new row (mobile parity): stores USD-per-1-unit of the
 * row's currency at its date.
 */
export async function getRateSnapshot(
  supabase: SupabaseClient<Database>,
  currency: string,
  date: string,
): Promise<{ exchange_rate_to_usd: number; base_currency: string }> {
  return {
    exchange_rate_to_usd: await getRate(supabase, currency, date),
    base_currency: USD,
  };
}
