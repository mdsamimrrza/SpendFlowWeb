"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { BullionStatement, type BullionInject } from "@/components/bullion/BullionStatement";
import type { TrendPoint } from "@/components/charts/TrendChart";

/**
 * Static design preview of the Bullion benchmarks board (mock data, no auth,
 * no network) — FENEGOSIDA-calibrated board tiles, local-per-tola trend and
 * the instant valuation card, screenshottable without the rate feed.
 */
const board: BullionInject["board"] = {
  goldTola: 146100,
  gold10g: 125300,
  tejabiTola: 135200,
  tejabi10g: 115900,
  silverTola: 1850,
  silver10g: 1587,
};

// Smooth ~4-month gold walk (NPR per tola), silver co-moves at ~1.3%.
const historyLocal: TrendPoint[] = Array.from({ length: 120 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 4, 15));
  d.setUTCDate(d.getUTCDate() + i);
  const wave = Math.sin(i / 9) * 3200 + Math.sin(i / 23) * 5200;
  const gold = 128000 + i * 152 + wave;
  return {
    date: d.toISOString().slice(0, 10),
    income: 0,
    expense: Math.round(gold),
  };
});

const fixesRows = historyLocal.slice(-8).reverse().map((p) => ({
  date: p.date,
  gold: p.expense,
  silver: Math.round(p.expense * 0.0127),
}));

const inject: BullionInject = {
  board,
  official: {
    rateDate: "2026-09-11",
    fineGoldPerTola: 146100,
    fineGoldPer10g: 125300,
    tejabiPerTola: 135200,
    tejabiPer10g: 115900,
    silverPerTola: 1850,
    silverPer10g: 1587,
  },
  historyLocal,
  fixesRows,
  dayChangePct: 2,
};

export default function PreviewBullionPage() {
  return (
    <DashboardShell>
      <BullionStatement inject={inject} />
    </DashboardShell>
  );
}
