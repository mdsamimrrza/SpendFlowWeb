"use client";

/**
 * Bullion - V2 rebuild of the mobile app/bullion.tsx mirror: page header with
 * privacy-eye + theme-flip, the two-market segmented switcher beside the
 * last-updated pill, then on laptop a 2/3 + 1/3 grid - the 2×2 benchmark
 * cards (gold/silver × tola/10g) with metal-tinted selected states and
 * day-over-day change above the synchronized interactive spline chart
 * (gridlines, y/x labels, gradient area, tap tooltip, Period Low/High
 * badges) on the left, the Instant Metal Valuation calculator and the
 * Bullion Standards & Buyer Guide card stacked on the right. Phones stack
 * everything single-column.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calculator,
  ChevronLeft,
  CircleDollarSign,
  Clock,
  Coins,
  Eye,
  EyeOff,
  Info,
  Moon,
  Scale,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useTheme } from "@/store/ThemeContext";
import { useToast } from "@/store/ToastContext";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney } from "@/utils/format";
import { countryForCurrency } from "@/constants/countries";
import {
  buildMarketHistorySeries,
  computeBoard,
  fetchBullionHistory,
  fetchOfficialNepalHistory,
  fetchOfficialNepalRate,
  fetchSpotRates,
  getMarketSessionInfo,
  officialBenchmarkPrice,
  type BenchmarkKey,
  type BenchmarkSeries,
  type BoardPrices,
  type HistoryRow,
  type OfficialNepalRate,
} from "@/services/bullion";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** NP = the permanent FENEGOSIDA official board; SEC = the user's own market. */
type Market = "NP" | "SEC";
type TrendPeriod = 1 | 3 | 6 | 12;

const TOLA_G = 11.6638;

export interface BullionSeriesPoint {
  date: string;
  price: number;
}

const EMPTY_SERIES: BenchmarkSeries = {
  gold_tola: [],
  silver_tola: [],
  gold_10g: [],
  silver_10g: [],
};

/** Mock dataset for the static design preview (no auth, no network). */
export interface BullionInject {
  board: BoardPrices;
  official: OfficialNepalRate | null;
  series: BenchmarkSeries;
}

interface BullionPageProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: BullionInject;
}

export function BullionStatement({ inject }: BullionPageProps) {
  const { profile } = useAuth();
  const { t, locale, language } = useLanguage();
  const { isDark, setPreference } = useTheme();
  const { isPrivacyMode, toggle } = usePrivacy();
  const { showToast } = useToast();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Mobile parity (app/bullion.tsx): Nepal is always the fixed primary
  // market (FENEGOSIDA official fix). The secondary market follows the
  // profile currency from Settings — change it there and this board follows.
  // NPR users would get Nepal twice, so they fall back to India (IBJA).
  const secondaryCurrency = useMemo(() => {
    const preferred = (profile?.preferred_currency || "INR").toUpperCase();
    return preferred === "NPR" ? "INR" : preferred;
  }, [profile?.preferred_currency]);
  const secondaryCountry = countryForCurrency(secondaryCurrency);
  const secondaryLabel = secondaryCountry
    ? `${secondaryCountry.name} (${secondaryCurrency})`
    : `Global (${secondaryCurrency})`;

  // Nepali users start on the Nepal board; everyone else on their own market.
  const [market, setMarket] = useState<Market>(() => (language === "ne" ? "NP" : "SEC"));
  const currency = market === "NP" ? "NPR" : secondaryCurrency;

  const [board, setBoard] = useState<BoardPrices | null>(null);
  const [official, setOfficial] = useState<OfficialNepalRate | null>(null);
  const [series, setSeries] = useState<BenchmarkSeries>(EMPTY_SERIES);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<BenchmarkKey>("gold_tola");
  const [trendMonths, setTrendMonths] = useState<TrendPeriod>(6);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [calcMetal, setCalcMetal] = useState<"24k" | "22k" | "silver">("24k");
  const [calcWeight, setCalcWeight] = useState("10");

  const fmt = (n: number) => formatMoney(n, currency, locale);
  const masked = (n: number) => (isPrivacyMode ? "•••••" : fmt(n));

  useEffect(() => {
    if (inject) {
      setBoard(inject.board);
      setOfficial(inject.official);
      setSeries(inject.series);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // A market switch must never paint the other market's stale series.
      setSeries(EMPTY_SERIES);
      try {
        const spot = await fetchSpotRates();
        const [computed, officialNp] = await Promise.all([
          computeBoard(supabase, currency, spot),
          market === "NP"
            ? fetchOfficialNepalRate(supabase).catch(() => null)
            : Promise.resolve(null),
        ]);
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
        // Mobile parity: Nepal charts/badges read ONLY the verified official
        // daily fixes; markets without an official fix use real futures
        // closes converted at historical FX through the same calibration.
        let s: BenchmarkSeries;
        if (market === "NP") {
          const history = await fetchOfficialNepalHistory(supabase).catch(() => []);
          const keys: BenchmarkKey[] = ["gold_tola", "silver_tola", "gold_10g", "silver_10g"];
          s = Object.fromEntries(
            keys.map((k) => [
              k,
              history
                .map((r) => ({ date: r.rateDate, price: Math.round(officialBenchmarkPrice(r, k)) }))
                .filter((p) => p.price > 0),
            ]),
          ) as BenchmarkSeries;
        } else {
          const rows = await fetchBullionHistory(supabase, 365).catch(() => [] as HistoryRow[]);
          s = await buildMarketHistorySeries(supabase, currency, rows);
        }
        if (!cancelled) {
          setBoard(b);
          setOfficial(officialNp);
          setSeries(s);
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
  }, [inject, market, currency, supabase, showToast]);

  // ── Benchmarks for the active market ──
  const benchmarks = useMemo(() => {
    const goldLabel = t("bullion_hallmark_gold");
    const silverLabel = t("bullion_silver");
    const tolaLabel = t("bullion_per_tola");
    const gram10Label = t("bullion_per_10g");
    const zero = { price: 0, change: null as number | null, pct: null as number | null };
    if (!board) {
      return {
        gold_tola: { label: goldLabel, unit: tolaLabel, metal: "gold" as const, ...zero },
        silver_tola: { label: silverLabel, unit: tolaLabel, metal: "silver" as const, ...zero },
        gold_10g: { label: goldLabel, unit: gram10Label, metal: "gold" as const, ...zero },
        silver_10g: { label: silverLabel, unit: gram10Label, metal: "silver" as const, ...zero },
      };
    }
    // Day-over-day change per benchmark — each card uses its OWN real series
    // (mobile nepalChange/buildBullionMarketHistoryAll parity), never a
    // scaling of the tola delta.
    const delta = (key: BenchmarkKey) => {
      const ss = series[key];
      if (ss.length < 2) return { change: null as number | null, pct: null as number | null };
      const latest = ss[ss.length - 1].price;
      const prev = ss[ss.length - 2].price;
      if (!latest || !prev) return { change: null, pct: null };
      return { change: Math.round(latest - prev), pct: ((latest - prev) / prev) * 100 };
    };
    const g = delta("gold_tola");
    const g10 = delta("gold_10g");
    const sv = delta("silver_tola");
    const s10 = delta("silver_10g");
    return {
      gold_tola: { label: goldLabel, unit: tolaLabel, metal: "gold" as const, price: board.goldTola, change: g.change, pct: g.pct },
      silver_tola: { label: silverLabel, unit: tolaLabel, metal: "silver" as const, price: board.silverTola, change: sv.change, pct: sv.pct },
      gold_10g: { label: goldLabel, unit: gram10Label, metal: "gold" as const, price: board.gold10g, change: g10.change, pct: g10.pct },
      silver_10g: { label: silverLabel, unit: gram10Label, metal: "silver" as const, price: board.silver10g, change: s10.change, pct: s10.pct },
    };
  }, [board, series, t]);

  const activeBenchmark = benchmarks[selectedKey];
  const isGold = activeBenchmark.metal === "gold";
  const rawSeries = series[selectedKey];

  // ── Chart history (trendMonths window, mobile parity) ──
  const historyPoints = useMemo(() => {
    const cutoff = Date.now() - trendMonths * 30 * 86_400_000;
    const pts = rawSeries
      .filter((p) => new Date(`${p.date}T00:00:00`).getTime() >= cutoff)
      .filter((p) => p.price > 0);
    return pts.length >= 2 ? pts : [];
  }, [rawSeries, trendMonths]);

  const { minPrice, maxPrice } = useMemo(() => {
    if (historyPoints.length === 0) return { minPrice: 0, maxPrice: 0 };
    const list = historyPoints.map((p) => p.price);
    return { minPrice: Math.min(...list), maxPrice: Math.max(...list) };
  }, [historyPoints]);

  // ── Calculator ──
  const weightNum = parseFloat(calcWeight) || 0;
  const perGram =
    calcMetal === "24k"
      ? (board?.goldTola ?? 0) / TOLA_G
      : calcMetal === "22k"
        ? (board?.tejabiTola ?? 0) / TOLA_G
        : (board?.silverTola ?? 0) / TOLA_G;
  const calculatedValue = board && weightNum > 0 ? perGram * weightNum : 0;

  const updatedReadable = useMemo(() => {
    if (official?.rateDate) {
      const d = new Date(`${official.rateDate}T00:00:00`);
      return `Market Rate · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d)}`;
    }
    // Mobile parity: session fixing label (IBJA AM/PM Fix, FENEGOSIDA Daily
    // Fix, or Daily Market Benchmark for global-spot currencies).
    const session = getMarketSessionInfo(currency);
    return `${session.fixingLabel}${session.isClosed ? " · Closed Today" : ""}`;
  }, [official, currency]);

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-4 p-0.5">
      {/* ── 1. PAGE HEADER ── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text transition-colors hover:border-faint active:opacity-70"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-faint">{t("bullionTitle")}</p>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
              {t("bullion_title")}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={toggle}
            aria-label={isPrivacyMode ? "Show balances" : "Hide balances"}
            aria-pressed={isPrivacyMode}
            className={`grid h-9 w-9 place-items-center rounded-lg border bg-surface transition-colors active:opacity-70 ${
              isPrivacyMode ? "border-primary text-primary" : "border-border text-text-muted hover:border-faint"
            }`}
          >
            {isPrivacyMode ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
          <button
            onClick={() => setPreference(isDark ? "light" : "dark")}
            aria-label="Toggle light/dark theme"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface transition-colors hover:border-faint active:opacity-70"
          >
            {isDark ? (
              <Sun size={16} className="text-brass" aria-hidden />
            ) : (
              <Moon size={16} className="text-text" aria-hidden />
            )}
          </button>
        </div>
      </header>

      {/* ── 2. MARKET SWITCHER + LAST UPDATED ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div
          role="tablist"
          className="flex min-w-0 flex-1 gap-1 rounded-lg border border-border bg-surface-elevated p-1"
        >
          {(
            [
              { id: "NP" as Market, currency: "NPR", label: t("bullion_market_nepal") },
              { id: "SEC" as Market, currency: secondaryCurrency, label: secondaryLabel },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMarket(m.id);
                setSelectedIndex(null);
              }}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-semibold transition-colors ${
                market === m.id ? "bg-primary text-white" : "text-text-muted hover:text-text"
              }`}
            >
              <CurrencyFlag currency={m.currency} size={14} />
              <span className="truncate">{m.label}</span>
            </button>
          ))}
        </div>
        <span className="inline-flex shrink-0 items-center justify-center gap-1.5 self-center rounded-lg border border-border bg-surface px-3 py-2 sm:self-auto">
          {loading ? (
            <span
              aria-hidden
              className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
          ) : (
            <Clock size={13} className="text-text-muted" aria-hidden />
          )}
          <span className="text-[11px] font-semibold text-text-muted">
            {loading ? t("bullion_updating") : updatedReadable}
          </span>
        </span>
      </div>

      {/* ── 3. DESKTOP GRID: benchmarks + chart left, calculator + guide right ── */}
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
        <div className="min-w-0 space-y-4">
          {/* ── 4. 2×2 BENCHMARK CARDS ── */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {(["gold_tola", "silver_tola", "gold_10g", "silver_10g"] as BenchmarkKey[]).map((key) => {
              const b = benchmarks[key];
              const selected = selectedKey === key;
              const gold = b.metal === "gold";
              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedKey(key);
                    setSelectedIndex(null);
                  }}
                  className={`space-y-1.5 rounded-xl border p-3.5 text-left transition-colors active:scale-[0.99] ${
                    selected
                      ? gold
                        ? "border-[var(--sf-bull-gold-line)] bg-[var(--sf-bull-gold-bg)]"
                        : "border-[var(--sf-bull-sil-line)] bg-[var(--sf-bull-sil-bg)]"
                      : "border-border bg-surface hover:border-faint"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {gold ? (
                      <Coins size={18} className="shrink-0 text-brass" aria-hidden />
                    ) : (
                      <CircleDollarSign size={18} className="shrink-0 text-faint" aria-hidden />
                    )}
                    <span
                      className={`min-w-0 truncate text-[12.5px] font-semibold ${
                        selected ? (gold ? "text-[var(--sf-bull-gold-ink)]" : "text-primary") : "text-text-muted"
                      }`}
                    >
                      {b.label}
                    </span>
                  </span>
                  <span className="block">
                    <span className="figures block text-lg text-text">
                      {masked(b.price)}{" "}
                      <span className="whitespace-nowrap text-[11px] font-medium text-text-muted">/ {b.unit}</span>
                    </span>
                    {b.change == null || b.pct == null ? (
                      <span className="mt-0.5 block text-[11px] font-medium text-text-muted">
                        {t("bullion_change_pending")}
                      </span>
                    ) : (
                      <span
                        className={`numeric mt-0.5 block text-[11px] font-bold ${
                          b.change >= 0 ? "text-income" : "text-danger"
                        }`}
                      >
                        {b.change >= 0 ? `+${b.change}` : b.change} ({b.pct.toFixed(2)}%)
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── 5. SYNCHRONIZED INTERACTIVE CHART ── */}
          <section className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-1.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text">
                  {activeBenchmark.label} / {activeBenchmark.unit}
                </p>
                <p className="mt-0.5 text-[11.5px] text-text-muted">
                  {historyPoints.length >= 2
                    ? market === "NP"
                      ? t("bullion_nepal_history_note")
                      : t("bullion_market_history_note").replace("{currency}", currency)
                    : t("bullion_history_unavailable")}
                </p>
              </div>
              {historyPoints.length >= 2 && (
                <div className="flex shrink-0 gap-1">
                  {([1, 3, 6, 12] as TrendPeriod[]).map((m) => {
                    const active = trendMonths === m;
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          setTrendMonths(m);
                          setSelectedIndex(null);
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-surface-elevated text-text-muted hover:text-text"
                        }`}
                      >
                        {m === 1 ? "1M" : m === 3 ? "3M" : m === 6 ? "6M" : "1Y"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {loading ? (
              <Skeleton className="h-[190px] w-full" />
            ) : historyPoints.length >= 2 ? (
              <>
                <TrendSvg
                  points={historyPoints}
                  accent={isGold ? "var(--sf-bull-gold-accent)" : "var(--sf-bull-sil-accent)"}
                  grad={isGold ? "var(--sf-bull-gold-grad)" : "var(--sf-bull-sil-grad)"}
                  minPrice={minPrice}
                  maxPrice={maxPrice}
                  selectedIndex={selectedIndex}
                  onSelect={(i) => setSelectedIndex(i === selectedIndex ? null : i)}
                  labelOf={(date) =>
                    new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(`${date}T00:00:00`))
                  }
                  fmtPrice={masked}
                />
                <div className="flex gap-2 pt-1">
                  <div className="flex-1 space-y-px rounded-lg border border-border bg-surface-elevated p-2 text-center">
                    <p className="text-[10px] font-medium text-text-muted">{t("bullion_period_low")}</p>
                    <p className="figures text-[13px] text-text">{masked(minPrice)}</p>
                  </div>
                  <div className="flex-1 space-y-px rounded-lg border border-border bg-surface-elevated p-2 text-center">
                    <p className="text-[10px] font-medium text-text-muted">{t("bullion_period_high")}</p>
                    <p
                      className="figures text-[13px]"
                      style={{ color: isGold ? "var(--sf-bull-gold-accent)" : "var(--sf-bull-sil-accent)" }}
                    >
                      {masked(maxPrice)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-[190px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-6 text-center">
                <Clock size={20} className="text-faint" aria-hidden />
                <p className="text-[13px] font-semibold text-text">{t("bullion_history_unavailable")}</p>
                <p className="text-[11px] leading-[15px] text-text-muted">
                  {t("bullion_history_unavailable_hint")}
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          {/* ── 6. INSTANT METAL VALUATION CALCULATOR ── */}
          <section className="panel space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-text">
              <Calculator size={16} className="shrink-0 text-primary" aria-hidden />
              {t("bullion_calc_title")}
            </p>
            <div className="flex gap-2">
              {(
                [
                  { key: "24k", label: t("bullion_calc_gold24") },
                  { key: "22k", label: t("bullion_calc_gold22") },
                  { key: "silver", label: t("bullion_calc_silver999") },
                ] as const
              ).map((m) => {
                const active = calcMetal === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setCalcMetal(m.key)}
                    className={`min-w-0 flex-1 truncate rounded-lg border py-2 text-center text-xs font-semibold transition-colors ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface-elevated text-text hover:border-faint"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div className="flex h-12 items-center rounded-lg border border-border bg-surface-elevated px-3.5 transition-colors focus-within:border-primary">
              <Scale size={17} className="mr-2 shrink-0 text-faint" aria-hidden />
              <input
                inputMode="numeric"
                placeholder={t("bullion_weight_placeholder")}
                value={calcWeight}
                onChange={(e) => setCalcWeight(e.target.value.replace(/[^0-9.]/g, ""))}
                className="figures min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:font-normal placeholder:text-text-muted"
                aria-label={t("weightGrams")}
              />
              <span className="ml-2 shrink-0 text-[12.5px] font-semibold text-primary">
                {t("bullion_grams")}
              </span>
            </div>
            <div className="space-y-0.5 rounded-lg bg-[var(--sf-primary-light)] p-3.5 text-center">
              <p className="text-[11px] font-medium text-text-muted">
                {t("bullion_est_value").replace("{weight}", String(weightNum))}
              </p>
              <p className="figures-display text-3xl tracking-[-0.02em] text-primary-strong">
                {board ? masked(calculatedValue) : "—"}
              </p>
            </div>
          </section>

          {/* ── 7. BULLION STANDARDS & BUYER GUIDE ── */}
          <section className="panel space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-text">
              <Info size={16} className="shrink-0 text-primary" aria-hidden />
              {t("bullion_guide_title")}
            </p>
            <div className="space-y-3">
              <div className="flex gap-2.5">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-income" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text">{t("bullion_guide_24k_title")}</p>
                  <p className="mt-0.5 text-[12px] leading-[17px] text-text-muted">{t("bullion_guide_24k_body")}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Scale size={16} className="mt-0.5 shrink-0 text-brass" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text">{t("bullion_guide_tola_title")}</p>
                  <p className="mt-0.5 text-[12px] leading-[17px] text-text-muted">{t("bullion_guide_tola_body")}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * Mobile's SVG spline chart — Catmull-Rom curve, dashed gridlines, y/x axis
 * labels, gradient area fill, per-point touch rects and a floating tooltip.
 */
function TrendSvg({
  points,
  accent,
  grad,
  minPrice,
  maxPrice,
  selectedIndex,
  onSelect,
  labelOf,
  fmtPrice,
}: {
  points: { date: string; price: number }[];
  accent: string;
  grad: string;
  minPrice: number;
  maxPrice: number;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  labelOf: (date: string) => string;
  fmtPrice: (n: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 190;
  const padLeft = 46;
  const padRight = 10;
  const padTop = 20;
  const padBottom = 26;
  const W = Math.max(Math.min(width || 360, 720), 280);
  const drawW = W - padLeft - padRight;
  const drawH = H - padTop - padBottom;
  const range = Math.max(maxPrice - minPrice, 1);

  const coords = points.map((p, i) => ({
    x: padLeft + (i * drawW) / Math.max(points.length - 1, 1),
    y: H - padBottom - ((p.price - minPrice) / range) * drawH,
    point: p,
    index: i,
  }));

  let line = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const tension = 4.5;
    line += ` C ${p1.x + (p2.x - p0.x) / tension},${p1.y + (p2.y - p0.y) / tension} ${p2.x - (p3.x - p1.x) / tension},${p2.y - (p3.y - p1.y) / tension} ${p2.x},${p2.y}`;
  }
  const area = `${line} L ${coords[coords.length - 1].x},${H - padBottom} L ${coords[0].x},${H - padBottom} Z`;

  const ticks = Array.from({ length: 5 }, (_, i) => ({
    price: Math.round(minPrice + (range * i) / 4),
    y: H - padBottom - (i / 4) * drawH,
  }));
  const xLabelEvery = Math.max(Math.floor(coords.length / 4), 1);
  const sel = selectedIndex != null ? coords[selectedIndex] : null;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: H }}>
      {width > 0 && (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price history chart">
          <defs>
            <linearGradient id="bullionGridGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={grad} stopOpacity="0.4" />
              <stop offset="100%" stopColor={grad} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={W - padRight}
                y2={t.y}
                stroke="var(--sf-bull-grid)"
                strokeDasharray="3, 3"
                strokeWidth={1}
              />
              <text
                x={padLeft - 6}
                y={t.y + 3}
                fill="var(--sf-bull-grid-ink)"
                fontSize={9}
                fontWeight={600}
                textAnchor="end"
              >
                {t.price >= 100000 ? `${Math.round(t.price / 1000)}k` : t.price.toLocaleString()}
              </text>
            </g>
          ))}
          {coords
            .filter((_, i) => i % 5 === 0)
            .map((c, i) => (
              <line
                key={i}
                x1={c.x}
                y1={padTop}
                x2={c.x}
                y2={H - padBottom}
                stroke="var(--sf-bull-grid-v)"
                strokeDasharray="2, 4"
                strokeWidth={1}
              />
            ))}
          <path d={area} fill="url(#bullionGridGrad)" />
          <path d={line} fill="none" stroke={accent} strokeWidth={2.8} strokeLinecap="round" />
          {coords.map((c) => {
            const isSel = selectedIndex === c.index;
            const show = isSel || (selectedIndex === null && c.index === coords.length - 1);
            if (!show) return null;
            return (
              <circle
                key={c.point.date}
                cx={c.x}
                cy={c.y}
                r={isSel ? 6 : 4}
                fill={isSel ? "var(--sf-primary)" : accent}
                stroke="var(--sf-surface)"
                strokeWidth={2}
              />
            );
          })}
          {coords
            .filter((_, i) => i % xLabelEvery === 0 || i === coords.length - 1)
            .map((c, i) => (
              <text
                key={i}
                x={c.x}
                y={H - 6}
                fill="var(--sf-bull-grid-ink)"
                fontSize={8}
                fontWeight={700}
                textAnchor="middle"
              >
                {labelOf(c.point.date)}
              </text>
            ))}
          {coords.map((c) => (
            <rect
              key={c.point.date}
              x={c.x - drawW / Math.max(coords.length - 1, 1) / 2}
              y={0}
              width={drawW / Math.max(coords.length - 1, 1)}
              height={H}
              fill="transparent"
              onClick={() => onSelect(c.index)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </svg>
      )}
      {sel && (
        <div
          className="pointer-events-none absolute rounded-lg border border-[var(--sf-bull-tooltip-line)] bg-[var(--sf-bull-tooltip-bg)] px-2.5 py-[5px] text-center shadow-soft"
          style={{
            top: Math.max(sel.y - 48, 2),
            left: `min(max(${(sel.x / W) * 100}% - 65px, ${padLeft}px), calc(100% - 135px))`,
          }}
        >
          <p className="text-xs font-bold text-white">{fmtPrice(sel.point.price)}</p>
          <p className="text-[9.5px] font-semibold text-text-muted">{labelOf(sel.point.date)}</p>
        </div>
      )}
    </div>
  );
}
