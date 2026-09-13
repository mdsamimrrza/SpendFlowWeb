"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { getRate } from "@/services/exchange";
import { useAuth } from "@/store/AuthContext";
import { useEffect as useReactEffect } from "react";
import { quantizeMoney } from "@/utils/format";

/**
 * Display-currency rate (units per USD, today). Rows convert snapshot-first
 * (mobile parity): a row carrying exchange_rate_to_usd converts at its own
 * stored snapshot; rows without one fall back to the date-based resolver.
 */
export function useDisplayRate(displayCurrency: string | undefined) {
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    if (!displayCurrency) return;
    let cancelled = false;
    void getRate(getSupabaseBrowserClient(), displayCurrency).then((r) => {
      if (!cancelled) setRate(r);
    });
    return () => {
      cancelled = true;
    };
  }, [displayCurrency]);

  return rate;
}

/**
 * Budget in the display currency (mobile getMonthlyBudget parity): the stored
 * monthly_budget is resolved against its own budget_currency (latest
 * user_settings_history row, falling back to preferred_currency) and
 * converted for display ONLY — the stored figure is never rewritten.
 */
export function useBudget(): number | null {
  const { profile } = useAuth();
  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const supabase = getSupabaseBrowserClient();
  const [budget, setBudget] = useState<number | null>(null);

  useReactEffect(() => {
    if (!profile) {
      setBudget(null);
      return;
    }
    const stored = profile.monthly_budget;
    if (stored == null) {
      setBudget(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let from = profile.preferred_currency;
      try {
        const { data } = await supabase
          .from("user_settings_history")
          .select("budget_currency")
          .eq("user_id", profile.id)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.budget_currency) from = data.budget_currency;
      } catch {
        // fall back to preferred currency
      }
      if (from === displayCurrency) {
        setBudget(stored);
        return;
      }
      const [fromRate, toRate] = await Promise.all([
        getRate(supabase, from),
        getRate(supabase, displayCurrency),
      ]);
      if (!cancelled) setBudget(quantizeMoney((stored * fromRate) / toRate, displayCurrency));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.monthly_budget, profile?.preferred_currency, displayCurrency, supabase]);

  return budget;
}

export interface ConvertibleRow {
  amount: number;
  currency: string;
  date: string;
  exchange_rate_to_usd: number | null;
}

/**
 * Per-date USD-per-INR rates used for NPR rows (mobile parity: NPR never
 * trusts its stored snapshot — pre-peg floating values are wrong under the
 * fixed 1 INR = 1.60 NPR rule — so its date's INR rate is resolved instead).
 */
const nprInrRateCache = new Map<string, number>();

/**
 * Convert a row to the display currency (mobile useRateResolver semantics):
 * stored snapshot first, resolver by row date as fallback.
 */
export function useRowConverter(
  displayCurrency: string | undefined,
  rows?: ConvertibleRow[],
) {
  const displayRate = useDisplayRate(displayCurrency);
  const supabase = getSupabaseBrowserClient();
  // NPR rows resolve via their date's INR rate (fixed peg ÷ 1.6). Every NPR
  // row needs its date resolved — stored NPR snapshots are never trusted, so
  // the fetch list must not exclude rows that carry one.
  const [inrByDate, setInrByDate] = useState<Map<string, number>>(new Map());

  const nprDatesKey = rows
    ? Array.from(new Set(rows.filter((r) => r.currency === "NPR").map((r) => r.date))).sort().join(",")
    : "";

  useEffect(() => {
    if (!nprDatesKey) return;
    let cancelled = false;
    (async () => {
      const dates = nprDatesKey.split(",").filter((d) => d && !nprInrRateCache.has(d));
      if (dates.length === 0) {
        if (!cancelled) setInrByDate(new Map(nprInrRateCache));
        return;
      }
      await Promise.all(
        dates.map(async (date) => {
          try {
            const inr = await getRate(supabase, "INR", date);
            nprInrRateCache.set(date, inr);
          } catch {
            // leave uncached — falls back to raw amount
          }
        }),
      );
      if (!cancelled) setInrByDate(new Map(nprInrRateCache));
    })();
    return () => {
      cancelled = true;
    };
  }, [nprDatesKey, supabase]);

  return useMemo(
    () => ({
      ready: displayRate != null,
      convert: (row: ConvertibleRow): number => {
        if (!displayCurrency) return row.amount;
        if (row.currency === displayCurrency) return row.amount;

        // NPR peg parity (mobile): NPR rows never use stored snapshots.
        if (row.currency === "NPR") {
          if (displayCurrency === "INR") return quantizeMoney(row.amount / 1.6, displayCurrency); // static peg
          const inr = inrByDate.get(row.date);
          if (inr && displayRate) return quantizeMoney((row.amount * inr) / displayRate, displayCurrency);
          return row.amount; // rate not resolved yet
        }

        // Snapshot-first (mobile convertExpense): amount × (USD/unit_from) ÷ (USD/unit_to).
        if (row.exchange_rate_to_usd && row.exchange_rate_to_usd > 0) {
          return displayRate
            ? quantizeMoney((row.amount * row.exchange_rate_to_usd) / displayRate, displayCurrency)
            : row.amount;
        }
        return row.amount; // resolver miss — show raw rather than wrong
      },
    }),
    [displayCurrency, displayRate, inrByDate],
  );
}
