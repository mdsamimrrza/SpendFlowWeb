"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/store/LanguageContext";
import type { FlowPoint } from "@/components/graphs/FlowChart";

/** Round a maximum up to a clean tick ceiling (1 / 2 / 2.5 / 5 × 10^k). */
function niceMax(v: number): number {
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * base) return m * base;
  }
  return 10 * base;
}

/**
 * Overview cash-flow card chart (Ledger Console reference): smoothed income
 * vs expense splines over the selected range's buckets, Line/Bar toggle,
 * crosshair + floating readout, bottom legend. Points come from the page's
 * range bucket-builder; the y-scale derives from the data (nice-step
 * ceiling) and every figure is a full grouped numeral.
 */
export function CashFlowSplineChart({
  points = [],
}: {
  points?: FlowPoint[];
}) {
  const { locale, t } = useLanguage();
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const data = points.length >= 2 ? points : [];
  const n = data.length;
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);
  const showChart = n >= 2 && hasData;
  // Stable data key: remounts the series when the data changes so the
  // entrance draw-in replays in sync (overview range switches included).
  const dataKey = useMemo(
    () => data.map((d) => `${d.label}:${d.income}:${d.expense}`).join("|"),
    [data],
  );
  // Re-measures whenever the chart area (re)appears: with delayed data the
  // empty state renders first, so the container only exists later.
  useEffect(() => {
    if (!showChart) return;
    const el = containerRef.current;
    if (!el) return;
    setWidth(Math.max(260, el.clientWidth || 320));
    const ro = new ResizeObserver(([entry]) => {
      if (entry?.contentRect?.width) {
        setWidth(Math.max(260, entry.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [showChart]);



  const numFmt = useMemo(
    () => (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v),
    [locale],
  );

  const H = 240;
  const padTop = 15;
  const padBottom = 30;
  const gutterLeft = 52;
  const gutterRight = 16;

  const yMax = useMemo(
    () => niceMax(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)))),
    [data],
  );
  // Deduped: tiny peaks round quarter-steps onto the same integer, and
  // duplicate keys/values drew overlapping gridlines.
  const yTicks = useMemo(() => {
    if (n === 0) return [];
    return [...new Set([0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f)).concat(0))].sort(
      (a, b) => b - a,
    );
  }, [yMax, n]);

  const plotW = Math.max(80, width - gutterLeft - gutterRight);
  const plotH = H - padTop - padBottom;
  const plotBottom = padTop + plotH;

  const getY = (val: number) => {
    const clamped = Math.max(0, Math.min(yMax, val));
    return plotBottom - (clamped / yMax) * plotH;
  };

  const getX = (idx: number) => {
    if (n <= 1) return gutterLeft + plotW / 2;
    return gutterLeft + (idx / (n - 1)) * plotW;
  };

  // Spline generator using cubic Bezier curves
  const buildSplinePath = (seriesKey: "income" | "expense") => {
    const pts = data.map((d, i) => ({ x: getX(i), y: getY(d[seriesKey]) }));
    if (pts.length < 2) return "";

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 5.5;
      const cp1y = p1.y + (p2.y - p0.y) / 5.5;
      const cp2x = p2.x - (p3.x - p1.x) / 5.5;
      const cp2y = p2.y - (p3.y - p1.y) / 5.5;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const incomeLine = n >= 2 ? buildSplinePath("income") : "";
  const expenseLine = n >= 2 ? buildSplinePath("expense") : "";

  const incomeArea = incomeLine
    ? `${incomeLine} L ${getX(n - 1).toFixed(1)} ${plotBottom} L ${getX(0).toFixed(1)} ${plotBottom} Z`
    : "";
  const expenseArea = expenseLine
    ? `${expenseLine} L ${getX(n - 1).toFixed(1)} ${plotBottom} L ${getX(0).toFixed(1)} ${plotBottom} Z`
    : "";

  return (
    <div className="flex h-full min-w-0 flex-col justify-between">
      {/* Header with Title and Line/Bar Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Cash Flow Trends</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">Daily breakdown of income vs expenses</p>
        </div>
        <div className="flex items-center rounded-md border border-gray-200 bg-gray-50/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setChartType("line")}
            className={`rounded px-3.5 py-1 text-xs font-medium transition-all ${
              chartType === "line"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Line
          </button>
          <button
            type="button"
            onClick={() => setChartType("bar")}
            className={`rounded px-3.5 py-1 text-xs font-medium transition-all ${
              chartType === "bar"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Bar
          </button>
        </div>
      </div>

      {/* SVG Chart Area */}
      {!showChart ? (
        <div className="mt-4 flex h-[240px] items-center justify-center text-xs text-gray-400">
          {t("noTransactions")}
        </div>
      ) : (
        <div ref={containerRef} className="relative mt-4 h-[240px] w-full min-w-0 overflow-hidden select-none">
          <svg width={width} height={H} className="overflow-visible">
            <defs>
              <linearGradient id="sf-income-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
              </linearGradient>
              <linearGradient id="sf-expense-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Horizontal gridlines and Y-axis tick values on the left */}
            {yTicks.map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <text
                    x={gutterLeft - 10}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-gray-400 text-[10px] font-normal"
                  >
                    {numFmt(val)}
                  </text>
                  <line
                    x1={gutterLeft}
                    x2={width - gutterRight}
                    y1={y}
                    y2={y}
                    strokeDasharray="2 3"
                    className="stroke-gray-200 dark:stroke-[#262626]"
                  />
                </g>
              );
            })}

            {chartType === "line" ? (
              <>
                {/* Income Area & Line — draw-in synced with the expense series */}
                {incomeArea && (
                  <path key={`ia-${dataKey}`} d={incomeArea} fill="url(#sf-income-grad)" className="chart-fade" />
                )}
                {incomeLine && (
                  <path
                    key={`il-${dataKey}`}
                    d={incomeLine}
                    pathLength={2400}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="chart-draw"
                  />
                )}

                {/* Expense Area & Line */}
                {expenseArea && (
                  <path key={`ea-${dataKey}`} d={expenseArea} fill="url(#sf-expense-grad)" className="chart-fade" />
                )}
                {expenseLine && (
                  <path
                    key={`el-${dataKey}`}
                    d={expenseLine}
                    pathLength={2400}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="chart-draw"
                  />
                )}
              </>
            ) : (
              /* Bar Chart Mode */
              <g key={`bars-${dataKey}`} className="chart-fade">
                {data.map((d, i) => {
                  const cx = getX(i);
                  const barW = Math.min(14, Math.max(3, (plotW / n) * 0.35));
                  const incH = Math.max(2, (d.income / yMax) * plotH);
                  const expH = Math.max(2, (d.expense / yMax) * plotH);

                  return (
                    <g key={`${d.label}-${i}`}>
                      {/* Income Bar (Blue) */}
                      <rect
                        x={cx - barW - 1.5}
                        y={plotBottom - incH}
                        width={barW}
                        height={incH}
                        rx={3}
                        fill="#2563eb"
                        className="opacity-90 hover:opacity-100 transition-opacity"
                      />
                      {/* Expense Bar (Red) */}
                      <rect
                        x={cx + 1.5}
                        y={plotBottom - expH}
                        width={barW}
                        height={expH}
                        rx={3}
                        fill="#ef4444"
                        className="opacity-90 hover:opacity-100 transition-opacity"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* X-axis tick labels */}
            {data.map((d, i) => (
              <text
                key={`${d.label}-${i}`}
                x={getX(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-gray-400 text-[10px] font-normal"
              >
                {d.label}
              </text>
            ))}

            {/* Interactive hover crosshair */}
            {hoverIndex != null && (
              <g>
                <line
                  x1={getX(hoverIndex)}
                  x2={getX(hoverIndex)}
                  y1={padTop}
                  y2={plotBottom}
                  strokeDasharray="2 2"
                  className="stroke-gray-300 dark:stroke-[#3a4656]"
                />
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(data[hoverIndex].income)}
                  r={4}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(data[hoverIndex].expense)}
                  r={4}
                  fill="#ffffff"
                  stroke="#ef4444"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* Transparent hit target for hover events */}
            <rect
              x={gutterLeft}
              y={padTop}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                const idx = Math.round((relX / plotW) * (n - 1));
                setHoverIndex(Math.max(0, Math.min(n - 1, idx)));
              }}
              onPointerLeave={() => setHoverIndex(null)}
            />
          </svg>

          {/* Floating Tooltip */}
          {hoverIndex != null && (
            <div
              className="pointer-events-none absolute z-20 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur-xs text-xs dark:border-[#262626] dark:bg-[#0a0a0a]/95"
              style={{
                left: Math.max(10, Math.min(width - 150, getX(hoverIndex) - 60)),
                top: 15,
              }}
            >
              <p className="font-semibold text-gray-900 dark:text-gray-100">{data[hoverIndex].label}</p>
              <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Income:
                </span>
                <span className="numeric font-semibold text-gray-900 dark:text-gray-100">
                  {numFmt(data[hoverIndex].income)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Expense:
                </span>
                <span className="numeric font-semibold text-gray-900 dark:text-gray-100">
                  {numFmt(data[hoverIndex].expense)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend at Bottom Center */}
      <div className="mt-3 flex items-center justify-center gap-6 text-[11px] font-medium text-gray-600">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-xs bg-[#2563eb]" />
          <span>Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-xs bg-[#ef4444]" />
          <span>Expenses</span>
        </div>
      </div>
    </div>
  );
}
