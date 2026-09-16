"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountsStatement, type AccountsInject } from "@/components/accounts/AccountsStatement";
import type { AccountCycleStat, BankAccountRow } from "@/services/bankAccounts";
import type { TransferRow } from "@/services/transfers";

/**
 * Static design preview of the Accounts register (mock data, no auth, no
 * network) — hero distribution bar, per-account share ticks, cycle activity
 * chips and the recent-movements rail, screenshottable without an account.
 */
const base = {
  user_id: "mock",
  current_balance: null,
  country: "NP",
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  deleted_at: null,
};

const accounts = [
  {
    ...base,
    id: "a1",
    name: "Nepal Investment Bank",
    account_type: "bank",
    currency: "NPR",
    initial_balance: 25000,
    color: "#10B981",
    icon: "🏦",
    account_number_last4: "4412",
    is_default: true,
  },
  {
    ...base,
    id: "a2",
    name: "Cash wallet",
    account_type: "cash",
    currency: "NPR",
    initial_balance: 3500,
    color: "#F59E0B",
    icon: "💵",
    account_number_last4: null,
    is_default: false,
  },
  {
    ...base,
    id: "a3",
    name: "eSewa",
    account_type: "wallet",
    currency: "NPR",
    initial_balance: 500,
    color: "#0EA5E9",
    icon: "👛",
    account_number_last4: "7834",
    is_default: false,
  },
  {
    ...base,
    id: "a4",
    name: "Wise USD",
    account_type: "savings",
    currency: "USD",
    initial_balance: 0,
    color: "#8B5CF6",
    icon: "📈",
    account_number_last4: null,
    is_default: false,
  },
] as unknown as BankAccountRow[];

const trBase = {
  user_id: "mock",
  fee: 0,
  time: null,
  notes: null,
  updated_at: "2026-09-08T00:00:00Z",
  deleted_at: null,
};

const transfers = [
  {
    ...trBase,
    id: "t1",
    from_account_id: "a3",
    to_account_id: "a1",
    amount: 5000,
    from_currency: "NPR",
    to_currency: "NPR",
    exchange_rate: 1,
    converted_amount: 5000,
    date: "2026-09-08",
    created_at: "2026-09-08T09:30:00Z",
    notes: "Top-up before rent",
    from_account: { id: "a3", name: "eSewa", currency: "NPR" },
    to_account: { id: "a1", name: "Nepal Investment Bank", currency: "NPR" },
  },
  {
    ...trBase,
    id: "t2",
    from_account_id: "a1",
    to_account_id: "a2",
    amount: 3000,
    from_currency: "NPR",
    to_currency: "NPR",
    exchange_rate: 1,
    converted_amount: 3000,
    date: "2026-09-05",
    created_at: "2026-09-05T18:12:00Z",
    from_account: { id: "a1", name: "Nepal Investment Bank", currency: "NPR" },
    to_account: { id: "a2", name: "Cash wallet", currency: "NPR" },
  },
  {
    ...trBase,
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
    from_account: { id: "a1", name: "Nepal Investment Bank", currency: "NPR" },
    to_account: { id: "a4", name: "Wise USD", currency: "USD" },
  },
] as unknown as TransferRow[];

const inject: AccountsInject = {
  accounts,
  balances: new Map([
    ["a1", 41250],
    ["a2", 2760],
    ["a3", 8200],
    ["a4", 420],
  ]),
  displayBalances: new Map([
    ["a1", 41250],
    ["a2", 2760],
    ["a3", 8200],
    ["a4", 55860],
  ]),
  displayTotal: 108070,
  cycleStats: new Map<string, AccountCycleStat>([
    ["a1", { count: 14, spent: 18300, earned: 95000 }],
    ["a2", { count: 9, spent: 4260, earned: 0 }],
    ["a3", { count: 5, spent: 2400, earned: 1500 }],
  ]),
  recentTransfers: transfers,
};

export default function PreviewAccountsPage() {
  return (
    <DashboardShell>
      <AccountsStatement inject={inject} />
    </DashboardShell>
  );
}
