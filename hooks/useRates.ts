"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { getRate, NPR_PER_INR } from "@/services/exchange";
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
 * Per-date USD-per-unit rates used when a row carries no snapshot (mobile
 * useRateResolver parity), plus the NPR peg path which resolves its date's
 * INR rate (NPR never trusts its stored snapshot — pre-peg floating values
 * are wrong under the fixed 1 INR = 1.60 NPR rule).
 */
const dateRateCache = new Map<string, number>();

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
  // Every row that needs a date-resolved rate gets one fetched: NPR rows
  // (via their date's INR rate — stored NPR snapshots are never trusted) and
  // non-display rows with no usable snapshot.
  const [ratesByDate, setRatesByDate] = useState<Map<string, number>>(new Map());

  const dateKeys = useMemo(() => {
    if (!rows || !displayCurrency) return "";
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.currency === displayCurrency) continue;
      if (r.currency === "NPR") keys.add(`INR:${r.date}`);
      else if (!r.exchange_rate_to_usd || r.exchange_rate_to_usd <= 0)
        keys.add(`${r.currency}:${r.date}`);
    }
    return Array.from(keys).sort().join(",");
  }, [rows, displayCurrency]);

  useEffect(() => {
    if (!dateKeys) return;
    let cancelled = false;
    (async () => {
      const missing = dateKeys.split(",").filter((k) => !dateRateCache.has(k));
      await Promise.all(
        missing.map(async (key) => {
          const [currency, date] = key.split(":");
          try {
            dateRateCache.set(key, await getRate(supabase, currency, date));
          } catch {
            // leave uncached — convert() falls back to the raw amount
          }
        }),
      );
      if (!cancelled) setRatesByDate(new Map(dateRateCache));
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKeys, supabase]);

  return useMemo(
    () => ({
      ready: displayRate != null,
      convert: (row: ConvertibleRow): number => {
        if (!displayCurrency) return row.amount;
        if (row.currency === displayCurrency) return row.amount;

        // NPR peg parity (mobile): NPR rows never use stored snapshots —
        // 1 NPR = 1/1.6 INR, so the INR rate must be divided by the peg
        // before it prices an NPR amount (USD per unit × amount ÷ display).
        if (row.currency === "NPR") {
          if (displayCurrency === "INR") return quantizeMoney(row.amount / NPR_PER_INR, displayCurrency); // static peg
          const inr = ratesByDate.get(`INR:${row.date}`);
          if (inr && displayRate)
            return quantizeMoney((row.amount * (inr / NPR_PER_INR)) / displayRate, displayCurrency);
          return row.amount; // rate not resolved yet
        }

        // Snapshot-first (mobile convertExpense): amount × (USD/unit_from) ÷ (USD/unit_to).
        if (row.exchange_rate_to_usd && row.exchange_rate_to_usd > 0) {
          return displayRate
            ? quantizeMoney((row.amount * row.exchange_rate_to_usd) / displayRate, displayCurrency)
            : row.amount;
        }
        // Resolver by row date (mobile parity): rows backfilled without a
        // snapshot still convert correctly instead of counting raw.
        const dated = ratesByDate.get(`${row.currency}:${row.date}`);
        if (dated && displayRate)
          return quantizeMoney((row.amount * dated) / displayRate, displayCurrency);
        return row.amount; // resolver miss — show raw rather than wrong
      },
    }),
    [displayCurrency, displayRate, ratesByDate],
  );
}
