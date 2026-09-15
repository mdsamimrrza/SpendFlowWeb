"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter } from "@/hooks/useRates";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { Panel } from "@/components/ui/Card";
import { RangeField } from "@/components/ui/CalendarModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { FitText } from "@/components/ui/FitText";
import type { TrendPoint } from "@/components/charts/TrendChart";
import { StockFlowChart } from "@/components/charts/StockFlowChart";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, formatShortDate } from "@/utils/format";

type RangeKey = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "CUSTOM";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "1Y", label: "1Y" },
  { key: "5Y", label: "5Y" },
  { key: "CUSTOM", label: "Custom" },
];

/** Window length in days per preset range (for the previous-window compare). */
const RANGE_DAYS: Partial<Record<RangeKey, number>> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
};

interface FlowChartCardProps {
  /** Panel masthead label. */
  label?: string;
  /** Render without the outer panel — for embedding inside a parent sheet. */
  bare?: boolean;
  /** Pre-loaded rows (preview harness / embedded statement) — skips the self-fetch. */
  rows?: Awaited<ReturnType<typeof listExpenses>>["rows"];
  /** Compact embed (Analytics statement): shorter chart, width-capped. */
  compact?: boolean;
}

/**
 * Cash-flow chart card with stock-style range selection: 1D (hour buckets),
 * 1W/1M/3M (day buckets), 1Y/5Y (month buckets), Custom (date inputs).
 * Header carries the window's net figure with a delta chip vs the previous
 * like-for-like window; the summary strip shows inflow/outflow share bars
 * and an insights row (busiest day · avg outflow/day · active days).
 */
export function FlowChartCard({ label = "Cash flow", bare = false, rows: injectedRows, compact = false }: FlowChartCardProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const [range, setRange] = useState<RangeKey>("1M");
  const [customFrom, setCustomFrom] = useState(() => shiftDays(today(), -30));
  const [customTo, setCustomTo] = useState(() => today());
  const [fetchedRows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [loading, setLoading] = useState(!injectedRows);
  const rows = injectedRows ?? fetchedRows;
  // rows feed the converter so NPR dates resolve via their INR rate (peg parity).
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (injectedRows) return;
    if (!user) {
      // Anonymous (e.g. the /preview design page) — render the chart shell.
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { rows: fresh } = await listExpenses(
          supabase,
          user.id,
          0,
          {},
          { field: "date", direction: "asc" },
          5000,
        );
        if (!cancelled) setRows(fresh);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const unsubscribe = subscribeToExpenseChanges(() => {
      void (async () => {
        const { rows: fresh } = await listExpenses(
          supabase,
          user.id,
          0,
          {},
          { field: "date", direction: "asc" },
          5000,
        );
        if (!cancelled) setRows(fresh);
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, supabase, injectedRows]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const window_ = useMemo((): { from: string; to: string; bucket: "hour" | "day" | "month" } => {
    const to = today();
    switch (range) {
      case "1D":
        return { from: to, to, bucket: "hour" };
      case "1W":
        return { from: shiftDays(to, -6), to, bucket: "day" };
      case "1M":
        return { from: shiftDays(to, -29), to, bucket: "day" };
      case "3M":
        return { from: shiftDays(to, -89), to, bucket: "day" };
      case "1Y":
        return { from: shiftDays(to, -364), to, bucket: "month" };
      case "5Y":
        return { from: shiftDays(to, -5 * 365), to, bucket: "month" };
      case "CUSTOM": {
        const from = customFrom <= customTo ? customFrom : customTo;
        const end = customFrom <= customTo ? customTo : customFrom;
        const spanDays = Math.round((Date.parse(end) - Date.parse(from)) / 86_400_000);
        return { from, to: end, bucket: spanDays > 190 ? "month" : "day" };
      }
    }
  }, [range, customFrom, customTo]);

  const points = useMemo<TrendPoint[]>(() => {
    const { from, to, bucket } = window_;
    // Aggregate raw entries into per-bucket income/expense.
    const agg = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      if (row.date < from || row.date > to) continue;
      const v = convert(row);
      const key =
        bucket === "hour"
          ? `${row.date}T${(row.time ?? "00:00").slice(0, 2).padStart(2, "0")}`
          : bucket === "month"
            ? row.date.slice(0, 7)
            : row.date;
      const slot = agg.get(key) ?? { income: 0, expense: 0 };
      if (row.type === "income") slot.income += v;
      else slot.expense += v;
      agg.set(key, slot);
    }

    // Gap-fill so the series is continuous.
    const out: TrendPoint[] = [];
    if (bucket === "hour") {
      for (let h = 0; h < 24; h++) {
        const key = `${from}T${String(h).padStart(2, "0")}`;
        const slot = agg.get(key) ?? { income: 0, expense: 0 };
        out.push({ date: `${from}T${String(h).padStart(2, "0")}:00`, ...slot });
      }
    } else if (bucket === "day") {
      for (let d = from; d <= to; d = shiftDays(d, 1)) {
        const slot = agg.get(d) ?? { income: 0, expense: 0 };
        out.push({ date: d, ...slot });
        if (out.length > 400) break; // safety
      }
    } else {
      let [y, m] = from.slice(0, 7).split("-").map(Number);
      const [ey, em] = to.slice(0, 7).split("-").map(Number);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        const slot = agg.get(key) ?? { income: 0, expense: 0 };
        out.push({ date: `${key}-01`, ...slot });
        if (y === ey && m === em) break;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        if (out.length > 120) break;
      }
    }
    return out;
  }, [rows, window_, convert]);

  const totals = useMemo(
    () =>
      points.reduce(
        (acc, p) => ({ income: acc.income + p.income, expense: acc.expense + p.expense }),
        { income: 0, expense: 0 },
      ),
    [points],
  );

  // Previous like-for-like window (equal day-count immediately before this
  // one) — powers the delta chip. Hour buckets compare against yesterday.
  const prevTotals = useMemo(() => {
    const spanDays =
      RANGE_DAYS[range] ??
      Math.max(1, Math.round((Date.parse(window_.to) - Date.parse(window_.from)) / 86_400_000) + 1);
    const prevTo = shiftDays(window_.from, -1);
    const prevFrom = shiftDays(prevTo, -(spanDays - 1));
    let income = 0;
    let expense = 0;
    let has = false;
    for (const row of rows) {
      if (row.date < prevFrom || row.date > prevTo) continue;
      has = true;
      const v = convert(row);
      if (row.type === "income") income += v;
      else expense += v;
    }
    return has ? { income, expense } : null;
  }, [rows, window_, range, convert]);

  const insights = useMemo(() => {
    let busiest: TrendPoint | null = null;
    let activeDays = 0;
    for (const p of points) {
      if (!busiest || p.expense > busiest.expense) busiest = p;
      if (p.income + p.expense > 0) activeDays += 1;
    }
    const spanDays =
      RANGE_DAYS[range] ??
      Math.max(1, Math.round((Date.parse(window_.to) - Date.parse(window_.from)) / 86_400_000) + 1);
    return {
      busiest: busiest && busiest.expense > 0 ? busiest : null,
      activeDays,
      avgOutflow: totals.expense / spanDays,
    };
  }, [points, range, window_, totals.expense]);

  const net = totals.income - totals.expense;
  const prevNet = prevTotals ? prevTotals.income - prevTotals.expense : null;
  const delta =
    prevNet != null
      ? { text: `${net - prevNet >= 0 ? "+" : "−"}${fmt(Math.abs(net - prevNet)).replace(/^[^\d]*/, "")}`, positive: net - prevNet >= 0 }
      : null;
  const flowTotal = totals.income + totals.expense;
  const incomePct = flowTotal > 0 ? Math.round((totals.income / flowTotal) * 100) : 50;

  const rangeLabel = useMemo(() => {
    if (range === "CUSTOM") return `${window_.from} → ${window_.to}`;
    if (range === "1D") return t("cfTodayByHour");
    const days = RANGE_DAYS[range];
    if (days) return t("cfTrailingDays").replace("{n}", String(days));
    if (range === "1Y") return t("cfTrailing12M");
    return t("cfTrailing5Y");
  }, [range, window_, t]);

  // Range strip: swipe-scrolls on narrow screens (buttons never shrink),
  // sits naturally once there is room. A measured pill slides behind the
  // active button. Shared by bare + panel mastheads.
  const stripRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLButtonElement>(`[data-range="${range}"]`);
      if (btn) setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [range]);

  const rangeStrip = (
    <div className="scroll-x min-w-0 max-w-full overflow-x-auto sm:overflow-visible">
      <div ref={stripRef} className="relative flex w-max rounded-full bg-surface-elevated p-0.5 sm:w-auto">
        {pill && (
          <span
            aria-hidden
            className="absolute bottom-0.5 top-0.5 rounded-full bg-primary shadow-soft transition-all duration-300 ease-out"
            style={{ left: pill.x, width: pill.w }}
          />
        )}
        {RANGES.map((r) => (
          <button
            key={r.key}
            data-range={r.key}
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={`relative z-10 h-7 shrink-0 rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors duration-200 active:scale-[0.97] ${
              range === r.key ? "text-white" : "text-text-muted hover:text-text"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );

  const inner = (
    <div className={`p-4 ${compact ? "sm:p-4" : "sm:p-5"}`}>
      {range === "CUSTOM" && (
        <div className="mb-4 flex items-center gap-3 border border-border bg-surface-elevated/40 p-3">
          <RangeField
            from={customFrom}
            to={customTo}
            max={today()}
            boxClassName="!h-9 w-full sm:w-auto"
            onChange={(f, t2) => {
              setCustomFrom(f);
              setCustomTo(t2);
            }}
          />
        </div>
      )}

      {loading ? (
        <Skeleton className="h-[240px] w-full" />
      ) : (
        <>
          {/* Window headline: net figure + delta chip + date range */}
          <div className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-1 ${compact ? "mb-2" : "mb-3"}`}>
            <div className="min-w-0">
              <p className="caps">{t("cfNet")}</p>
              <div className={`figures mt-0.5 font-bold transition-colors duration-300 ${net < 0 ? "text-danger" : "text-income"}`}>
                <FitText basePx={compact ? 20 : 26} minPx={14}>
                  <span className="mr-1 text-sm font-semibold text-faint">{net < 0 ? "−" : "+"}</span>
                  {fmt(Math.abs(net))}
                </FitText>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {delta && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    delta.positive ? "bg-income/10 text-income" : "bg-rust-tint text-danger"
                  }`}
                >
                  {delta.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {delta.text}
                  <span className="font-semibold opacity-70">{t("cfVsPrev")}</span>
                </span>
              )}
              <span className="stamp">
                {window_.from === window_.to
                  ? formatShortDate(window_.from, locale)
                  : `${formatShortDate(window_.from, locale)} — ${formatShortDate(window_.to, locale)}`}
              </span>
            </div>
          </div>

          <div key={range} className={`chart-fade ${compact ? "mx-auto w-full max-w-[640px]" : ""}`}>
            <StockFlowChart points={points} locale={locale} height={compact ? 140 : 240} />
          </div>

          {/* Range summary — soft cards with share bars */}
          <div className={`grid grid-cols-3 gap-2 ${compact ? "mt-3" : "mt-4"}`}>
            <SummaryCell
              label={t("homeInflow")}
              value={fmt(totals.income)}
              cls="text-income"
              sharePct={incomePct}
              barCls="bg-income"
              compact={compact}
            />
            <SummaryCell
              label={t("homeOutflow")}
              value={fmt(totals.expense)}
              cls="text-danger"
              sharePct={100 - incomePct}
              barCls="bg-danger"
              compact={compact}
            />
            <SummaryCell
              label={`${t("cfNet")} · ${displayCurrency}`}
              value={`${net >= 0 ? "+" : "−"}${fmt(Math.abs(net)).replace(/^[^\d]*/, "")}`}
              cls={net >= 0 ? "text-income" : "text-danger"}
              compact={compact}
            />
          </div>

          {/* Insights row: busiest day · avg outflow/day · active days */}
          <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2.5" : "mt-3"}`}>
            {insights.busiest && (
              <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface-elevated text-xs text-faint ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5"}`}>
                <Flame size={12} className="text-brass" aria-hidden />
                {t("cfBusiest")}{" "}
                <span className="numeric font-bold text-text">
                  {formatShortDate(insights.busiest.date.slice(0, 10), locale)} · {fmt(insights.busiest.expense)}
                </span>
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface-elevated text-xs text-faint ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5"}`}>
              <CalendarClock size={12} className="text-primary" aria-hidden />
              {t("cfAvgOutflow")}{" "}
              <span className="numeric font-bold text-text">{fmt(insights.avgOutflow)}</span>
            </span>
            <span className={`inline-flex items-center rounded-full bg-surface-elevated text-xs text-faint ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5"}`}>
              <span className="numeric font-bold text-text">{insights.activeDays}</span>&nbsp;{t("cfActiveDays")}
            </span>
          </div>
          <p className="stamp mt-2">{rangeLabel}</p>
        </>
      )}
    </div>
  );

  if (bare) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
          <span className="caps whitespace-nowrap">{label}</span>
          {rangeStrip}
        </div>
        {inner}
      </div>
    );
  }

  return (
    <Panel label={label} action={rangeStrip}>
      {inner}
    </Panel>
  );
}

function SummaryCell({
  label,
  value,
  cls,
  sharePct,
  barCls,
  compact = false,
}: {
  label: string;
  value: string;
  cls: string;
  sharePct?: number;
  barCls?: string;
  compact?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-2xl bg-surface-elevated px-2 text-center ${compact ? "py-2" : "py-3"}`}>
      <p className="caps whitespace-nowrap">{label}</p>
      <div className={`figures numeric mt-0.5 font-extrabold ${cls}`}>
        <FitText basePx={compact ? 14 : 17} minPx={12} className="text-center">
          {value}
        </FitText>
      </div>
      {sharePct != null && barCls && (
        <>
          <div className={`mx-auto h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-surface-elevated ${compact ? "mt-1" : "mt-1.5"}`}>
            <div className={`h-full rounded-full transition-all duration-500 ${barCls}`} style={{ width: `${sharePct}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-faint">{sharePct}%</p>
        </>
      )}
    </div>
  );
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
