"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  Landmark,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { CashFlowSplineChart } from "@/components/dash/CashFlowSplineChart";

const CHART_POINTS = [
  { label: "May 18", income: 0, expense: 420 },
  { label: "May 19", income: 10, expense: 220 },
  { label: "May 20", income: 1220, expense: 760 },
  { label: "May 21", income: 40, expense: 380 },
  { label: "May 22", income: 10, expense: 210 },
  { label: "May 23", income: 2360, expense: 1100 },
  { label: "May 24", income: 80, expense: 60 },
];

const DEFAULT_CATEGORIES = [
  { name: "Housing", amount: "$1200", pct: 82, color: "#18181b" },
  { name: "Food & Dining", amount: "$450", pct: 36, color: "#64748b" },
  { name: "Transport", amount: "$280", pct: 22, color: "#94a3b8" },
  { name: "Entertainment", amount: "$120", pct: 12, color: "#cbd5e1" },
  { name: "Utilities", amount: "$95", pct: 8, color: "#e2e8f0" },
];

const DEFAULT_TRANSACTIONS = [
  {
    id: "tx-1",
    name: "Whole Foods Market",
    method: "Card Payment",
    date: "2024-05-24",
    category: "Groceries",
    status: "completed",
    amount: "-$142.50",
    isIncome: false,
  },
  {
    id: "tx-2",
    name: "Apple Store",
    method: "Card Payment",
    date: "2024-05-23",
    category: "Electronics",
    status: "completed",
    amount: "-$1,299.00",
    isIncome: false,
  },
  {
    id: "tx-3",
    name: "Freelance Payment",
    method: "Direct Deposit",
    date: "2024-05-23",
    category: "Income",
    status: "completed",
    amount: "+$2,500.00",
    isIncome: true,
  },
  {
    id: "tx-4",
    name: "Starbucks Coffee",
    method: "Card Payment",
    date: "2024-05-22",
    category: "Dining",
    status: "completed",
    amount: "-$12.40",
    isIncome: false,
  },
  {
    id: "tx-5",
    name: "Netflix Subscription",
    method: "Card Payment",
    date: "2024-05-21",
    category: "Entertainment",
    status: "pending",
    amount: "-$19.99",
    isIncome: false,
  },
];

export function DashScreen() {
  const [txSearch, setTxSearch] = useState("");

  const filteredTransactions = DEFAULT_TRANSACTIONS.filter(
    (tx) =>
      tx.name.toLowerCase().includes(txSearch.toLowerCase()) ||
      tx.category.toLowerCase().includes(txSearch.toLowerCase()) ||
      tx.date.includes(txSearch),
  );

  return (
    <AppShell>
      <div className="w-full max-w-[1340px] text-gray-900">
        {/* ===== Page Header ===== */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-gray-900">Financial Overview</h1>
            <p className="mt-1 text-xs text-gray-500">
              Welcome back, Alex. Here's what's happening with your money.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-xs font-medium text-gray-700 shadow-xs transition-colors hover:bg-gray-50"
            >
              <Calendar size={13} className="text-gray-500" />
              <span>Last 7 days</span>
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            <button
              type="button"
              aria-label="Export overview"
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-xs transition-colors hover:bg-gray-50"
            >
              <Download size={14} />
            </button>
            <Link
              href="/expense/new"
              className="flex h-9 items-center gap-2 rounded-lg bg-[#111827] px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-black"
            >
              <Plus size={14} />
              <span>Add Transaction</span>
            </Link>
          </div>
        </div>

        {/* ===== 4 Metric Cards ===== */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Balance */}
          <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <span>Total Balance</span>
              <span className="text-gray-400">
                <Wallet size={16} />
              </span>
            </div>
            <p className="numeric mt-3 text-[26px] font-bold tracking-tight text-gray-900">
              $12,845.50
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-emerald-600">↗ +2.5%</span>
              <span className="text-[11px] text-gray-400">vs last period</span>
            </div>
          </div>

          {/* Monthly Income */}
          <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <span>Monthly Income</span>
              <span className="text-gray-400">
                <Banknote size={16} />
              </span>
            </div>
            <p className="numeric mt-3 text-[26px] font-bold tracking-tight text-gray-900">
              $5,200.00
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-emerald-600">↗ +12.3%</span>
              <span className="text-[11px] text-gray-400">vs last period</span>
            </div>
          </div>

          {/* Monthly Expenses */}
          <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <span>Monthly Expenses</span>
              <span className="text-gray-400">
                <CreditCard size={16} />
              </span>
            </div>
            <p className="numeric mt-3 text-[26px] font-bold tracking-tight text-gray-900">
              $3,412.80
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-rose-600">↘ -4.2%</span>
              <span className="text-[11px] text-gray-400">vs last period</span>
            </div>
          </div>

          {/* Net Savings */}
          <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <span>Net Savings</span>
              <span className="text-gray-400">
                <TrendingUp size={16} />
              </span>
            </div>
            <p className="numeric mt-3 text-[26px] font-bold tracking-tight text-gray-900">
              $1,787.20
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-emerald-600">↗ +8.1%</span>
              <span className="text-[11px] text-gray-400">vs last period</span>
            </div>
          </div>
        </section>

        {/* ===== Middle Section: Cash Flow Trends + Spending by Category ===== */}
        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(310px,1fr)]">
          {/* Cash Flow Trends Card */}
          <div className="min-w-0 rounded-xl border border-[#eaecf0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <CashFlowSplineChart points={CHART_POINTS} />
          </div>

          {/* Spending by Category Card */}
          <div className="flex flex-col justify-between rounded-xl border border-[#eaecf0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Spending by Category</h2>
              <p className="mt-0.5 text-[11px] text-gray-400">Your biggest expenses this week</p>

              <div className="mt-6 space-y-4">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-800">{cat.name}</span>
                      <span className="font-semibold text-gray-900">{cat.amount}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/analytics"
              className="mt-6 flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-900 transition-colors hover:text-black"
            >
              <span>View All Insights</span>
              <ChevronRight size={13} />
            </Link>
          </div>
        </section>

        {/* ===== Bottom Section: Recent Transactions ===== */}
        <section className="-mx-5 mt-6 overflow-hidden rounded-none border-y border-[#eaecf0] bg-white px-5 py-5 lg:mx-0 lg:rounded-xl lg:border-x lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          {/* Mobile header */}
          <div className="mb-1 flex items-center justify-between pb-3 lg:hidden">
            <h2 className="text-[15px] font-bold text-gray-900">Recent Transactions</h2>
            <Link
              href="/history"
              className="text-[10px] font-bold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-900"
            >
              VIEW ALL
            </Link>
          </div>
          {/* Desktop header */}
          <div className="hidden flex-wrap items-center justify-between gap-3 pb-4 lg:flex">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Recent Transactions</h2>
              <p className="mt-0.5 text-[11px] text-gray-400">Review your latest financial activity</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-gray-400" />
                <input
                  type="text"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  placeholder="Filter transactions..."
                  className="h-8 w-52 rounded-lg border border-gray-200 bg-white pl-8 pr-2.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-xs transition-colors hover:bg-gray-50"
              >
                <SlidersHorizontal size={12} className="text-gray-500" />
                <span>Filter</span>
              </button>
            </div>
          </div>

          {/* Mobile: card rows */}
          <div className="divide-y divide-gray-50 lg:hidden">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-3.5">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    tx.isIncome ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {tx.isIncome ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-gray-900">{tx.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400">
                    {tx.date} · {tx.category}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`numeric text-[13px] font-bold ${tx.isIncome ? "text-blue-600" : "text-gray-900"}`}>
                    {tx.amount}
                  </span>
                  {tx.status === "completed" ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
                      completed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden />
                      pending
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {/* Mobile LOAD MORE */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 border-t border-gray-100 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-700 lg:hidden"
          >
            LOAD MORE
            <MoreHorizontal size={13} aria-hidden />
          </button>

          {/* Desktop: table */}
          <div className="hidden scroll-x overflow-x-auto lg:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <th className="py-3 pr-4 font-semibold">Entity / Merchant</th>
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 pl-4 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="cursor-pointer text-xs transition-colors hover:bg-gray-50/70"
                  >
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`grid h-8 w-8 place-items-center rounded-lg ${
                            tx.isIncome ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {tx.isIncome ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{tx.name}</p>
                          <p className="text-[10px] text-gray-400">{tx.method}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500">{tx.date}</td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {tx.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {tx.status === "completed" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                          completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          pending
                        </span>
                      )}
                    </td>
                    <td
                      className={`numeric py-3.5 pl-4 text-right font-bold ${
                        tx.isIncome ? "text-blue-600" : "text-gray-900"
                      }`}
                    >
                      {tx.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link
            href="/history"
            className="hidden border-t border-gray-100 py-3.5 text-center text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 lg:block"
          >
            View All Transactions &nbsp;›
          </Link>
        </section>

        {/* ===== Bottom Row: Linked Accounts + Budget Health ===== */}
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          {/* Linked Accounts */}
          <div className="p-0 lg:rounded-xl lg:border lg:border-[#eaecf0] lg:bg-white lg:p-5 lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900">Linked Accounts</h2>
              <Link
                href="/accounts"
                aria-label="Add account"
                className="grid h-7 w-7 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <Plus size={15} />
              </Link>
            </div>

            {/* Mobile: horizontal swipe cards */}
            <div className="-mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 lg:hidden">
              <div className="min-w-[175px] snap-start rounded-xl border border-[#eef0f2] bg-[#f7f8f9] p-4">
                <div
                  className="mb-3 grid h-10 w-10 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: "#2563eb" }}
                >
                  <CreditCard size={18} />
                </div>
                <p className="text-sm font-bold text-gray-900">Checking</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CHASE</p>
                <p className="mt-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">AVAILABLE BALANCE</p>
                <p className="numeric mt-1 text-lg font-bold text-gray-900">$8,420.00</p>
              </div>
              <div className="min-w-[175px] snap-start rounded-xl border border-[#eef0f2] bg-[#f7f8f9] p-4">
                <div
                  className="mb-3 grid h-10 w-10 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: "#374151" }}
                >
                  <CreditCard size={18} />
                </div>
                <p className="text-sm font-bold text-gray-900">Savings</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">ALLY</p>
                <p className="mt-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">AVAILABLE BALANCE</p>
                <p className="numeric mt-1 text-lg font-bold text-gray-900">$4,425.50</p>
              </div>
            </div>

            {/* Desktop: vertical list */}
            <div className="mt-4 hidden space-y-3 lg:block">
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-[#fbfcfc] p-3.5 transition-colors hover:border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200/60 bg-white text-gray-600 shadow-xs">
                    <Landmark size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Primary Checking</p>
                    <p className="text-[11px] text-gray-400">Chase Bank •••• 4291</p>
                  </div>
                </div>
                <span className="numeric text-sm font-bold text-gray-900">$8,420.00</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-[#fbfcfc] p-3.5 transition-colors hover:border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200/60 bg-white text-gray-600 shadow-xs">
                    <Landmark size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Savings Account</p>
                    <p className="text-[11px] text-gray-400">Ally Bank •••• 8832</p>
                  </div>
                </div>
                <span className="numeric text-sm font-bold text-gray-900">$4,425.50</span>
              </div>
            </div>

            <Link
              href="/accounts"
              className="mt-4 hidden h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 lg:flex"
            >
              <Plus size={14} className="text-gray-500" />
              <span>Link New Account</span>
            </Link>
          </div>

          {/* Budget Health */}
          <div className="p-0 lg:rounded-xl lg:border lg:border-[#eaecf0] lg:bg-white lg:p-5 lg:shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900">
                <span className="lg:hidden">Budget Health</span>
                <span className="hidden lg:inline">Recent Budgets</span>
              </h2>
            </div>
            <div className="mt-4 space-y-4">
              {/* Groceries */}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900">Groceries</span>
                  <span className="numeric text-[11px] font-medium text-gray-500">$480 / $600</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: "80%" }} />
                </div>
                <div className="mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">ON TRACK</span>
                </div>
              </div>

              {/* Travel */}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900">Travel</span>
                  <span className="numeric text-[11px] font-medium text-gray-500">$950 / $1000</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-red-500" style={{ width: "95%" }} />
                  </div>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 lg:hidden" aria-hidden />
                </div>
                <div className="mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">CRITICAL</span>
                </div>
              </div>

              {/* Dining Out - desktop only */}
              <div className="hidden lg:block">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900">Dining Out</span>
                  <span className="numeric text-[11px] font-medium text-gray-500">$120 / $300</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#18181b]" style={{ width: "40%" }} />
                </div>
                <div className="mt-1 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">ON TRACK</span>
                </div>
              </div>
            </div>

            {/* Mobile: VIEW ALL BUDGETS */}
            <Link
              href="/profit-loss"
              className="mt-4 block border-t border-gray-100 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-gray-900 transition-colors hover:text-gray-600 lg:hidden"
            >
              VIEW ALL BUDGETS
            </Link>
            {/* Desktop: Manage Budgets */}
            <Link
              href="/profit-loss"
              className="mt-4 hidden items-center justify-center gap-1 pt-2 text-[11px] font-semibold text-gray-900 transition-colors hover:text-black lg:flex"
            >
              <span>Manage Budgets</span>
              <ChevronRight size={13} />
            </Link>
          </div>
        </section>

        {/* Sync Footer - mobile only */}
        <footer className="mt-8 space-y-1 pb-4 text-center lg:hidden">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Last synced: Today at 09:42 AM.</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Data secured by SpendFlow Finance API.</p>
        </footer>
        {/* Sync Footer - desktop only */}
        <footer className="mt-8 hidden pb-4 text-center text-[11px] text-gray-400 lg:block">
          Last synced: Today at 09:42 AM. Data provided by SpendFlow Finance API.
        </footer>
      </div>
    </AppShell>
  );
}

export default DashScreen;
