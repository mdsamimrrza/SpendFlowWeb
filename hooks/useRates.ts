"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { getRate } from "@/services/exchange";
import { useAuth } from "@/store/AuthContext";
import { useEffect as useReactEffect } from "react";
import { quantizeMoney, todayISO } from "@/utils/format";

/**
 * Display-currency rate (USD per unit, today — freshness-gated by getRate).
 * Rows convert on the SAME basis: every figure prices at the live cross, so a
 * display-currency total matches what a public FX converter says for the same
 * amount (user decision 2026-09-15, docs/FEATURE-PARITY.md).
 */
export function useDisplayRate(displayCurrency: string | undefined) {
  const [rate, setRate] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Session-gated: design-preview mounts (middleware-public /preview/*)
    // pass constant currencies without a session — anonymous visitors must
    // not spend the shared feeds' quota from the public surface.
    if (!displayCurrency || !user) return;
    let cancelled = false;
    void getRate(getSupabaseBrowserClient(), displayCurrency).then((r) => {
      if (!cancelled) setRate(r);
    });
    return () => {
      cancelled = true;
    };
  }, [displayCurrency, user]);

  return rate;
}

/**
 * Budget in the display currency (mobile getMonthlyBudget parity): the stored
 * monthly_budget is expressed in the budget's OWN currency — resolved
 * profile.budget_currency (users column) → auth metadata → latest
 * user_settings_history row that HAS a currency (cycle-only rows store NULL,
 * so "latest row" alone is not enough) → preferred_currency — and converted
 * for display ONLY; the stored figure is never rewritten.
 */
export function useBudget(): number | null {
  const { profile, session } = useAuth();
  const displayCurrency = (profile?.preferred_currency ?? "NPR").toUpperCase();
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
      const metaCurrency = (session?.user?.user_metadata?.budget_currency as string | undefined)
        ?.toUpperCase();
      let from = profile.budget_currency?.toUpperCase() || metaCurrency || null;
      if (!from) {
        try {
          const { data } = await supabase
            .from("user_settings_history")
            .select("budget_currency")
            .eq("user_id", profile.id)
            .not("budget_currency", "is", null)
            .order("effective_from", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data?.budget_currency) from = data.budget_currency.toUpperCase();
        } catch {
          // fall through to the preferred-currency fallback
        }
      }
      from = from || displayCurrency;
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
  }, [profile?.id, profile?.monthly_budget, profile?.budget_currency, profile?.preferred_currency, session?.user?.user_metadata, displayCurrency, supabase]);

  return budget;
}

export interface ConvertibleRow {
  amount: number;
  currency: string;
  date: string;
  exchange_rate_to_usd: number | null;
}

/**
 * Convert rows to the display currency at each row's OWN-DATE rate (user
 * decision 2026-09-16 — supersedes the 2026-09-15 "price every row at
 * today's live cross" setting and restores mobile parity, docs/SYNC-STRATEGY.md
 * §6.1): a ₹350 bill on 12 Aug permanently shows its 12-Aug value, so a past
 * month's figures never change later; today's entries price at today's live
 * rate (getRate treats dates >= today as current). BOTH sides of the cross
 * resolve from the same day — getRate('NPR', d) is defined as
 * getRate('INR', d) ÷ 1.6, so pegged pairs cancel to exactly 1.6. The stored
 * `exchange_rate_to_usd` snapshot is deliberately NOT used for display: legacy
 * rows were stamped from the stale table on different days than their date,
 * which breaks that cancellation (रू20,000 → ₹12,539.56 instead of the
 * correct ₹12,500.00). Snapshots stay in the DB untouched (data compat).
 * Every (currency,date) resolution is memory-cached inside exchange.ts.
 */
export function useRowConverter(
  displayCurrency: string | undefined,
  rows?: ConvertibleRow[],
) {
  const displayRate = useDisplayRate(displayCurrency);
  const { user } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const [ratesByPair, setRatesByPair] = useState<Map<string, number>>(new Map());
  const todayKey = todayISO();

  // `${currency}:${date}` pairs for every foreign row + the display currency
  // at the same dates (a past month must price BOTH sides of the cross there).
  // The TODAY pair feeds convertToday() — the "at today's rate" holdings view.
  const pairKeys = useMemo(() => {
    if (!rows || !displayCurrency || !user) return "";
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.currency === displayCurrency) continue;
      keys.add(`${r.currency}:${r.date}`);
      keys.add(`${displayCurrency}:${r.date}`);
      keys.add(`${r.currency}:${todayKey}`);
    }
    keys.add(`${displayCurrency}:${todayKey}`);
    return Array.from(keys).sort().join("|");
  }, [rows, displayCurrency, user, todayKey]);

  useEffect(() => {
    if (!pairKeys) return;
    let cancelled = false;
    const missing = pairKeys.split("|").filter((k) => !ratesByPair.has(k));
    if (!missing.length) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (k) => {
          const cut = k.lastIndexOf(":");
          const ccy = k.slice(0, cut);
          const date = k.slice(cut + 1);
          return [k, await getRate(supabase, ccy, date)] as const;
        }),
      );
      if (!cancelled) {
        setRatesByPair((prev) => {
          const next = new Map(prev);
          for (const [k, rate] of entries) next.set(k, rate);
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // ratesByPair intentionally omitted: the `missing` check plus the
    // functional update make the map self-seeding without re-firing.
  }, [pairKeys, supabase]);

  return useMemo(
    () => ({
      ready: displayRate != null,
      convert: (row: ConvertibleRow): number => {
        if (!displayCurrency || row.currency === displayCurrency) return row.amount;
        // Same-day basis on BOTH sides (never the stored snapshot — see the
        // resolver doc): the NPR peg cancels to exactly ÷1.6 vs INR display.
        const from = ratesByPair.get(`${row.currency}:${row.date}`);
        const to = ratesByPair.get(`${displayCurrency}:${row.date}`);
        // amount × (USD/unit_from) ÷ (USD/unit_to) at the row's own date,
        // quantized at the conversion boundary so statement lines reconcile
        // (TESTING.md §2).
        return from && to
          ? quantizeMoney((row.amount * from) / to, displayCurrency)
          : row.amount; // rate not resolved yet — show raw rather than wrong
      },
      // "At today's rate" counterpart (brokerage market-value pattern): same
      // amount priced through TODAY's live cross, both sides. Returns null
      // while rates are unresolved so callers can hide the line entirely
      // instead of showing a wrong "today" figure.
      convertToday: (row: ConvertibleRow): number | null => {
        if (!displayCurrency || row.currency === displayCurrency) return row.amount;
        const from = ratesByPair.get(`${row.currency}:${todayKey}`);
        const to = ratesByPair.get(`${displayCurrency}:${todayKey}`);
        return from && to ? quantizeMoney((row.amount * from) / to, displayCurrency) : null;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayCurrency, displayRate, ratesByPair, todayKey],
  );
}
