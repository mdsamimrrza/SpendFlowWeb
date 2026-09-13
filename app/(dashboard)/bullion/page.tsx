"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { Panel } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrendChart, type TrendPoint } from "@/components/charts/TrendChart";
import { formatMoney } from "@/utils/format";
import {
  computeBoard,
  fetchBullionHistory,
  fetchOfficialNepalRate,
  fetchSpotRates,
  valueGrams,
  type BoardPrices,
  type HistoryRow,
  type OfficialNepalRate,
} from "@/services/bullion";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

type Market = "NP" | "IN";

/**
 * Bullion — benchmark board calibrated to FENEGOSIDA (NP) or IBJA (IN),
 * history from the shared edge function, instant valuation calculator.
 */
export default function BullionPage() {
  const { profile } = useAuth();
  const { locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const homeCurrency = profile?.preferred_currency ?? "NPR";
  const [market, setMarket] = useState<Market>(homeCurrency === "INR" ? "IN" : "NP");
  const currency = market === "IN" ? "INR" : "NPR";

  const [board, setBoard] = useState<BoardPrices | null>(null);
  const [official, setOfficial] = useState<OfficialNepalRate | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(120);
  const [calcKind, setCalcKind] = useState<"gold" | "tejabi" | "silver">("gold");
  const [grams, setGrams] = useState("10");

  const fmt = (n: number) => mask(formatMoney(n, currency, locale));

  const load = useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const spot = await fetchSpotRates();
        const [computed, officialNp, h] = await Promise.all([
          computeBoard(supabase, market, currency, spot),
          market === "NP"
            ? fetchOfficialNepalRate(supabase).catch(() => null)
            : Promise.resolve(null),
          fetchBullionHistory(supabase, period).catch(() => [] as HistoryRow[]),
        ]);
        // Official FENEGOSIDA fix wins for Nepal when fresh (mobile parity);
        // missing sub-columns fall back to the computed board.
        const b: BoardPrices = officialNp
          ? {
              goldTola: officialNp.fineGoldPerTola,
              gold10g: officialNp.fineGoldPer10g ?? computed.gold10g,
              tejabiTola: officialNp.tejabiPerTola ?? computed.tejabiTola,
              tejabi10g: officialNp.tejabiPer10g ?? computed.tejabi10g,
              silverTola: officialNp.silverPerTola ?? computed.silverTola,
              silver10g: officialNp.silverPer10g ?? computed.silver10g,
            }
          : computed;
        if (!cancelled) {
          setBoard(b);
          setOfficial(officialNp);
          setHistory(h);
        }
      } catch (e) {
        if (!cancelled) showToast(e instanceof Error ? e.message : "Rate feed unavailable", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market, currency, period, supabase, showToast]);

  // The gold/silver history is quoted in USD/oz; render it as-is on a second
  // axis-free chart in local currency by scaling with the current USD rate.
  const [historyLocal, setHistoryLocal] = useState<TrendPoint[]>([]);
  useEffect(() => {
    if (history.length === 0) {
      setHistoryLocal([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { getRate } = await import("@/services/exchange");
      const unitsPerUsd = await getRate(supabase, currency);
      if (cancelled) return;
      setHistoryLocal(
        history.map((h) => ({
          date: h.date,
          income: 0,
          expense: (h.goldUsdPerOz / 31.1035) * 11.6638 * unitsPerUsd * (market === "NP" ? 1.20649 : 1.0918),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [history, currency, market, supabase]);

  const calcValue =
    board != null && grams !== ""
      ? valueGrams(board, calcKind, Number(grams) || 0)
      : null;

  const first = historyLocal[0]?.expense ?? 0;
  const last = historyLocal[historyLocal.length - 1]?.expense ?? 0;
  const dayChangePct = first > 0 ? Math.round(((last - first) / first) * 100) : null;

  return (
    <main className="mx-auto w-full max-w-[1100px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">Benchmarks</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">
            Gold &amp; silver
          </h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <div className="flex border border-border">
          {(
            [
              { id: "NP" as Market, label: "Nepal · FENEGOSIDA" },
              { id: "IN" as Market, label: "India · IBJA" },
            ]
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMarket(m.id)}
              className={`h-9 px-4 text-xs font-bold uppercase tracking-[0.08em] transition ${
                market === m.id ? "bg-primary text-white" : "text-text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {loading || !board ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Benchmark board */}
          <Panel label={`Board — ${market === "NP" ? "FENEGOSIDA calibration" : "IBJA calibration"} · ${currency}`}>
            <div className="grid grid-cols-2 divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
              <BoardCell label="Gold 24K / tola" value={fmt(board.goldTola)} />
              <BoardCell label="Gold 24K / 10 g" value={fmt(board.gold10g)} />
              <BoardCell
                label={market === "NP" ? "Tejabi 22K / tola" : "Gold 22K / tola"}
                value={fmt(board.tejabiTola)}
              />
              <BoardCell
                label={market === "NP" ? "Tejabi 22K / 10 g" : "Gold 22K / 10 g"}
                value={fmt(board.tejabi10g)}
              />
            </div>
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
              <BoardCell label="Silver / tola" value={fmt(board.silverTola)} />
              <BoardCell label="Silver / 10 g" value={fmt(board.silver10g)} />
            </div>
            <p className="border-t border-border px-5 py-2 text-[11px] text-faint">
              {market === "NP" && official
                ? `Official FENEGOSIDA fix for ${official.rateDate} — as published.`
                : market === "NP"
                ? "Fine gold ×1.20649 · Tejabi at 92.5588% of fine · silver ×1.22765 (computed from spot)"
                : "24K ×1.0918 (6% customs + 3% GST) · 22K (916) at 91.67% of fine"}
              {dayChangePct != null && (
                <>
                  {" · period change "}
                  <span className={`numeric font-bold ${dayChangePct >= 0 ? "text-income" : "text-danger"}`}>
                    {dayChangePct >= 0 ? "+" : ""}
                    {dayChangePct}%
                  </span>
                </>
              )}
            </p>
          </Panel>

          {/* History */}
          <Panel
            label="Gold trend — local per tola"
            action={
              <div className="flex border border-border">
                {[30, 120, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() => setPeriod(d)}
                    className={`h-7 px-3 text-[11px] font-bold uppercase transition ${
                      period === d ? "bg-primary text-white" : "text-text-muted hover:text-text"
                    }`}
                  >
                    {d === 30 ? "1M" : d === 120 ? "4M" : "1Y"}
                  </button>
                ))}
              </div>
            }
          >
            <div className="p-5">
              <TrendChart points={historyLocal} locale={locale} />
            </div>
          </Panel>

          {/* Calculator */}
          <Panel label="Instant valuation">
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1fr_1fr_1fr]">
              <div className="flex border border-border">
                {(["gold", "tejabi", "silver"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setCalcKind(k)}
                    className={`h-9 flex-1 text-[11px] font-bold uppercase tracking-wide transition ${
                      calcKind === k ? "bg-brass text-white" : "text-text-muted hover:text-text"
                    }`}
                  >
                    {k === "tejabi" && market === "IN" ? "22K" : k}
                  </button>
                ))}
              </div>
              <Input
                label="Weight (grams)"
                type="number"
                min="0"
                step="any"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
              <div className="self-end border border-brass px-4 py-2">
                <p className="caps">Value</p>
                <p className="figures text-xl font-bold text-text">
                  {calcValue != null ? fmt(calcValue) : "—"}
                </p>
              </div>
            </div>
          </Panel>

          <p className="text-[11px] text-faint">
            Prices match the SpendFlow mobile app exactly. 1 tola = 11.6638 g.
          </p>
        </div>
      )}
    </main>
  );
}

function BoardCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <p className="caps">{label}</p>
      <p className="figures mt-1.5 text-xl font-bold text-text">{value}</p>
    </div>
  );
}
