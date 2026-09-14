"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { TransferStatement, type TransferInject } from "@/components/transfer/TransferStatement";
import type { BankAccountRow } from "@/services/bankAccounts";

/**
 * Static design preview of the Transfer form (mock data, no auth, no
 * network) — route cards, locked-rate FX strip and notes, screenshottable
 * without an account.
 */
const accounts = [
  {
    id: "a1",
    user_id: "mock",
    name: "Nepal Investment Bank",
    account_type: "bank",
    currency: "NPR",
    initial_balance: 41250,
    current_balance: null,
    color: "#10B981",
    icon: "🏦",
    account_number_last4: "4412",
    is_default: true,
    country: "NP",
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "a4",
    user_id: "mock",
    name: "Wise USD",
    account_type: "savings",
    currency: "USD",
    initial_balance: 420,
    current_balance: null,
    color: "#8B5CF6",
    icon: "📈",
    account_number_last4: null,
    is_default: false,
    country: null,
    created_at: "2026-02-11T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "a2",
    user_id: "mock",
    name: "Cash wallet",
    account_type: "cash",
    currency: "NPR",
    initial_balance: 2760,
    current_balance: null,
    color: "#F59E0B",
    icon: "💵",
    account_number_last4: null,
    is_default: false,
    country: null,
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    deleted_at: null,
  },
] as unknown as BankAccountRow[];

const inject: TransferInject = {
  accounts,
  balances: new Map([
    ["a1", 41250],
    ["a2", 2760],
    ["a4", 420],
  ]),
  // NPR → USD units-per-USD ratio (NPR per USD ≈ 133.45).
  rate: 0.0074945,
};

export default function PreviewTransferPage() {
  return (
    <DashboardShell>
      <TransferStatement inject={inject} />
    </DashboardShell>
  );
}
