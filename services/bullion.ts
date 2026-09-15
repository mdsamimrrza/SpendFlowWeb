/**
 * Bullion service — mobile services/bullion.ts calibration parity
 * (docs/00-EXISTING-APP-AUDIT.md §3):
 *  - Nepal (FENEGOSIDA): fine gold ×1.20649, Tejabi 92.5588% of fine, silver ×1.22765
 *  - India (IBJA): gold ×1.0918 (6% customs + 3% GST), 22K (916) at 91.67%
 * Spot from api.gold-api.com (CORS-open); futures history from the shared
 * `bullion-history` edge function (Yahoo proxy — browsers can't hit Yahoo).
 * Nepal chart/badges come ONLY from verified `market_gold_rates` rows
 * (mobile services/nepalGold.ts parity — never the futures proxy); the
 * futures series powers non-NP markets, converted at historical FX through
 * the same calibration and board rounding as the live board
 * (mobile buildBullionMarketHistoryAll parity).
 * 1 tola = 11.6638 g. FX basis: services/exchange.ts getRate() returns
 * USD per 1 unit — local = USD ÷ usdPerUnit (never × ).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const TOLA_G = 11.6638;

export interface SpotRates {
  goldUsdPerOz: number;
  silverUsdPerOz: number;
  fetchedAt: number;
}

export interface BoardPrices {
  goldTola: number;
  gold10g: number;
  tejabiTola: number;
  tejabi10g: number;
  silverTola: number;
  silver10g: number;
}

export interface HistoryRow {
  date: string;
  goldUsdPerOz: number;
  silverUsdPerOz: number;
}

/** The four benchmark cards (mobile app/bullion.tsx ActiveBenchmarkKey). */
export type BenchmarkKey = "gold_tola" | "silver_tola" | "gold_10g" | "silver_10g";

export interface HistoryPoint {
  date: string;
  price: number;
}

export type BenchmarkSeries = Record<BenchmarkKey, HistoryPoint[]>;

const CACHE_KEY = "sf_cache_bullion_spot_v1";
const HISTORY_CACHE_PREFIX = "sf_cache_bullion_history_";
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchSpotRates(): Promise<SpotRates> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as SpotRates;
      if (Date.now() - parsed.fetchedAt < 10 * 60 * 1000) return parsed;
    }
  } catch {
    // ignore cache errors
  }
  const [goldRes, silverRes] = await Promise.all([
    fetch("https://api.gold-api.com/price/XAU"),
    fetch("https://api.gold-api.com/price/XAG"),
  ]);
  if (!goldRes.ok || !silverRes.ok) throw new Error("Spot rate feed unavailable");
  const gold = (await goldRes.json()) as { price?: number };
  const silver = (await silverRes.json()) as { price?: number };
  if (!gold.price || !silver.price) throw new Error("Spot rate feed malformed");
  const rates: SpotRates = {
    goldUsdPerOz: gold.price,
    silverUsdPerOz: silver.price,
    fetchedAt: Date.now(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
  } catch {
    // best-effort
  }
  return rates;
}

/** USD/oz → local per-tola rate. getRate() is USD-per-1-unit (exchange.ts): DIVIDE. */
async function usdOzToLocalPerTola(
  supabase: SupabaseClient<Database>,
  usdPerOz: number,
  currency: string,
): Promise<number> {
  // 1 troy oz = 31.1035 g; per-tola = per-31.1035g × (11.6638 / 31.1035)
  const perTolaUsd = (usdPerOz / 31.1035) * TOLA_G;
  const { getRate } = await import("./exchange");
  const usdPerUnit = await getRate(supabase, currency);
  if (!(usdPerUnit > 0)) return perTolaUsd;
  return perTolaUsd / usdPerUnit;
}

/**
 * Mobile getMarketSessionInfo parity: official fixing schedule metadata.
 * - Nepal (NPR): FENEGOSIDA daily fix ~11:00 AM NPT (Sun–Fri). Sat closed.
 * - India (INR): IBJA AM Fix 12:00 IST, PM Fix 4:30 IST (Mon–Fri).
 * - Any other currency: Global Spot benchmark, always open.
 */
export function getMarketSessionInfo(currency = "NPR"): {
  marketName: string;
  fixingLabel: string;
  isClosed: boolean;
} {
  const now = new Date();
  const ccy = currency.toUpperCase();
  const pad = (n: number) => String(n).padStart(2, "0");

  if (ccy === "NPR") {
    // Nepal Standard Time (UTC + 5:45)
    const nptOffset = 5 * 60 + 45;
    const utcMinutes = now.getTime() + now.getTimezoneOffset() * 60000;
    const nptDate = new Date(utcMinutes + nptOffset * 60000);
    const day = nptDate.getDay(); // 0 = Sun … 6 = Sat
    const isPast1030 = nptDate.getHours() > 10 || (nptDate.getHours() === 10 && nptDate.getMinutes() >= 30);
    const sessionDate = new Date(nptDate);
    if (day === 6) sessionDate.setDate(nptDate.getDate() - 1);
    else if (day === 0 && !isPast1030) sessionDate.setDate(nptDate.getDate() - 2);
    else if (!isPast1030) sessionDate.setDate(nptDate.getDate() - 1);
    const dateStr = `${sessionDate.getFullYear()}-${pad(sessionDate.getMonth() + 1)}-${pad(sessionDate.getDate())}`;
    return {
      marketName: "FENEGOSIDA (Nepal)",
      fixingLabel: `FENEGOSIDA Daily Fix (11:00 AM NPT) · ${dateStr}`,
      isClosed: day === 6,
    };
  }

  if (ccy === "INR") {
    // India Standard Time (UTC + 5:30)
    const istOffset = 5 * 60 + 30;
    const utcMinutes = now.getTime() + now.getTimezoneOffset() * 60000;
    const istDate = new Date(utcMinutes + istOffset * 60000);
    const day = istDate.getDay();
    const isPast1200 = istDate.getHours() >= 12;
    const isPast1630 = istDate.getHours() > 16 || (istDate.getHours() === 16 && istDate.getMinutes() >= 30);
    const sessionDate = new Date(istDate);
    let slot: "AM" | "PM" = "PM";
    if (day === 0) {
      sessionDate.setDate(istDate.getDate() - 2);
      slot = "PM";
    } else if (day === 6) {
      sessionDate.setDate(istDate.getDate() - 1);
      slot = "PM";
    } else if (day === 1 && !isPast1200) {
      sessionDate.setDate(istDate.getDate() - 3);
      slot = "PM";
    } else if (!isPast1200) {
      sessionDate.setDate(istDate.getDate() - 1);
      slot = "PM";
    } else if (!isPast1630) {
      slot = "AM";
    }
    const dateStr = `${sessionDate.getFullYear()}-${pad(sessionDate.getMonth() + 1)}-${pad(sessionDate.getDate())}`;
    return {
      marketName: "IBJA (India)",
      fixingLabel: `IBJA ${slot} Fix (${slot === "AM" ? "12:00 PM" : "4:30 PM"} IST) · ${dateStr}`,
      isClosed: day === 0 || day === 6,
    };
  }

  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return {
    marketName: "Global Spot",
    fixingLabel: `Daily Market Benchmark · ${dateStr}`,
    isClosed: false,
  };
}

export async function computeBoard(
  supabase: SupabaseClient<Database>,
  currency: string,
  spot: SpotRates,
): Promise<BoardPrices> {
  const goldPerTola = await usdOzToLocalPerTola(supabase, spot.goldUsdPerOz, currency);
  const silverPerTola = await usdOzToLocalPerTola(supabase, spot.silverUsdPerOz, currency);
  const round = (n: number) => Math.round(n);
  const ccy = currency.toUpperCase();
  if (ccy === "NPR") {
    // FENEGOSIDA board rounding (mobile computeBullionPrices NPR path): fine
    // gold tola to the nearest Rs 500, Tejabi to the nearest Rs 100, silver
    // tola to the nearest Rs 5; the 10 g figures derive from the rounded tola.
    const fine = round((goldPerTola * 1.20649) / 500) * 500;
    const tejabi = round((fine * 0.925588) / 100) * 100;
    const silver = round((silverPerTola * 1.22765) / 5) * 5;
    return {
      goldTola: fine,
      gold10g: round((fine / TOLA_G) * 10),
      tejabiTola: tejabi,
      tejabi10g: round((tejabi / TOLA_G) * 10),
      silverTola: silver,
      silver10g: round((silver / TOLA_G) * 10),
    };
  }
  if (ccy === "INR") {
    // India (IBJA): the published figures are per 10 g / per 1 kg at whole
    // rupees; tola and 22K (916) derive from them — mobile's INR rounding path.
    const gold10g = round((goldPerTola / TOLA_G) * 10 * 1.0918);
    const goldTola = (gold10g / 10) * TOLA_G;
    const k22_10g = round(gold10g * 0.9167);
    const k22Tola = (k22_10g / 10) * TOLA_G;
    const silver1kg = round((silverPerTola / TOLA_G) * 1000 * 1.0918);
    return {
      goldTola,
      gold10g,
      tejabiTola: k22Tola,
      tejabi10g: k22_10g,
      silverTola: (silver1kg / 1000) * TOLA_G,
      silver10g: round(silver1kg / 100),
    };
  }
  // Any other profile currency (mobile parity): pure global spot, no
  // domestic duty calibration and no board rounding — raw floats.
  const fine = goldPerTola;
  const tejabi = fine * 0.9167;
  const silver = silverPerTola;
  return {
    goldTola: fine,
    gold10g: (fine / TOLA_G) * 10,
    tejabiTola: tejabi,
    tejabi10g: (tejabi / TOLA_G) * 10,
    silverTola: silver,
    silver10g: (silver / TOLA_G) * 10,
  };
}

export interface OfficialNepalRate {
  rateDate: string;
  fineGoldPerTola: number;
  fineGoldPer10g: number | null;
  tejabiPerTola: number | null;
  tejabiPer10g: number | null;
  silverPerTola: number | null;
  silverPer10g: number | null;
}

/**
 * Official FENEGOSIDA daily fix written by the pg_cron edge function
 * (mobile nepalGold.ts parity). Returns the latest NP row when it is fresh
 * (today or yesterday, accounting for the Sat hold); null otherwise.
 */
export async function fetchOfficialNepalRate(
  supabase: SupabaseClient<Database>,
): Promise<OfficialNepalRate | null> {
  try {
    const { data } = await supabase
      .from("market_gold_rates")
      .select(
        "rate_date, fine_gold_per_tola, fine_gold_per_10g, tejabi_gold_per_tola, tejabi_gold_per_10g, silver_per_tola, silver_per_10g, status",
      )
      .eq("country_code", "NP")
      .eq("status", "verified")
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      rate_date: string;
      fine_gold_per_tola: number;
      fine_gold_per_10g: number | null;
      tejabi_gold_per_tola: number | null;
      tejabi_gold_per_10g: number | null;
      silver_per_tola: number | null;
      silver_per_10g: number | null;
      status: string;
    };
    // Freshness: accept today's or yesterday's fix (Sat holds Friday's).
    const ageDays = Math.round((Date.now() - Date.parse(`${row.rate_date}T00:00:00Z`)) / 86_400_000);
    if (ageDays > 2) return null;
    return {
      rateDate: row.rate_date,
      fineGoldPerTola: Number(row.fine_gold_per_tola),
      fineGoldPer10g: row.fine_gold_per_10g != null ? Number(row.fine_gold_per_10g) : null,
      tejabiPerTola: row.tejabi_gold_per_tola != null ? Number(row.tejabi_gold_per_tola) : null,
      tejabiPer10g: row.tejabi_gold_per_10g != null ? Number(row.tejabi_gold_per_10g) : null,
      silverPerTola: row.silver_per_tola != null ? Number(row.silver_per_tola) : null,
      silverPer10g: row.silver_per_10g != null ? Number(row.silver_per_10g) : null,
    };
  } catch {
    return null;
  }
}

export async function fetchBullionHistory(
  supabase: SupabaseClient<Database>,
  days: number,
): Promise<HistoryRow[]> {
  const key = `${HISTORY_CACHE_PREFIX}${days}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { at: number; rows: HistoryRow[] };
      if (Date.now() - parsed.at < HISTORY_TTL_MS) return parsed.rows;
    }
  } catch {
    // ignore
  }
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/bullion-history?days=${days}`;
  const res = await fetch(url, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  });
  if (!res.ok) throw new Error("History feed unavailable");
  const json = (await res.json()) as { rows?: HistoryRow[] };
  const rows = json.rows ?? [];
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), rows }));
  } catch {
    // best-effort
  }
  return rows;
}

/**
 * Official daily price for one benchmark, straight from the stored row
 * (mobile officialBenchmarkPrice parity). Null columns derive from the tola
 * figure; a missing silver tola yields 0 so the caller filters the point.
 */
export function officialBenchmarkPrice(rate: OfficialNepalRate, key: BenchmarkKey): number {
  switch (key) {
    case "gold_tola":
      return rate.fineGoldPerTola;
    case "gold_10g":
      return rate.fineGoldPer10g ?? Math.round((rate.fineGoldPerTola * 10) / TOLA_G);
    case "silver_tola":
      return rate.silverPerTola ?? 0;
    case "silver_10g":
      return rate.silverPer10g ?? Math.round(((rate.silverPerTola ?? 0) * 10) / TOLA_G);
  }
}

/** Verified official daily fixes (newest last) — the NP chart's only source. */
export async function fetchOfficialNepalHistory(
  supabase: SupabaseClient<Database>,
  days = 400,
): Promise<OfficialNepalRate[]> {
  const key = `${HISTORY_CACHE_PREFIX}official_np_${days}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { at: number; rows: OfficialNepalRate[] };
      if (Date.now() - parsed.at < HISTORY_TTL_MS) return parsed.rows;
    }
  } catch {
    // ignore
  }
  try {
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("market_gold_rates")
      .select(
        "rate_date, fine_gold_per_tola, fine_gold_per_10g, tejabi_gold_per_tola, tejabi_gold_per_10g, silver_per_tola, silver_per_10g",
      )
      .eq("country_code", "NP")
      .eq("status", "verified")
      .gte("rate_date", from)
      .order("rate_date", { ascending: true })
      .limit(days);
    if (!Array.isArray(data)) return [];
    const rows = (data as Array<Record<string, unknown>>)
      .map((r) => ({
        rateDate: String(r.rate_date),
        fineGoldPerTola: Number(r.fine_gold_per_tola),
        fineGoldPer10g: r.fine_gold_per_10g != null ? Number(r.fine_gold_per_10g) : null,
        tejabiPerTola: r.tejabi_gold_per_tola != null ? Number(r.tejabi_gold_per_tola) : null,
        tejabiPer10g: r.tejabi_gold_per_10g != null ? Number(r.tejabi_gold_per_10g) : null,
        silverPerTola: r.silver_per_tola != null ? Number(r.silver_per_tola) : null,
        silverPer10g: r.silver_per_10g != null ? Number(r.silver_per_10g) : null,
      }))
      .filter((r) => Number.isFinite(r.fineGoldPerTola));
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), rows }));
    } catch {
      // best-effort
    }
    return rows;
  } catch {
    return [];
  }
}

// Pegged currencies are exact constants (mobile BULLION_PEGGED_UNITS_PER_USD)
// — never fetched. Stored here on the web's USD-per-1-unit basis.
const PEGGED_USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  QAR: 1 / 3.64,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
};
// NPR = INR ÷ 1.6 on the USD-per-unit basis (mobile NPR_PER_INR peg).
const NPR_PER_INR = 1.6;

/** USD-per-1-unit for each date — pegs constant, floats historical. */
async function fetchHistoricalUsdPerUnit(
  dates: string[],
  currency: string,
): Promise<Map<string, number>> {
  const ccy = currency.toUpperCase();
  const map = new Map<string, number>();
  const peg = PEGGED_USD_PER_UNIT[ccy];
  if (peg !== undefined) {
    dates.forEach((d) => map.set(d, peg));
    return map;
  }
  // NPR derives from the same date's INR rate.
  const target = ccy === "NPR" ? "INR" : ccy;
  const first = dates[0];
  const last = dates[dates.length - 1];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `https://api.frankfurter.app/${first}..${last}?from=USD&to=${target}`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const json = (await res.json()) as { rates?: Record<string, Record<string, number>> };
      for (const [date, pairs] of Object.entries(json.rates ?? {})) {
        const units = Number(pairs[target]);
        if (units > 0) {
          const usdPerTargetUnit = 1 / units;
          map.set(
            date,
            ccy === "NPR" ? usdPerTargetUnit / NPR_PER_INR : usdPerTargetUnit,
          );
        }
      }
    }
  } catch {
    // offline → empty map; caller falls back to today's FX per date
  }
  return map;
}

/**
 * Builds ALL FOUR benchmark series for the secondary market in one pass —
 * real futures closes × historical FX through the same calibration and
 * market-board rounding as the live board (mobile buildBullionMarketHistoryAll
 * parity; calibration keys off the CURRENCY: NPR → FENEGOSIDA, INR → IBJA,
 * anything else → raw global spot). Nothing synthetic: a financial app must
 * never present fabricated values as historical market observations.
 */
export async function buildMarketHistorySeries(
  supabase: SupabaseClient<Database>,
  currency: string,
  rows: HistoryRow[],
): Promise<BenchmarkSeries> {
  const empty: BenchmarkSeries = { gold_tola: [], silver_tola: [], gold_10g: [], silver_10g: [] };
  if (rows.length < 2) return empty;

  const byDate = await fetchHistoricalUsdPerUnit(rows.map((r) => r.date), currency);
  const { getRate } = await import("./exchange");
  const fallback = await getRate(supabase, currency);

  const ccy = currency.toUpperCase();
  const isNP = ccy === "NPR";
  const goldF = isNP ? 1.20649 : ccy === "INR" ? 1.0918 : 1.0;
  const silverF = isNP ? 1.22765 : ccy === "INR" ? 1.0918 : 1.0;
  const round = (n: number) => Math.round(n);

  const series: BenchmarkSeries = { gold_tola: [], silver_tola: [], gold_10g: [], silver_10g: [] };
  const push = (bucket: HistoryPoint[], date: string, price: number) => {
    if (price > 0) bucket.push({ date, price: round(price) });
  };

  for (const row of rows) {
    const usdPerUnit = byDate.get(row.date) ?? fallback;
    if (!(usdPerUnit > 0)) continue;
    // USD/oz → local per gram (exchange.ts basis: divide) → market multiplier.
    const goldLocalPerGram = row.goldUsdPerOz / 31.1035 / usdPerUnit * goldF;
    const silverLocalPerGram = row.silverUsdPerOz / 31.1035 / usdPerUnit * silverF;

    // Same market-board rounding as the live board.
    let goldTola = goldLocalPerGram * TOLA_G;
    if (isNP) goldTola = round(goldTola / 500) * 500;
    let silverTola = silverLocalPerGram * TOLA_G;
    if (isNP) silverTola = round(silverTola / 5) * 5;
    push(series.gold_tola, row.date, goldTola);
    push(series.silver_tola, row.date, silverTola);
    push(series.gold_10g, row.date, goldLocalPerGram * 10);
    push(series.silver_10g, row.date, silverLocalPerGram * 10);
  }
  return series;
}

/** Instant metal valuation: grams → local value at the current board. */
export function valueGrams(board: BoardPrices, kind: "gold" | "tejabi" | "silver", grams: number): number {
  const per10g =
    kind === "gold" ? board.gold10g : kind === "tejabi" ? board.tejabi10g : board.silver10g;
  return (per10g / 10) * grams;
}
