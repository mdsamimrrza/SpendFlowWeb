"use client";

import { BullionStatement } from "@/components/bullion/BullionStatement";

/** Thin route wrapper — the statement lives at @/components/bullion/BullionStatement (preview harnesses pass inject there). */
export default function BullionPage() {
  return <BullionStatement />;
}
