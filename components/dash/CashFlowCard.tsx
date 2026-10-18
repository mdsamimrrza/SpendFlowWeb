"use client";

import { useState } from "react";
import { DeltaChip } from "@/components/dash/primitives";
import { FlowChart, type FlowPoint } from "@/components/graphs/FlowChart";

/**
 * Full cash-flow card body – money context first, chart as the supporting
 * shape. Two presentations:
 *  - "ratio": window label + delta-vs-previous chip, an income/expense
 *    readout row (which becomes the hovered bucket's figures while
 *    pointing, trading-terminal style), the balance-curve chart with its
 *    volume lane, and an insight line (avg/day or avg/month).
 *  - "strip": chart-dominant. One compact totals strip up top doubles as
 *    the color key (also hover-aware); window label + insight sit under
 *    the plot.
 * Both suppress FlowChart's own legend – the colored dots live in the
 * card's own readout.
 */
export function CashFlowCard({
  design,
  points,
  totals,
  delta,
  windowLabel,
  insight,
  labels,
  format,
  tickFormat,
}: {
  design: "ratio" | "strip";
  points: FlowPoint[];
  totals: { income: number; expense: number };
  delta: { text: string; positive: boolean; label: string } | null;
  windowLabel: string;
  insight: string;
  labels: { income: string; expense: string; empty: string };
  format: (n: number) => string;
  tickFormat: (n: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  // Full grouped numerals (user direction - no "40K" shorthand anywhere on
  // the card); the currency prefix stays off the readout for width.
  const bare = (v: number) => format(v).replace(/^[^\d]*/, "");

  if (design === "ratio") {
    return (
      <div className="flex h-full min-h-[280px] flex-col sm:min-h-[320px]">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="truncate text-[11.5px] font-medium text-faint">{windowLabel}</p>
          {delta && (
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="shrink-0 text-[10.5px] text-faint">{delta.label}</span>
              <DeltaChip text={delta.text} positive={delta.positive} />
            </span>
          )}
        </div>

        {/* Readout row – window totals, or the pointed bucket while hovering.
            Income and expense only – the card does not surface net. */}
        <div className="mt-2.5 flex items-baseline justify-between gap-2 px-0.5">
          <Readout
            color="var(--sf-income)"
            label={labels.income}
            value={bare(hovered ? hovered.income : totals.income)}
          />
          <Readout
            color="var(--sf-expense-series)"
            label={labels.expense}
            value={bare(hovered ? hovered.expense : totals.expense)}
          />
          {hovered && (
            <span className="shrink-0 text-[11.5px] font-semibold text-text">{hovered.label}</span>
          )}
        </div>

        <div className="mt-1.5 min-h-[170px] flex-1">
          <FlowChart
            points={points}
            format={format}
            tickFormat={tickFormat}
            labels={labels}
            legend={false}
            onHover={setHoverIdx}
          />
        </div>

        <p className="mt-2 truncate px-0.5 text-[11px] text-faint">{insight}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col sm:min-h-[320px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-0.5">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] font-medium text-text-muted">
          <span className="inline-flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 self-center rounded-full"
              style={{ background: "var(--sf-income)" }}
            />
            {labels.income}
            <span className="numeric font-semibold text-text">
              {bare(hovered ? hovered.income : totals.income)}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 self-center rounded-full"
              style={{ background: "var(--sf-expense-series)" }}
            />
            {labels.expense}
            <span className="numeric font-semibold text-text">
              {bare(hovered ? hovered.expense : totals.expense)}
            </span>
          </span>
        </div>
        {delta && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="shrink-0 text-[10.5px] text-faint">{delta.label}</span>
            <DeltaChip text={delta.text} positive={delta.positive} />
          </span>
        )}
      </div>

      <div className="mt-1 min-h-[170px] flex-1">
        <FlowChart
          points={points}
          format={format}
          tickFormat={tickFormat}
          labels={labels}
          legend={false}
          onHover={setHoverIdx}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-0.5 text-[11px] text-faint">
        <span className="shrink-0">{windowLabel}</span>
        <span>{insight}</span>
      </div>
    </div>
  );
}

function Readout({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
        style={{ background: color }}
      />
      <span className="shrink-0 text-[11px] text-faint">{label}</span>
      <span className="numeric truncate text-[12.5px] font-semibold text-text">{value}</span>
    </span>
  );
}
