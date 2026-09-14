"use client";

import { TransferStatement } from "@/components/transfer/TransferStatement";

/** Thin route wrapper — the statement lives at @/components/transfer/TransferStatement (preview harnesses pass inject there). */
export default function TransferPage() {
  return <TransferStatement />;
}
