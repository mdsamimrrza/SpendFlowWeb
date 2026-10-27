"use client";

import { useEffect, useRef, useState } from "react";

/** One bucket of the cash-flow chart. */
export interface FlowPoint {
  label: string;
  income: number;
  expense: number;
}

/**
 * Cash-flow chart, professional duet: one line for income, one for expense,
 * smooth cubic curves with point dots – the shape on screen is the shape of
 * the data. Right-hand value gutter with gridlines and an end-value tag per
 * series; crosshair (pointer/touch) tags both values and the bucket; when
 * `onHover` is given the card renders the bucket readout itself and the
 * floating tooltip is suppressed. Outlier-aware scale: a salary day caps the
 * axis near the typical bucket (true figures always in the readout). Tokens:
 * income = --sf-income, expense = --sf-expense-series.
 */
export function FlowChart({
  points,
  format,
  tickFormat,
  labels,
  legend = true,
  onHover,
}: {
  points: FlowPoint[];
  format: (n: number) => string;
  tickFormat: (n: number) => string;
  labels: { income: string; expense: string; empty: string };
  /** Set false when the surrounding card already carries the color key. */
  legend?: boolean;
  /** Hover target for cards that mirror the bucket in their own readout row
   *  (the floating tooltip card shows regardless). */
  onHover?: (index: number | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({
        w: entry.contentRect.width,
        h: Math.max(200, entry.contentRect.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = size.w;
  const H = size.h;

  if (points.length < 2 || points.every((p) => p.income === 0 && p.expense === 0)) {
    return (
      <div
        ref={wrapRef}
        className="grid h-full min-h-[200px] place-items-center text-[13px] text-faint"
      >
        {labels.empty}
      </div>
    );
  }

  const padTop = 16;
  const padBottom = 26;
  const n = points.length;
  const innerH = H - padTop - padBottom;
  const plotBottom = padTop + innerH;

  // Outlier-aware axis: when one bucket (salary + rent landing together)
  // dwarfs the typical bucket, cap the scale near the typical one so the
  // rest of the window stays readable; clamped points peg to the edge.
  const values = points.flatMap((p) => [p.income, p.expense]);
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  const rawMax = Math.max(...values);
  const p75 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.75)] : rawMax;
  const max = p75 > 0 && rawMax > p75 * 3 ? niceCeil(p75 * 2) : niceCeil(rawMax);
  const y = (v: number) => padTop + innerH - (Math.min(v, max) / max) * innerH;

  const gridTicks = niceTicks(0, max, 3);
  // Right gutter hosts the axis labels and the series end-value tags, like a
  // trading terminal. It sizes itself to the widest FULL number it must show
  // (no "40K" shorthand – the caller's tickFormat renders grouped numerals).
  const axisW = Math.min(
    104,
    Math.max(
      44,
      Math.ceil(
        Math.max(
          ...gridTicks.map((v) => tickFormat(v).length),
          tickFormat(points[n - 1].income).length,
          tickFormat(points[n - 1].expense).length,
          4,
        ) * 5.9,
      ) + 12,
    ),
  );
  const inner = Math.max(80, width - axisW);

  // Band x-scale with a half-slot inset so edge buckets keep full width.
  const slot = inner / n;
  const x = (i: number) => slot * i + slot / 2;

  const pathOf = (key: "income" | "expense") => {
    const coordinates = points.map((p, i) => ({ x: x(i), y: y(p[key]) }));
    if (coordinates.length < 2) return "";

    const clampY = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    let path = `M${coordinates[0].x.toFixed(2)} ${coordinates[0].y.toFixed(2)}`;
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      const current = coordinates[i];
      const next = coordinates[i + 1];
      const previous = coordinates[i - 1] ?? current;
      const following = coordinates[i + 2] ?? next;
      // Catmull-Rom control points, clamped to the segment's own y-span –
      // otherwise a clamped spike → zero run swings the curve past the
      // baseline (cash can't render negative when every value is ≥ 0).
      const lo = Math.min(current.y, next.y);
      const hi = Math.max(current.y, next.y);
      const controlBefore = {
        x: current.x + (next.x - previous.x) / 6,
        y: clampY(current.y + (next.y - previous.y) / 6, lo, hi),
      };
      const controlAfter = {
        x: next.x - (following.x - current.x) / 6,
        y: clampY(next.y - (following.y - current.y) / 6, lo, hi),
      };
      path += ` C${controlBefore.x.toFixed(2)} ${controlBefore.y.toFixed(2)},${controlAfter.x.toFixed(2)} ${controlAfter.y.toFixed(2)},${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }
    return path;
  };
  const incomePath = pathOf("income");
  const expensePath = pathOf("expense");
  const dotIdx = n <= 16 ? points.map((_, i) => i) : [0, n - 1];

  // Thin x labels to ~6 so even a 31-day window stays legible at 390px.
  const labelStep = Math.max(1, Math.ceil(n / 6));
  const labelIdx = points
    .map((_, i) => i)
    .filter((i) => i % labelStep === 0 || i === n - 1);
  // The forced last label can land right next to the previous tick (a 12-bucket
  // year ends 10,11) – drop the runner-up so the axis never crowds.
  if (labelIdx.length >= 2 && labelIdx[labelIdx.length - 1] - labelIdx[labelIdx.length - 2] < labelStep) {
    labelIdx.splice(labelIdx.length - 2, 1);
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Map by the PLOT width only (the right axis gutter is inside this same
    // SVG – dividing by the full width skewed every bucket leftward, so the
    // crosshair snapped to a neighbour of the bucket under the cursor).
    const rel = e.clientX - rect.left;
    const idx = Math.floor((rel / Math.max(1, inner)) * n);
    setHover(Math.max(0, Math.min(n - 1, idx)));
    onHover?.(Math.max(0, Math.min(n - 1, idx)));
  };
  const clearHover = () => {
    setHover(null);
    onHover?.(null);
  };

  const tagW = axisW - 4;

  // End tags per series: a zero value gets no chip at all (a "0" tag riding
  // the baseline is noise), chips stay inside the plot, and two chips never
  // overlap – the higher value takes the upper slot.
  const tagClamp = (top: number) => Math.min(Math.max(top, padTop - 4), plotBottom - 16);
  const tagPair = (incV: number, expV: number): { incY: number | null; expY: number | null } => {
    if (incV > 0 && expV > 0) {
      let top = Math.min(y(incV), y(expV)) - 8;
      let bot = Math.max(y(incV), y(expV)) - 8;
      if (bot - top < 17) bot = top + 17;
      top = tagClamp(top);
      bot = tagClamp(bot);
      if (bot - top < 17) top = Math.max(padTop - 4, bot - 17);
      const incAbove = y(incV) <= y(expV);
      return { incY: incAbove ? top : bot, expY: incAbove ? bot : top };
    }
    return {
      incY: incV > 0 ? tagClamp(y(incV) - 8) : null,
      expY: expV > 0 ? tagClamp(y(expV) - 8) : null,
    };
  };
  const endTags = tagPair(points[n - 1].income, points[n - 1].expense);
  const hoverTags = hover != null ? tagPair(points[hover].income, points[hover].expense) : null;

  // Floating readout card: anchored to the hovered dots – above them when
  // they sit low, below when they sit high, flipping sides near the edges –
  // so it follows the pointer instead of parking over the lines.
  const tipW = 160;
  const tipH = 84;
  const hoverCard =
    hover != null
      ? (() => {
          const yHigh = Math.min(y(points[hover].income), y(points[hover].expense));
          const yLow = Math.max(y(points[hover].income), y(points[hover].expense));
          let top = yHigh - tipH - 10;
          if (top < 2) {
            // No room above a peak that touches the chart top – hover beside
            // the cursor (centred on the dot span), never drop to the baseline.
            top = Math.max(2, Math.min((yHigh + yLow) / 2 - tipH / 2, H - tipH - 4));
          }
          top = Math.max(2, Math.min(top, H - tipH - 4));
          let left = x(hover) + 12;
          if (left + tipW > width - 4) left = x(hover) - tipW - 12;
          return { top, left: Math.max(4, Math.min(left, width - tipW - 4)) };
        })()
      : null;

  return (
    <div className="flex h-full min-h-[200px] flex-col">
      {legend && (
        <div className="mb-2 flex items-center gap-4 px-1 text-[11.5px] font-medium text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: "#3b95e8" }} />
            {labels.income}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: "#ef5263" }} />
            {labels.expense}
          </span>
        </div>
      )}
      <div ref={wrapRef} className="relative min-h-[200px] flex-1">
        {width > 0 && (
          <svg width={width} height={H} className="overflow-visible">
            <defs>
              <linearGradient id="income-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3b95e8" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#3b95e8" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="expense-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ef5263" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ef5263" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Gridlines + axis labels in the right gutter. */}
            {gridTicks.map((v) => (
              <g key={v}>
                <line x1={0} x2={inner} y1={y(v)} y2={y(v)} stroke="var(--sf-border)" strokeDasharray="2 4" />
                <text x={width} y={y(v) + 3} textAnchor="end" className="numeric fill-faint text-[9.5px]">
                  {tickFormat(v)}
                </text>
              </g>
            ))}
            <line x1={0} x2={width} y1={plotBottom} y2={plotBottom} stroke="var(--sf-border)" />

            {/* Series. */}
            <path
              d={`${incomePath} L${x(n - 1).toFixed(2)} ${plotBottom.toFixed(2)} L${x(0).toFixed(2)} ${plotBottom.toFixed(2)} Z`}
              fill="url(#income-area)"
              stroke="none"
            />
            <path
              d={`${expensePath} L${x(n - 1).toFixed(2)} ${plotBottom.toFixed(2)} L${x(0).toFixed(2)} ${plotBottom.toFixed(2)} Z`}
              fill="url(#expense-area)"
              stroke="none"
            />
            <path
              d={expensePath}
              fill="none"
              stroke="#ef5263"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              className="draw"
            />
            <path
              d={incomePath}
              fill="none"
              stroke="#3b95e8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              className="draw chart-draw-delay"
            />

            {/* Point dots – every bucket on short windows, endpoints otherwise. */}
            <g className="chart-fade">
              {dotIdx.map((i) => (
                <g key={i}>
                  <circle cx={x(i)} cy={y(points[i].expense)} r="2.5" fill="var(--sf-surface)" stroke="#ef5263" strokeWidth="1.5" />
                  <circle cx={x(i)} cy={y(points[i].income)} r="2.5" fill="var(--sf-surface)" stroke="#3b95e8" strokeWidth="1.5" />
                </g>
              ))}
            </g>

            {/* End-value tags pinned in the axis gutter (kept inside the plot,
                suppressed for zero values). */}
            <g className="chart-fade">
              {endTags.incY != null && (
                <>
                  <circle cx={x(n - 1)} cy={y(points[n - 1].income)} r="3" fill="#3b95e8" stroke="var(--sf-surface)" strokeWidth="1.5" />
                  <rect x={inner + 2} y={endTags.incY} width={tagW} height={16} rx={4} fill="var(--sf-income)" />
                  <text
                    x={inner + 2 + tagW / 2}
                    y={endTags.incY + 11.5}
                    textAnchor="middle"
                    className="numeric fill-[var(--sf-primary-ink)] text-[9.5px] font-semibold"
                  >
                    {tickFormat(points[n - 1].income)}
                  </text>
                </>
              )}
              {endTags.expY != null && (
                <>
                  <circle cx={x(n - 1)} cy={y(points[n - 1].expense)} r="3" fill="#ef5263" stroke="var(--sf-surface)" strokeWidth="1.5" />
                  <rect x={inner + 2} y={endTags.expY} width={tagW} height={16} rx={4} fill="var(--sf-expense-series)" />
                  <text
                    x={inner + 2 + tagW / 2}
                    y={endTags.expY + 11.5}
                    textAnchor="middle"
                    className="numeric fill-[var(--sf-primary-ink)] text-[9.5px] font-semibold"
                  >
                    {tickFormat(points[n - 1].expense)}
                  </text>
                </>
              )}
            </g>

            {/* X labels */}
            {labelIdx.map((i) => (
              <text
                key={i}
                x={Math.min(Math.max(x(i), 14), inner - 14)}
                y={H - 7}
                textAnchor="middle"
                className="fill-faint text-[10px]"
              >
                {points[i].label}
              </text>
            ))}

            {/* Crosshair with axis tags. */}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padTop - 8} y2={plotBottom} stroke="var(--sf-faint)" strokeDasharray="3 3" />
                <circle cx={x(hover)} cy={y(points[hover].income)} r="3.5" fill="var(--sf-surface)" stroke="var(--sf-income)" strokeWidth="2" />
                <circle cx={x(hover)} cy={y(points[hover].expense)} r="3.5" fill="var(--sf-surface)" stroke="var(--sf-expense-series)" strokeWidth="2" />
                {hoverTags!.incY != null && (
                  <>
                    <rect x={inner + 2} y={hoverTags!.incY} width={tagW} height={16} rx={4} fill="var(--sf-surface)" stroke="var(--sf-border)" />
                    <text
                      x={inner + 2 + tagW / 2}
                      y={hoverTags!.incY + 11.5}
                      textAnchor="middle"
                      className="numeric fill-text text-[9.5px] font-semibold"
                    >
                      {tickFormat(points[hover].income)}
                    </text>
                  </>
                )}
                {hoverTags!.expY != null && (
                  <>
                    <rect
                      x={inner + 2}
                      y={hoverTags!.expY}
                      width={tagW}
                      height={16}
                      rx={4}
                      fill="var(--sf-surface)"
                      stroke="var(--sf-border)"
                    />
                    <text
                      x={inner + 2 + tagW / 2}
                      y={hoverTags!.expY + 11.5}
                      textAnchor="middle"
                      className="numeric fill-text text-[9.5px] font-semibold"
                    >
                      {tickFormat(points[hover].expense)}
                    </text>
                  </>
                )}
                <rect
                  x={Math.min(Math.max(x(hover) - 16, 0), inner - 32)}
                  y={H - 20}
                  width={32}
                  height={16}
                  rx={4}
                  fill="var(--sf-text)"
                />
                <text
                  x={Math.min(Math.max(x(hover), 16), inner - 16)}
                  y={H - 8.5}
                  textAnchor="middle"
                  className="numeric fill-[var(--sf-primary-ink)] text-[9.5px] font-semibold"
                >
                  {points[hover].label}
                </text>
              </g>
            )}

            <rect
              width={width}
              height={H}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={clearHover}
            />
          </svg>
        )}

        {/* Floating readout card – anchored to the hovered dots, out of the lines' way. */}
        {hoverCard && hover != null && (
          <div
            className="pointer-events-none absolute z-10 w-40 rounded-xl border border-border bg-surface p-2.5 shadow-pop"
            style={{ left: hoverCard.left, top: hoverCard.top }}
          >
            <p className="mb-1.5 truncate text-[11px] font-semibold text-text">
              {points[hover].label}
            </p>
            <TipRow color="var(--sf-income)" label={labels.income} value={format(points[hover].income)} />
            <TipRow
              color="var(--sf-expense-series)"
              label={labels.expense}
              value={format(points[hover].expense)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-3 py-0.5 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="numeric text-text">{value}</span>
    </p>
  );
}

/** Round a chart max up to a 1/2/2.5/5/6×10^n figure so tick labels stay sane
 *  (the 6 step keeps values like 52K from jumping the ladder clean to 100K). */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : f <= 6 ? 6 : 10;
  return nf * exp;
}

/** Even, human-stepped gridline values across [lo, hi]. */
function niceTicks(lo: number, hi: number, count: number): number[] {
  if (hi <= lo) hi = lo + 1;
  const step0 = (hi - lo) / count;
  const exp = Math.pow(10, Math.floor(Math.log10(step0)));
  const f = step0 / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  const step = nf * exp;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    // Snap float-noise ticks that land within a hair of zero to exactly 0
    // (a "-0" axis label is a tell of sloppy math).
    out.push(Math.abs(v) < step * 0.01 ? 0 : v);
  }
  return out;
}
