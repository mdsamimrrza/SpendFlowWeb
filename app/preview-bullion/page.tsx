"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  BullionStatement,
  type BullionInject,
  type BullionSeriesPoint,
} from "@/components/bullion/BullionStatement";

/**
 * Static design preview of the Bullion board (mock data, no auth, no
 * network) — mobile-parity layout: benchmark cards, the synchronized spline
 * chart, valuation calculator and standards guide.
 */
const TOLA_G = 11.6638;

const board: BullionInject["board"] = {
  goldTola: 300100,
  gold10g: 257290,
  tejabiTola: 277800,
  tejabi10g: 238172,
  silverTola: 4600,
  silver10g: 3944,
};

// Smooth ~4-month gold walk (NPR per tola), silver co-moves at ~1.53%.
const goldTolaSeries: BullionSeriesPoint[] = Array.from({ length: 120 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 4, 15));
  d.setUTCDate(d.getUTCDate() + i);
  const wave = Math.sin(i / 9) * 6400 + Math.sin(i / 23) * 10400;
  return {
    date: d.toISOString().slice(0, 10),
    price: Math.round(262000 + i * 320 + wave),
  };
});
const silverTolaSeries: BullionSeriesPoint[] = goldTolaSeries.map((p) => ({
  date: p.date,
  price: Math.round(p.price * 0.01533),
}));
// 10 g series derive from the tola walk exactly like the stored official rows.
const to10g = (s: BullionSeriesPoint[]): BullionSeriesPoint[] =>
  s.map((p) => ({ date: p.date, price: Math.round((p.price * 10) / TOLA_G) }));

const inject: BullionInject = {
  board,
  official: {
    rateDate: "2026-09-11",
    fineGoldPerTola: 300100,
    fineGoldPer10g: 257290,
    tejabiPerTola: 277800,
    tejabiPer10g: 238172,
    silverPerTola: 4600,
    silverPer10g: 3944,
  },
  series: {
    gold_tola: goldTolaSeries,
    silver_tola: silverTolaSeries,
    gold_10g: to10g(goldTolaSeries),
    silver_10g: to10g(silverTolaSeries),
  },
};

export default function PreviewBullionPage() {
  return (
    <DashboardShell>
      <BullionStatement inject={inject} />
    </DashboardShell>
  );
}
