"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  TransferHistoryStatement,
  type TransferHistoryInject,
} from "@/components/transfer/TransferHistoryStatement";
import type { TransferRow } from "@/services/transfers";

/**
 * Static design preview of the Transfer log register (mock data, no auth, no
 * network) — telemetry strip, filter band and the movement register with the
 * detail sheet reachable, screenshottable without an account.
 */
const base = {
  user_id: "mock",
  time: null,
  updated_at: "2026-09-08T00:00:00Z",
  deleted_at: null,
};

const from = { id: "a1", name: "Nepal Investment Bank", currency: "NPR" };
const to = { id: "a2", name: "Cash wallet", currency: "NPR" };
const wise = { id: "a4", name: "Wise USD", currency: "USD" };
const esewa = { id: "a3", name: "eSewa", currency: "NPR" };

const rows = [
  {
    ...base,
    id: "t1",
    from_account_id: "a3",
    to_account_id: "a1",
    amount: 5000,
    from_currency: "NPR",
    to_currency: "NPR",
    exchange_rate: 1,
    converted_amount: 5000,
    fee: 0,
    date: "2026-09-08",
    created_at: "2026-09-08T09:30:00Z",
    notes: "Top-up before rent",
    from_account: esewa,
    to_account: from,
  },
  {
    ...base,
    id: "t2",
    from_account_id: "a1",
    to_account_id: "a2",
    amount: 3000,
    from_currency: "NPR",
    to_currency: "NPR",
    exchange_rate: 1,
    converted_amount: 3000,
    fee: 0,
    date: "2026-09-05",
    created_at: "2026-09-05T18:12:00Z",
    notes: null,
    from_account: from,
    to_account: to,
  },
  {
    ...base,
    id: "t3",
    from_account_id: "a1",
    to_account_id: "a4",
    amount: 15000,
    from_currency: "NPR",
    to_currency: "USD",
    exchange_rate: 0.0074945,
    converted_amount: 112.42,
    fee: 250,
    date: "2026-09-02",
    created_at: "2026-09-02T11:05:00Z",
    notes: "Savings sweep",
    from_account: from,
    to_account: wise,
  },
  {
    ...base,
    id: "t4",
    from_account_id: "a1",
    to_account_id: "a2",
    amount: 1200,
    from_currency: "NPR",
    to_currency: "NPR",
    exchange_rate: 1,
    converted_amount: 1200,
    fee: 0,
    date: "2026-08-28",
    created_at: "2026-08-28T08:40:00Z",
    notes: null,
    from_account: from,
    to_account: to,
  },
] as unknown as TransferRow[];

const inject: TransferHistoryInject = { rows };

export default function PreviewTransferLogPage() {
  return (
    <DashboardShell>
      <TransferHistoryStatement inject={inject} />
    </DashboardShell>
  );
}
