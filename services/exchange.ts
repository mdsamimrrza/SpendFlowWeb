/**
 * FX service — ported from mobile services/exchange.ts, SAME RATE DIRECTION:
 * getRate() returns **USD per 1 unit of currency** (e.g. NPR ≈ 0.00714),
 * matching the `exchange_rates.rate_to_usd` / `expenses.exchange_rate_to_usd`
 * columns that the mobile backfill populates with getRate() output.
 * Tier order: pegged constants → in-memory cache → exchange_rates table →
 * public API → static fallback. QAR/AED/SAR are pegged and never fetched;
 * NPR derives from INR ÷ 1.6.
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
 * inverted; refreshed 2026-09-09 — keep roughly current-era so worst case is
 * small drift). NPR has no entry by design: derived from INR ÷ 1.6.
 */
const UNITS_PER_USD_2026: Record<string, number> = {
  INR: 94.84,
  GBP: 0.738,
  MYR: 4.06,
  KRW: 1341.0,
  JPY: 153.8,
  AUD: 1.386,
  CAD: 1.378,
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
  try {
    const url = date
      ? `https://api.frankfurter.app/${date}?from=USD&to=${currency}`
      : `https://api.frankfurter.app/latest?from=USD&to=${currency}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const units = json.rates?.[currency] ?? 0;
    return units > 0 ? 1 / units : null;
  } catch {
    return null;
  }
}

/** Table rows are already USD-per-unit (written by getRate output). */
async function readFromTable(
  supabase: SupabaseClient<Database>,
  currency: string,
  date: string | null,
): Promise<number | null> {
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
    return rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Resolve USD-per-1-unit for a currency at a date (null = today).
 * Tier order mirrors mobile services/exchange.ts exactly.
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

  const fromTable = await readFromTable(supabase, ccy, targetDate);
  if (fromTable) {
    memoryCache.set(key, { rate: fromTable, fetchedAt: Date.now() });
    return fromTable;
  }

  const unitsFromApi = await fetchUnitsPerUsdFromApi(ccy, targetDate);
  if (unitsFromApi) {
    memoryCache.set(key, { rate: unitsFromApi, fetchedAt: Date.now() });
    return unitsFromApi;
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
