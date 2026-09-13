"use client";

import { FitText } from "@/components/ui/FitText";

interface FlowSummaryBarProps {
  income: number;
  expense: number;
  formatted: (n: number) => string;
  netLabel?: string;
  peak?: { label: string; value: string } | null;
  entriesLabel?: string;
}

/**
 * Flow summary — ledger strip: inflow / outflow / net in hairline-divided
 * columns with a thin proportional rule underneath.
 */
export function FlowSummaryBar({
  income,
  expense,
  formatted,
  netLabel = "Net",
  peak = null,
  entriesLabel = "Inflow",
}: FlowSummaryBarProps) {
  const total = income + expense;
  const net = income - expense;
  // One rounded figure, complement derived — the pair always sums to 100%.
  const incomePct = total > 0 ? Math.round((income / total) * 100) : 50;
  const outflowPct = 100 - incomePct;

  return (
    <div className="panel">
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          <p className="caps">
            <span className="mr-1.5 inline-block h-2 w-2 translate-y-[-1px] rounded-none bg-income" />
            {entriesLabel}
          </p>
          <div className="figures mt-1.5 font-bold text-income">
            <FitText basePx={20} minPx={13}>{formatted(income)}</FitText>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="caps">
            <span className="mr-1.5 inline-block h-2 w-2 translate-y-[-1px] bg-danger" />
            Outflow
          </p>
          <div className="figures mt-1.5 font-bold text-danger">
            <FitText basePx={20} minPx={13}>{formatted(expense)}</FitText>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="caps">{netLabel}</p>
          <div className={`figures mt-1.5 font-bold ${net >= 0 ? "text-income" : "text-danger"}`}>
            <FitText basePx={20} minPx={13}>
              {net < 0 ? "−" : "+"}
              {formatted(Math.abs(net)).replace(/^[^\d]*/, "")}
            </FitText>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3">
        <div className="flex h-1.5 w-full bg-surface-elevated">
          <div className="h-full bg-income" style={{ width: `${incomePct}%` }} />
          <div className="h-full bg-danger" style={{ width: `${outflowPct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
          <span>
            {incomePct}% of flow is income
          </span>
          {peak && peak.value !== formatted(0) && (
            <span>
              Peak expense <span className="numeric font-bold text-text">{peak.value}</span>
              {peak.label ? ` — ${peak.label}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
