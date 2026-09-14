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

/** Mock dataset for the static design preview (no auth, no network). */
export interface BullionInject {
  board: BoardPrices;
  official: OfficialNepalRate | null;
  historyLocal: TrendPoint[];
  fixesRows: { date: string; gold: number; silver: number }[];
  dayChangePct: number | null;
}

interface BullionPageProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: BullionInject;
}

/**
 * Bullion — benchmark board calibrated to FENEGOSIDA (NP) or IBJA (IN),
 * history from the shared edge function, instant valuation calculator.
 */
/** Statement implementation — the default page export renders it bare;
 *  preview harnesses pass inject (mock data, no auth, no network). */
export function BullionStatement({ inject }: BullionPageProps) {
  const { profile } = useAuth();
  const { t, locale } = useLanguage();
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
  const [series, setSeries] = useState<"gold" | "silver">("gold");
  const [calcKind, setCalcKind] = useState<"gold" | "tejabi" | "silver">("gold");
  const [grams, setGrams] = useState("10");

  const fmt = (n: number) => mask(formatMoney(n, currency, locale));

  const load = useEffect(() => {
    if (inject) {
      setBoard(inject.board);
      setOfficial(inject.official);
      setHistoryLocal(inject.historyLocal);
      setUnitsPerUsd(1);
      setHistory([]);
      setLoading(false);
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inject, market, currency, period, supabase, showToast]);

  // The gold/silver history is quoted in USD/oz; render it as-is on a second
  // axis-free chart in local currency by scaling with the current USD rate.
  // Calibration matches computeBoard: NP fine-gold ×1.20649 / silver ×1.22765;
  // IN (IBJA) ×1.0918 for both.
  const [liveHistoryLocal, setHistoryLocal] = useState<TrendPoint[]>([]);
  const [unitsPerUsd, setUnitsPerUsd] = useState<number | null>(null);
  const historyLocal = inject ? inject.historyLocal : liveHistoryLocal;
  const ozTolaFactor = market === "NP" ? (series === "gold" ? 1.20649 : 1.22765) : 1.0918;
  useEffect(() => {
    if (inject || history.length === 0) {
      if (!inject) setHistoryLocal([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { getRate } = await import("@/services/exchange");
      const upu = await getRate(supabase, currency);
      if (cancelled) return;
      setUnitsPerUsd(upu);
      setHistoryLocal(
        history.map((h) => ({
          date: h.date,
          income: 0,
          expense:
            ((series === "gold" ? h.goldUsdPerOz : h.silverUsdPerOz) / 31.1035) *
            11.6638 *
            upu *
            ozTolaFactor,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [inject, history, currency, market, series, ozTolaFactor, supabase]);

  // Recent fixes — the official daily board as a register (mobile chart-only).
  const fixesRows = useMemo(() => {
    if (inject) return inject.fixesRows;
    if (history.length === 0 || unitsPerUsd == null) return [];
    const goldF = market === "NP" ? 1.20649 : 1.0918;
    const silverF = market === "NP" ? 1.22765 : 1.0918;
    const perTola = (usdOz: number, f: number) => (usdOz / 31.1035) * 11.6638 * unitsPerUsd * f;
    return [...history]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((h) => ({
        date: h.date,
        gold: perTola(h.goldUsdPerOz, goldF),
        silver: perTola(h.silverUsdPerOz, silverF),
      }));
  }, [inject, history, market, unitsPerUsd]);

  const calcValue =
    board != null && grams !== ""
      ? valueGrams(board, calcKind, Number(grams) || 0)
      : null;
  const calcPerGram =
    calcValue != null && Number(grams) > 0 ? calcValue / Number(grams) : null;

  const first = historyLocal[0]?.expense ?? 0;
  const last = historyLocal[historyLocal.length - 1]?.expense ?? 0;
  const dayChangePct = inject
    ? inject.dayChangePct
    : first > 0
      ? Math.round(((last - first) / first) * 100)
      : null;

  const metalName = (k: "gold" | "tejabi" | "silver") =>
    k === "tejabi" ? (market === "IN" ? "Gold 22K" : "Tejabi 22K") : k === "gold" ? "Gold 24K" : "Silver";

  return (
    <main className="mx-auto w-full max-w-[1100px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">{t("benchmarksEyebrow")}</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">
            {t("bullionTitle")}
          </h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        {/* Market switcher — pill tray, one bench per market. */}
        <div className="flex rounded-full bg-surface-elevated p-1" role="group" aria-label="Benchmark market">
          {(
            [
              { id: "NP" as Market, labelKey: "marketNepal" as const },
              { id: "IN" as Market, labelKey: "marketIndia" as const },
            ]
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMarket(m.id)}
              aria-pressed={market === m.id}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition ${
                market === m.id
                  ? "bg-primary text-white shadow-soft dark:text-background"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {t(m.labelKey)}
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.08em] opacity-70 sm:inline">
                · {m.id === "NP" ? "FENEGOSIDA" : "IBJA"}
              </span>
            </button>
          ))}
        </div>
      </header>

      {loading || !board ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Benchmark board — metal-tinted tiles, gold bench then silver. */}
          <Panel
            label={`${t("boardLabel")} — ${market === "NP" ? "FENEGOSIDA calibration" : "IBJA calibration"} · ${currency}`}
            action={
              dayChangePct != null ? (
                <span
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    dayChangePct >= 0 ? "bg-primary-light text-income" : "bg-rust-tint text-danger"
                  }`}
                  title={t("periodWord")}
                >
                  {dayChangePct >= 0 ? "▲" : "▼"} {Math.abs(dayChangePct)}%
                </span>
              ) : undefined
            }
          >
            <div className="grid grid-cols-2 gap-2 p-4 sm:gap-3 lg:grid-cols-4">
              <BoardCell
                tone="gold"
                label="Gold 24K / tola"
                unit="11.6638 g"
                value={fmt(board.goldTola)}
              />
              <BoardCell tone="gold" label="Gold 24K / 10 g" unit="per 10 grams" value={fmt(board.gold10g)} />
              <BoardCell
                tone="gold"
                label={market === "NP" ? "Tejabi 22K / tola" : "Gold 22K / tola"}
                unit="11.6638 g"
                value={fmt(board.tejabiTola)}
              />
              <BoardCell
                tone="gold"
                label={market === "NP" ? "Tejabi 22K / 10 g" : "Gold 22K / 10 g"}
                unit="per 10 grams"
                value={fmt(board.tejabi10g)}
              />
              <BoardCell tone="silver" label="Silver / tola" unit="11.6638 g" value={fmt(board.silverTola)} />
              <BoardCell tone="silver" label="Silver / 10 g" unit="per 10 grams" value={fmt(board.silver10g)} />
              <div className="hidden lg:block" aria-hidden />
              <div className="hidden lg:block" aria-hidden />
            </div>
            <p className="border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-faint sm:px-5">
              {market === "NP" && official
                ? `Official FENEGOSIDA fix for ${official.rateDate} — as published.`
                : market === "NP"
                ? "Fine gold ×1.20649 · Tejabi at 92.5588% of fine · silver ×1.22765 (computed from spot)"
                : "24K ×1.0918 (6% customs + 3% GST) · 22K (916) at 91.67% of fine"}
            </p>
          </Panel>

          {/* History */}
          <Panel
            label={`${series === "gold" ? "Gold" : "Silver"} trend — local per tola`}
            action={
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-surface-elevated p-0.5" role="group" aria-label="Metal series">
                  {(["gold", "silver"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeries(s)}
                      aria-pressed={series === s}
                      className={`flex h-7 items-center gap-1 rounded-full px-3 text-[11px] font-bold uppercase tracking-wide transition ${
                        series === s
                          ? s === "gold"
                            ? "bg-brass text-white"
                            : "bg-text text-background"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-full bg-surface-elevated p-0.5" role="group" aria-label="Trend period">
                  {[30, 120, 365].map((d) => (
                    <button
                      key={d}
                      onClick={() => setPeriod(d)}
                      aria-pressed={period === d}
                      className={`h-7 rounded-full px-3 text-[11px] font-bold uppercase tracking-wide transition ${
                        period === d ? "bg-primary text-white dark:text-background" : "text-text-muted hover:text-text"
                      }`}
                    >
                      {d === 30 ? "1M" : d === 120 ? "4M" : "1Y"}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            <div className="p-4 sm:p-5">
              <TrendChart points={historyLocal} locale={locale} />
            </div>
          </Panel>

          {/* Recent fixes register */}
          {fixesRows.length > 0 && (
            <Panel label={`${t("recentFixes")} — per tola`}>
              <div>
                <div className="flex items-center border-b border-border px-4 py-2 sm:px-5" aria-hidden>
                  <span className="caps-faint flex-1">Date</span>
                  <span className="caps-faint w-[104px] text-right">Gold 24K</span>
                  <span className="caps-faint w-[96px] text-right">Silver</span>
                </div>
                {fixesRows.map((r, i) => (
                  <div
                    key={r.date}
                    className={`flex items-center px-4 py-2.5 sm:px-5 ${i < fixesRows.length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                      {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
                        new Date(`${r.date}T00:00:00`),
                      )}
                    </span>
                    <span className="numeric w-[104px] text-right text-sm font-bold text-text">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brass align-middle" aria-hidden />
                      {fmt(r.gold)}
                    </span>
                    <span className="numeric w-[96px] text-right text-sm font-bold text-text">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-faint align-middle" aria-hidden />
                      {fmt(r.silver)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Calculator */}
          <Panel label={t("instantValuation")}>
            <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 md:grid-cols-[1.2fr_1fr_1.4fr] md:items-end">
              <div>
                <p className="caps mb-1.5">{t("metalLabel")}</p>
                <div className="flex rounded-full bg-surface-elevated p-0.5" role="group" aria-label="Valuation metal">
                  {(["gold", "tejabi", "silver"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setCalcKind(k)}
                      aria-pressed={calcKind === k}
                      className={`h-9 flex-1 rounded-full text-[11px] font-bold uppercase tracking-wide transition ${
                        calcKind === k
                          ? k === "silver"
                            ? "bg-text text-background"
                            : "bg-brass text-white"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {k === "tejabi" && market === "IN" ? "22K" : k}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label={t("weightGrams")}
                type="number"
                min="0"
                step="any"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
              <div className="rounded-2xl border border-brass/50 bg-brass-tint/50 px-4 py-3">
                <p className="caps !text-brass">{t("valueLabel")}</p>
                <p className="figures mt-1 text-2xl font-bold text-text">
                  {calcValue != null ? fmt(calcValue) : "—"}
                </p>
                {calcPerGram != null && (
                  <p className="numeric mt-0.5 text-[11px] text-text-muted">
                    {metalName(calcKind)} · {fmt(calcPerGram)} / g
                  </p>
                )}
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

function BoardCell({
  tone,
  label,
  unit,
  value,
}: {
  tone: "gold" | "silver";
  label: string;
  unit: string;
  value: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 sm:p-4 ${
        tone === "gold" ? "border-brass/30 bg-brass-tint/40" : "border-border bg-surface-elevated/60"
      }`}
    >
      <p className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone === "gold" ? "bg-brass" : "bg-faint"}`}
          aria-hidden
        />
        <span className="caps truncate">{label}</span>
      </p>
      <p className="figures mt-1.5 text-lg font-bold text-text sm:text-xl">{value}</p>
      <p className="stamp mt-0.5">{unit}</p>
    </div>
  );
}
