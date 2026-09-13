/**
 * Bullion service — mobile services/bullion.ts calibration parity
 * (docs/00-EXISTING-APP-AUDIT.md §3):
 *  - Nepal (FENEGOSIDA): fine gold ×1.20649, Tejabi 92.5588% of fine, silver ×1.22765
 *  - India (IBJA): gold ×1.0918 (6% customs + 3% GST), 22K (916) at 91.67%
 * Spot from api.gold-api.com (CORS-open); history from the shared
 * `bullion-history` edge function (Yahoo proxy — browsers can't hit Yahoo).
 * 1 tola = 11.6638 g.
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

/** USD/oz → local per-tola rate (historical FX fallback chain on misses). */
async function usdOzToLocalPerTola(
  supabase: SupabaseClient<Database>,
  usdPerOz: number,
  currency: string,
): Promise<number> {
  // 1 troy oz = 31.1035 g; per-tola = per-31.1035g × (11.6638 / 31.1035)
  const perGramUsd = usdPerOz / 31.1035;
  const perTolaUsd = perGramUsd * TOLA_G;
  const { getRate } = await import("./exchange");
  const unitsPerUsd = await getRate(supabase, currency);
  return perTolaUsd * unitsPerUsd;
}

export async function computeBoard(
  supabase: SupabaseClient<Database>,
  market: "NP" | "IN",
  currency: string,
  spot: SpotRates,
): Promise<BoardPrices> {
  const goldPerTola = await usdOzToLocalPerTola(supabase, spot.goldUsdPerOz, currency);
  const silverPerTola = await usdOzToLocalPerTola(supabase, spot.silverUsdPerOz, currency);
  const round = (n: number) => Math.round(n);
  if (market === "NP") {
    const fine = round(goldPerTola * 1.20649);
    const tejabi = round(fine * 0.925588);
    const silver = round(silverPerTola * 1.22765);
    return {
      goldTola: fine,
      gold10g: round((fine / TOLA_G) * 10),
      tejabiTola: tejabi,
      tejabi10g: round((tejabi / TOLA_G) * 10),
      silverTola: silver,
      silver10g: round((silver / TOLA_G) * 10),
    };
  }
  // India (IBJA): duty+GST calibrated 24K; 22K at 91.67%.
  const fine = round(goldPerTola * 1.0918);
  const k22 = round(fine * 0.9167);
  const silver = round(silverPerTola * 1.0918);
  return {
    goldTola: fine,
    gold10g: round((fine / TOLA_G) * 10),
    tejabiTola: k22,
    tejabi10g: round((k22 / TOLA_G) * 10),
    silverTola: silver,
    silver10g: round((silver / TOLA_G) * 10),
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

/** Instant metal valuation: grams → local value at the current board. */
export function valueGrams(board: BoardPrices, kind: "gold" | "tejabi" | "silver", grams: number): number {
  const per10g =
    kind === "gold" ? board.gold10g : kind === "tejabi" ? board.tejabi10g : board.silver10g;
  return (per10g / 10) * grams;
}
