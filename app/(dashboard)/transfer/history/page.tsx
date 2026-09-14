"use client";

import { TransferHistoryStatement } from "@/components/transfer/TransferHistoryStatement";

/** Thin route wrapper — the statement lives at @/components/transfer/TransferHistoryStatement (preview harnesses pass inject there). */
export default function TransferHistoryPage() {
  return <TransferHistoryStatement />;
}
