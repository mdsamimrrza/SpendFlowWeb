"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useRowConverter } from "@/hooks/useRates";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { Panel } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrendChart, type TrendPoint } from "@/components/charts/TrendChart";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney } from "@/utils/format";

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

interface FlowChartCardProps {
  /** Panel masthead label. */
  label?: string;
  /** Fetch window for underlying rows (default 5 years). */
  fetchDays?: number;
  /** Render without the outer panel — for embedding inside a parent sheet. */
  bare?: boolean;
}

/**
 * Cash-flow chart card with stock-style range selection: 1D (hour buckets),
 * 1W/1M/3M (day buckets), 1Y/5Y (month buckets), Custom (date inputs).
 * Series are gap-filled so the chart reads continuously like a market chart,
 * with an IN/OUT/NET summary strip for the selected window.
 */
export function FlowChartCard({ label = "Cash flow", bare = false }: FlowChartCardProps) {
  const { user, profile } = useAuth();
  const { locale } = useLanguage();
  const { mask } = usePrivacy();
  const [range, setRange] = useState<RangeKey>("1M");
  const [customFrom, setCustomFrom] = useState(() => shiftDays(today(), -30));
  const [customTo, setCustomTo] = useState(() => today());
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [loading, setLoading] = useState(true);
  // rows feed the converter so NPR dates resolve via their INR rate (peg parity).
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
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
  }, [user, supabase]);

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
        out.push({ date: `${from} ${String(h).padStart(2, "0")}:00`, ...slot });
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

  const rangeLabel = useMemo(() => {
    if (range === "CUSTOM") return `${window_.from} → ${window_.to}`;
    if (range === "1D") return "Today, by hour";
    if (range === "1Y") return "Trailing 12 months";
    if (range === "5Y") return "Trailing 5 years";
    const n = Number(range.slice(0, -1));
    const unit = range.endsWith("M") ? "month" : "day";
    return `Trailing ${n} ${unit}${n === 1 ? "" : "s"}`;
  }, [range, window_]);

  const inner = (
      <div className="p-5">
        {range === "CUSTOM" && (
          <div className="mb-4 flex flex-wrap items-end gap-3 border border-border bg-surface-elevated/40 p-3">
            <Input
              label="From"
              type="date"
              value={customFrom}
              max={today()}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="!h-9 w-40"
            />
            <Input
              label="To"
              type="date"
              value={customTo}
              max={today()}
              onChange={(e) => setCustomTo(e.target.value)}
              className="!h-9 w-40"
            />
          </div>
        )}

        {loading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <>
            <TrendChart points={points} locale={locale} />
            {/* Range summary strip */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
              <SummaryCell label="Inflow" value={fmt(totals.income)} cls="text-income" />
              <SummaryCell label="Outflow" value={fmt(totals.expense)} cls="text-danger" />
              <SummaryCell
                label={`Net · ${displayCurrency}`}
                value={`${totals.income - totals.expense >= 0 ? "+" : "−"}${fmt(Math.abs(totals.income - totals.expense)).replace(/^[^\d]*/, "")}`}
                cls={totals.income - totals.expense >= 0 ? "text-income" : "text-danger"}
              />
            </div>
            <p className="stamp mt-2">{rangeLabel}</p>
          </>
        )}
      </div>
  );

  if (bare) {
    return (
      <div>
        <div className="flex items-center justify-between px-5 py-2.5">
          <span className="caps">{label}</span>
          <div className="flex border border-border">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`h-7 px-2.5 text-[11px] font-bold uppercase tracking-wide transition ${
                  range === r.key ? "bg-primary text-white" : "text-text-muted hover:text-text"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {inner}
      </div>
    );
  }

  return (
    <Panel
      label={label}
      action={
        <div className="flex border border-border">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`h-7 px-2.5 text-[11px] font-bold uppercase tracking-wide transition ${
                range === r.key ? "bg-primary text-white" : "text-text-muted hover:text-text"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {inner}
    </Panel>
  );
}

function SummaryCell({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="px-2 text-center first:pl-0 last:pr-0">
      <p className="caps">{label}</p>
      <p className={`numeric mt-0.5 text-sm font-extrabold ${cls}`}>{value}</p>
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
