"use client";

/**
 * Faithful CSS/Tailwind recreation of the SpendFlow mobile app for the
 * landing page — built against the exact screen specs extracted from the
 * Expo codebase (constants/theme.ts tokens, app/(tabs)/*, ExpenseForm,
 * BudgetLimitHeroCard, BillsDueStrip, ExpenseItem, settings menu order,
 * bullion 2×2 grid, accounts rows).
 *
 * Tab bar is the real one: Home · History · Analytics · Recurring · Settings
 * (no center button — the + is a floating FAB over Home/Recurring, exactly
 * like the app). The quick-nav pills above it reach the app's modal routes
 * (Add expense, Bullion, Vault/Accounts) which don't live in the tab bar.
 * Every amount flows through the site's currency cycler (m()) so the phone
 * "switches currencies" with the page.
 */

import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  FileText,
  Gauge,
  Globe,
  History,
  Home,
  Landmark,
  List,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Upload,
  Wallet,
  Zap,
} from "lucide-react";
import { CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";

export type PhoneScreen =
  | "home"
  | "history"
  | "add"
  | "analytics"
  | "recurring"
  | "settings"
  | "bullion"
  | "vault";

interface ShowcaseProps {
  clock: string;
  currency: CurrencyCode | string;
  /** Format a raw NPR demo amount through the cycled currency. */
  m: (npr: number) => string;
  screen: PhoneScreen;
  onScreen: (s: PhoneScreen) => void;
}

/* ── shared micro-primitives (app's Card/Text language, scaled to 300px) ── */

function Cap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`block text-[8.5px] font-bold uppercase tracking-[0.09em] text-text-muted ${className}`}>
      {children}
    </span>
  );
}

function TxRow({
  emoji,
  tint,
  name,
  meta,
  chip,
  amount,
  income,
}: {
  emoji: string;
  tint: string;
  name: string;
  meta: string;
  chip?: string;
  amount: string;
  income?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-2.5 py-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[13px]"
        style={{ background: `${tint}18`, border: `1px solid ${tint}30` }}
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold text-text">{name}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[8px] text-faint">{meta}</span>
          {chip ? (
            <span className="rounded-full border border-border bg-surface-elevated px-1.5 text-[6.5px] font-extrabold uppercase tracking-[0.06em] text-text-muted">
              {chip}
            </span>
          ) : null}
        </span>
      </span>
      <span className={`numeric text-[11px] font-black ${income ? "text-income" : "text-text"}`}>{amount}</span>
    </div>
  );
}

function Tile({
  label,
  value,
  valueClass = "text-text",
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="flex-1 rounded-[10px] border border-border bg-surface-elevated px-1 py-1.5 text-center">
      <span className="block text-[6.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">{label}</span>
      <span className={`numeric block text-[9.5px] font-extrabold ${valueClass}`}>{value}</span>
      {sub ? <span className="block text-[6.5px] text-faint">{sub}</span> : null}
    </div>
  );
}

function IconTile({ emoji, tint, size = 30 }: { emoji: React.ReactNode; tint: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[10px]"
      style={{ width: size, height: size, background: `${tint}1f`, border: `1px solid ${tint}33` }}
    >
      {emoji}
    </span>
  );
}

/* ── the phone ── */

export function PhoneShowcase({ clock, currency, m, screen, onScreen }: ShowcaseProps) {
  const detail = CURRENCY_DETAILS[currency as CurrencyCode];
  const flag = detail?.flag ?? "🏳️";
  const sym = detail?.symbol ?? currency;
  const showFab = screen === "home" || screen === "recurring";

  return (
    <div className="relative mx-auto w-[300px] max-w-full select-none">
      {/* Light mode: a lighter "screen" than the parchment page so the phone
          reads as a device; dark keeps the near-black background (already
          contrasts the #151D2A cards). */}
      <div className="relative overflow-hidden rounded-[2.6rem] border-[6px] border-surface-elevated bg-[#F5F2E9] shadow-pop dark:bg-background">
        <span aria-hidden className="phone-glare pointer-events-none absolute inset-0 z-20" />

        {/* status bar */}
        <div className="flex items-center justify-between px-5 pb-0.5 pt-3.5">
          <span className="numeric text-[10px] font-bold text-text">{clock}</span>
          <span className="flex items-center gap-1 text-[9px] font-bold text-text-muted">
            <span className="inline-block h-2 w-3 rounded-[2px] border border-current" />
            <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-current" />
            <span className="inline-block h-2.5 w-3 rounded-[2px] border border-current" />
          </span>
        </div>

        {/* quick-nav pills (web affordance → app modal routes) */}
        <div className="flex gap-1 px-4 pt-1 text-[7.5px] font-bold">
          {(
            [
              ["home", "Budget"],
              ["analytics", "Analytics"],
              ["bullion", "Bullion"],
              ["vault", "Vault"],
            ] as [PhoneScreen, string][]
          ).map(([key, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => onScreen(key)}
              className={
                screen === key
                  ? "bg-primary px-1.5 py-0.5 text-white"
                  : "border border-border bg-surface px-1.5 py-0.5 text-text-muted hover:text-text"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div key={screen} className="sf-flip-in relative min-h-[452px] px-3 pb-2 pt-2">
          {screen === "home" && <HomeScreen m={m} flag={flag} sym={sym} />}
          {screen === "history" && <HistoryScreen m={m} />}
          {screen === "add" && <AddScreen m={m} sym={sym} currency={currency} />}
          {screen === "analytics" && <AnalyticsScreen m={m} />}
          {screen === "recurring" && <RecurringScreen m={m} />}
          {screen === "settings" && <SettingsScreen flag={flag} detail={detail?.label} />}
          {screen === "bullion" && <BullionScreen m={m} />}
          {screen === "vault" && <VaultScreen m={m} />}

          {showFab ? (
            <button
              type="button"
              aria-label="Add expense"
              onClick={() => onScreen("add")}
              className="absolute bottom-2.5 right-2.5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-pop transition-transform hover:scale-105"
            >
              <Plus size={20} strokeWidth={2.6} />
            </button>
          ) : null}
        </div>

        {/* real tab bar: Home · History · Analytics · Recurring · Settings */}
        <div className="flex items-stretch justify-around border-t border-border bg-surface pb-2.5 pt-1.5">
          {(
            [
              ["home", "Home", <Home key="i" size={13} />],
              ["history", "History", <List key="i" size={13} />],
              ["analytics", "Analytics", <BarChart3 key="i" size={13} />],
              ["recurring", "Recurring", <CalendarClock key="i" size={13} />],
              ["settings", "Settings", <Settings key="i" size={13} />],
            ] as [PhoneScreen, string, React.ReactNode][]
          ).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onScreen(key)}
              className={`flex flex-1 flex-col items-center gap-0.5 ${
                screen === key ? "text-primary" : "text-text-muted hover:text-text"
              }`}
            >
              {icon}
              <span className="text-[6.5px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── HOME — greeting bar, BudgetLimitHeroCard, BillsDueStrip, trend, recent ── */

function HomeScreen({ m, flag, sym }: { m: (n: number) => string; flag: string; sym: string }) {
  return (
    <div className="space-y-2">
      {/* app bar */}
      <div className="flex items-center justify-between px-1">
        <span>
          <Cap className="!text-[7.5px]">Good afternoon, Alex 👋</Cap>
          <span className="block text-[15px] font-extrabold tracking-tight text-text">SpendFlow {flag}</span>
        </span>
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-[9px] font-black text-text">
          AM
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-income" />
        </span>
      </div>

      {/* BudgetLimitHeroCard (front face) */}
      <div className="rounded-[16px] border-[1.5px] border-border bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-danger">
            <CreditCard size={10} />
            <span className="text-[7.5px] font-semibold uppercase tracking-[0.09em]">Total spent in Sep</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-danger/40 bg-rust-tint text-danger">
              <RefreshCw size={9} />
            </span>
            <span className="flex items-center gap-0.5 rounded-[6px] border border-border bg-surface-elevated px-1.5 py-0.5 text-[7px] font-semibold text-text-muted">
              <Settings size={7} /> Settings
            </span>
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="figures text-[17px] text-text">− {m(12750)}</span>
          <Eye size={12} className="text-text-muted" />
          <span className="ml-auto rounded-full bg-rust-tint px-1.5 py-0.5 text-[7px] font-extrabold text-danger">
            ▲ 6% vs last mon
          </span>
        </div>
        <span className="block text-[7px] text-faint">Wed 16 Sep • {flag} Nepalese Rupee</span>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[7.5px] font-bold text-warning">
            <Clock size={8} /> {m(37250)} remaining
          </span>
          <span className="text-[7px] text-text-muted">Target: {m(50000)} (26%)</span>
        </div>
        <div className="mt-1 h-[5px] w-full rounded-full bg-[var(--sf-track)]">
          <div className="h-full rounded-full bg-primary" style={{ width: "26%" }} />
        </div>
        <div className="mt-2 flex gap-1.5">
          <Tile label="Spent Today" value={m(650)} />
          <Tile label="Target Limit" value={m(50000)} />
          <Tile label="Budget Status" value="26% Used" valueClass="text-primary" />
        </div>
      </div>

      {/* BillsDueStrip */}
      <div className="rounded-[14px] border-[1.5px] border-danger/30 bg-surface p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[7.5px] font-black uppercase tracking-[0.08em] text-text">
            <AlertCircle size={9} className="text-danger" /> Bills due · 2
          </span>
          <span className="text-[7px] font-bold text-primary">View all ›</span>
        </div>
        <div className="mt-1.5 space-y-1.5">
          {[
            { e: "📶", n: "Netflix", s: "Overdue 1d · " + m(1659), due: true },
            { e: "🏠", n: "House Rent", s: "Due in 12d · " + m(25000), due: false },
          ].map((r) => (
            <div key={r.n} className="flex items-center gap-2 border-t border-border/60 pt-1.5 first:border-0 first:pt-0">
              <span className="text-[11px]">{r.e}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[8.5px] font-extrabold text-text">{r.n}</span>
                <span className={`block text-[7px] font-semibold ${r.due ? "text-danger" : "text-text-muted"}`}>{r.s}</span>
              </span>
              <span className="flex items-center gap-0.5 rounded-full bg-income px-1.5 py-0.5 text-[6.5px] font-black text-white">
                ✓ Mark Paid
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* StockTrendChart */}
      <div className="rounded-[14px] border border-border bg-surface p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 rounded-[7px] border border-border bg-surface-elevated px-1.5 py-0.5 text-[8px] font-extrabold text-text">
            <TrendingUp size={9} className="text-primary" /> Cash Flow <ChevronDown size={8} className="text-text-muted" />
          </span>
          <span className="flex items-center gap-0.5 rounded-full border border-border bg-surface-elevated px-1 py-0.5 text-[6.5px] font-bold text-text-muted">
            1D 7D <span className="rounded-full bg-primary px-1 text-white">1M</span> 6M 1Y
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[8.5px] font-extrabold">
          <span className="flex items-center gap-1 text-danger"><span className="h-1.5 w-1.5 rounded-full bg-danger" />−{m(12750)}</span>
          <span className="flex items-center gap-1 text-income"><span className="h-1.5 w-1.5 rounded-full bg-income" />+{m(42000)}</span>
          <span className="ml-auto flex items-center gap-0.5 rounded-full border border-income/30 bg-[var(--sf-tint-success)] px-1.5 py-0.5 text-[7px] font-black text-income">
            <Sparkles size={7} /> Net +{m(29250)}
          </span>
        </div>
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-1 h-12 w-full">
          <defs>
            <linearGradient id="sfTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sf-primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--sf-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,22 Q12,18 22,20 T44,12 T62,16 T80,7 T100,10 L100,30 L0,30 Z" fill="url(#sfTrend)" />
          <path d="M0,22 Q12,18 22,20 T44,12 T62,16 T80,7 T100,10" fill="none" stroke="var(--sf-primary)" strokeWidth="1.8" />
          <path d="M0,26 Q20,24 40,25 T70,23 T100,24" fill="none" stroke="var(--sf-income)" strokeWidth="1.2" strokeDasharray="2 2" />
        </svg>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-extrabold text-text">Recent Activity</span>
          <span className="text-[7px] font-bold text-primary">View all (42) ›</span>
        </div>
        <div className="mt-1 space-y-1.5">
          <TxRow emoji="🍔" tint="#F59E0B" name="Artisan Bistro" meta="Sep 14 · 9:30 PM" chip="UPI" amount={`− ${m(650)}`} />
          <TxRow emoji="🚕" tint="#06B6D4" name="City Express Ride" meta="Sep 14 · 6:05 PM" chip="Cash" amount={`− ${m(320)}`} />
          <TxRow emoji="💼" tint="#10B981" name="Consulting Income" meta="Sep 13 · 11:00 AM" amount={`+ ${m(8400)}`} income />
        </div>
      </div>
    </div>
  );
}

/* ── HISTORY — Vault & Flow card, toolbar, date groups, pagination ── */

function HistoryScreen({ m }: { m: (n: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 pt-1">
        <span>
          <Cap className="!text-[7.5px]">All Transactions</Cap>
          <span className="block text-[17px] font-extrabold tracking-tight text-text">History</span>
        </span>
        <span className="flex items-center gap-1 rounded-full border-[1.5px] border-primary bg-[var(--sf-chip-tint)] px-2 py-1 text-[7.5px] font-extrabold text-primary">
          <Download size={9} /> Export
        </span>
      </div>

      {/* Vault & Flow summary */}
      <div className="rounded-[14px] border-[1.5px] border-primary/35 bg-surface p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-[0.08em] text-primary">
            <Wallet size={9} /> Cash Flow · Sep
          </span>
          <span className="flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-1.5 py-0.5 text-[7px] font-extrabold text-text-muted">
            <Receipt size={8} className="text-primary" /> 42 entries
          </span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="figures text-[19px] text-danger">− {m(12750)}</span>
          <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-brass-tint px-1.5 py-0.5 text-[7px] font-bold text-text-muted">
            <Sparkles size={8} className="text-warning" /> Peak: <b className="text-warning">{m(4000)}</b>
          </span>
        </div>
        <div className="mt-1.5 flex h-6 items-center gap-0.5 rounded-[8px] border border-border bg-surface-elevated p-0.5 text-[7.5px] font-extrabold">
          <span className="flex-1 rounded-[6px] py-1 text-center text-text-muted">All Flow</span>
          <span className="flex-1 rounded-[6px] bg-danger py-1 text-center text-white">↓ Expenses</span>
          <span className="flex-1 rounded-[6px] py-1 text-center text-text-muted">↑ Income</span>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-1.5">
        <span className="flex h-7 flex-1 items-center gap-1.5 rounded-[8px] border border-border bg-surface-elevated px-2 text-[8px] text-faint">
          <Search size={9} /> Search...
        </span>
        <span className="relative flex h-7 w-7 items-center justify-center rounded-[8px] border-[1.5px] border-primary bg-[var(--sf-chip-tint)] text-primary">
          <Calendar size={11} />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] border-[1.5px] border-border bg-surface text-text-muted"><Tag size={11} /></span>
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] border-[1.5px] border-border bg-surface text-text-muted"><ArrowLeftRight size={11} /></span>
      </div>

      {/* groups */}
      {[
        {
          day: "Today · Sep 15",
          total: m(3820),
          rows: [
            { e: "🛒", t: "#8B5CF6", n: "Big Bazaar Grocery", meta: "6:40 PM", c: "Card", a: m(2850), inc: false },
            { e: "🍔", t: "#F59E0B", n: "Artisan Bistro", meta: "9:30 PM", c: "UPI", a: m(650), inc: false },
            { e: "🚕", t: "#06B6D4", n: "City Express Ride", meta: "7:12 AM", c: "Cash", a: m(320), inc: false },
          ],
        },
        {
          day: "Yesterday · Sep 14",
          total: m(8400),
          rows: [{ e: "💼", t: "#10B981", n: "Consulting Income", meta: "11:00 AM", c: "Bank", a: m(8400), inc: true }],
        },
      ].map((g) => (
        <div key={g.day}>
          <div className="flex items-center justify-between px-1">
            <span className="text-[7.5px] font-extrabold uppercase tracking-[0.08em] text-text-muted">{g.day}</span>
            <span className="numeric text-[8px] font-extrabold text-primary">{g.total}</span>
          </div>
          <div className="mt-1 space-y-1.5">
            {g.rows.map((r) => (
              <TxRow
                key={r.n}
                emoji={r.e}
                tint={r.t}
                name={r.n}
                meta={r.meta}
                chip={r.c}
                amount={`${r.inc ? "+ " : "− "}${r.a}`}
                income={r.inc}
              />
            ))}
          </div>
        </div>
      ))}

      {/* pagination */}
      <div className="rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-center">
        <span className="text-[8px] font-extrabold text-text">‹ Prev · Page 1 of 3 · Next ›</span>
        <span className="block text-[7px] text-faint">Showing 1–15 of 42</span>
      </div>
    </div>
  );
}

/* ── ADD EXPENSE — real ExpenseForm order (no fake keypad; system keyboard) ── */

function AddScreen({ m, sym, currency }: { m: (n: number) => string; sym: string; currency: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-elevated text-text"><ArrowLeft size={12} /></span>
        <span className="flex-1 text-center">
          <Cap className="!text-[6.5px]">Transaction Entry</Cap>
          <span className="block text-[11px] font-extrabold text-text">Add Expense</span>
        </span>
        <span className="w-7" />
      </div>

      {/* type toggle */}
      <div className="flex h-8 items-center gap-1 rounded-[10px] border border-border bg-surface-elevated p-1 text-[8.5px] font-extrabold">
        <span className="flex flex-1 items-center justify-center gap-1 rounded-[7px] bg-danger py-1.5 text-white">↓ Expense</span>
        <span className="flex flex-1 items-center justify-center gap-1 py-1.5 text-text-muted">↑ Income</span>
      </div>

      {/* hero amount */}
      <div className="rounded-[14px] border-2 border-primary bg-card-highlight p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-extrabold uppercase tracking-[0.08em] text-primary">Enter Expense Amount</span>
          <span className="flex items-center gap-0.5 rounded-full border-[1.5px] border-primary bg-primary-light px-1.5 py-0.5 text-[7.5px] font-extrabold text-text">
            {currency} <ChevronDown size={8} />
          </span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-1">
          <span className="text-[16px] font-black text-text">{sym}</span>
          <span className="figures text-[24px] text-text">1,250.00</span>
        </div>
        <div className="mt-1 flex justify-center gap-1 text-[7px] font-extrabold text-text-muted">
          {[100, 500, 1000, 5000].map((v) => (
            <span key={v} className="rounded-full border border-border bg-surface px-1.5 py-0.5">+{sym}{v.toLocaleString()}</span>
          ))}
        </div>
      </div>

      {/* category */}
      <div className="rounded-[12px] border border-border bg-surface p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[8.5px] font-extrabold text-text"><Tag size={9} className="text-primary" /> Select Category</span>
          <span className="rounded-[6px] border border-border bg-surface-elevated px-1.5 py-0.5 text-[6.5px] font-bold text-text-muted">✏️ Edit</span>
        </div>
        <div className="mt-1.5 flex justify-between">
          {[
            ["🍔", "Food", true],
            ["🚌", "Transit", false],
            ["🏠", "Home", false],
            ["⛽", "Fuel", false],
            ["🛒", "Groceries", false],
          ].map(([e, n, sel]) => (
            <span key={n as string} className="flex w-[52px] flex-col items-center gap-0.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] ${sel ? "border-2 border-primary bg-primary-light" : "border border-border bg-surface-elevated"}`}>{e}</span>
              <span className={`text-[6px] font-bold ${sel ? "text-primary" : "text-text-muted"}`}>{n}</span>
            </span>
          ))}
          <span className="flex w-[52px] flex-col items-center gap-0.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-primary text-[9px] font-black text-primary">▦</span>
            <span className="text-[6px] font-bold text-primary">All</span>
          </span>
        </div>
      </div>

      {/* bank account */}
      <div className="rounded-[12px] border border-border bg-surface p-2.5">
        <span className="flex items-center gap-1 text-[8.5px] font-extrabold text-text"><Wallet size={9} className="text-primary" /> Bank Account / Wallet</span>
        <div className="mt-1.5 flex gap-1.5 text-[7px] font-bold">
          <span className="rounded-full border-2 border-primary bg-primary-light px-2 py-1 text-primary">💵 Cash</span>
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-1 text-text-muted">🏦 Nabil</span>
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-1 text-text-muted">👛 eSewa</span>
          <span className="rounded-full border border-dashed border-primary px-2 py-1 text-primary">▦ All</span>
        </div>
      </div>

      {/* title + date */}
      <div className="rounded-[12px] border border-border bg-surface p-2.5">
        <span className="flex items-center gap-1 text-[8.5px] font-extrabold text-text"><FileText size={9} className="text-primary" /> Title / Note</span>
        <span className="mt-1 block rounded-[8px] border border-border bg-surface-elevated px-2 py-1.5 text-[7.5px] text-faint">e.g. Starbucks Cafe, Grocery Mart</span>
        <div className="mt-1.5 flex gap-1 text-[6.5px] font-bold text-text-muted">
          {["Lunch", "Coffee", "Groceries", "Fuel"].map((t) => <span key={t} className="rounded-full border border-border bg-surface-elevated px-1.5 py-0.5">{t}</span>)}
        </div>
      </div>

      <div className="flex gap-1.5">
        <span className="flex flex-1 items-center gap-1.5 rounded-[10px] border border-border bg-surface-elevated px-2 py-2 text-[8px] font-extrabold text-text">
          <Calendar size={10} className="text-primary" /> 2026-09-15
        </span>
        <span className="flex flex-1 items-center gap-1.5 rounded-[10px] border border-border bg-surface-elevated px-2 py-2 text-[8px] font-extrabold text-text">
          <Clock size={10} className="text-primary" /> 09:30 <span className="rounded bg-primary-light px-1 text-[6.5px] font-black text-primary">PM</span>
        </span>
      </div>

      {/* payment */}
      <div className="rounded-[12px] border border-border bg-surface p-2.5">
        <span className="flex items-center gap-1 text-[8.5px] font-extrabold text-text"><CreditCard size={9} className="text-primary" /> Payment Channel</span>
        <div className="mt-1.5 grid grid-cols-4 gap-1 text-center text-[6.5px] font-bold">
          {[["💵", "Cash", true], ["💳", "Card", false], ["📱", "UPI", false], ["🪙", "Other", false]].map(([e, n, sel]) => (
            <span key={n as string} className={`relative rounded-[8px] border-[1.5px] py-1.5 ${sel ? "border-primary bg-primary-light text-primary" : "border-border text-text-muted"}`}>
              <span className="block text-[11px]">{e}</span>{n}
              {sel ? <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[6px] text-white">✓</span> : null}
            </span>
          ))}
        </div>
      </div>

      {/* sticky save bar */}
      <div className="flex items-center justify-between rounded-[12px] border border-border bg-surface px-2.5 py-2 shadow-pop">
        <span>
          <Cap className="!text-[6px]">Total</Cap>
          <span className="numeric text-[12px] font-black text-primary">− {sym} 1,250</span>
        </span>
        <span className="rounded-[9px] bg-primary px-3.5 py-2 text-[8px] font-extrabold text-white">Save Expense</span>
      </div>
    </div>
  );
}

/* ── ANALYTICS — dual selectors, tri-flow, KPIs, health dial ── */

function AnalyticsScreen({ m }: { m: (n: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 pt-1">
        <span>
          <Cap className="!text-[7.5px]">Financial Intelligence</Cap>
          <span className="block text-[15px] font-extrabold tracking-tight text-text">Spending Analytics</span>
        </span>
        <Eye size={13} className="text-text-muted" />
      </div>

      <div className="flex gap-1.5 text-[7.5px] font-bold text-text">
        <span className="flex flex-1 items-center justify-between rounded-[9px] border border-border bg-surface-elevated px-2 py-1.5"><span className="flex items-center gap-1"><Calendar size={9} className="text-primary" /> Month</span><ChevronDown size={9} className="text-text-muted" /></span>
        <span className="flex flex-1 items-center justify-between rounded-[9px] border border-border bg-surface-elevated px-2 py-1.5"><span className="flex items-center gap-1"><BarChart3 size={9} className="text-primary" /> Overview</span><ChevronDown size={9} className="text-text-muted" /></span>
      </div>

      {/* tri-flow */}
      <div className="rounded-[14px] border-[1.2px] border-border bg-surface p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[9px] font-extrabold text-text"><IconTile emoji={<BarChart3 size={10} className="text-primary" />} tint="#818CF8" size={20} /> Income, Expense &amp; Budget</span>
          <span className="rounded-[6px] border border-income/30 bg-[var(--sf-tint-success)] px-1.5 py-0.5 text-[6.5px] font-black text-income">+70% Saved</span>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <span className="flex-1 rounded-[9px] border border-income/25 bg-[var(--sf-tile-income-bg)] p-1.5 text-center">
            <span className="block text-[6.5px] font-bold uppercase text-text-muted">Income (+)</span>
            <span className="numeric block text-[9.5px] font-extrabold text-income">{m(42000)}</span>
            <span className="block text-[6px] text-faint">5 entries</span>
          </span>
          <span className="flex-1 rounded-[9px] border border-danger/25 bg-[var(--sf-tile-expense-bg)] p-1.5 text-center">
            <span className="block text-[6.5px] font-bold uppercase text-text-muted">Expenses (−)</span>
            <span className="numeric block text-[9.5px] font-extrabold text-danger">{m(12750)}</span>
            <span className="block text-[6px] text-faint">18 transactions</span>
          </span>
          <span className="flex-1 rounded-[9px] border border-border bg-surface-elevated p-1.5 text-center">
            <span className="block text-[6.5px] font-bold uppercase text-text-muted">Budget Limit</span>
            <span className="numeric block text-[9.5px] font-extrabold text-text">{m(50000)}</span>
            <span className="block text-[6px] text-faint">26% used</span>
          </span>
        </div>
        <div className="mt-1.5 h-[5px] rounded-full bg-[var(--sf-track)]"><div className="h-full w-[26%] rounded-full bg-primary" /></div>
      </div>

      {/* KPI 2×2 */}
      <div className="grid grid-cols-2 gap-1.5">
        <span className="rounded-[10px] border-[1.5px] border-primary bg-card-highlight p-2">
          <Cap className="!text-[6px] !text-primary">Total Spent</Cap>
          <span className="numeric block text-[11px] font-extrabold text-text">{m(12750)}</span>
          <span className="block text-[6px] text-faint">18 expenses · 5 income</span>
        </span>
        <span className="rounded-[10px] border border-border bg-surface p-2">
          <Cap className="!text-[6px]">Daily Velocity</Cap>
          <span className="numeric block text-[11px] font-extrabold text-text"><Gauge size={9} className="mr-0.5 inline text-primary" />{m(425)}</span>
          <span className="block text-[6px] text-faint">burn rate / day</span>
        </span>
        <span className="rounded-[10px] border border-border bg-surface p-2">
          <Cap className="!text-[6px]">Peak Expense</Cap>
          <span className="numeric block text-[11px] font-extrabold text-text"><Zap size={9} className="mr-0.5 inline text-warning" />{m(2850)}</span>
          <span className="block text-[6px] text-faint">🛒 Big Bazaar Grocery</span>
        </span>
        <span className="rounded-[10px] border border-border bg-surface p-2">
          <Cap className="!text-[6px]">Average Ticket</Cap>
          <span className="numeric block text-[11px] font-extrabold text-text"><Sparkles size={9} className="mr-0.5 inline text-info" />{m(708)}</span>
          <span className="block text-[6px] text-faint">per transaction</span>
        </span>
      </div>

      {/* health dial */}
      <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-2.5">
        <span className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--sf-track)" strokeWidth="10" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--sf-income)" strokeWidth="10" strokeLinecap="round" strokeDasharray="188 63" />
          </svg>
          <span className="absolute text-center"><span className="block text-[13px] font-bold leading-none text-text">87</span><span className="block text-[5.5px] uppercase tracking-[0.1em] text-faint">Score</span></span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-info text-[9px] font-black text-white">A</span>
            <span className="text-[8.5px] font-bold text-text">Strong Financial Health</span>
          </span>
          <span className="mt-0.5 block text-[6.5px] text-faint">Calculated across 23 records</span>
          <span className="mt-1 inline-flex items-center gap-0.5 rounded-full border border-income/30 bg-[var(--sf-tint-success)] px-1.5 py-0.5 text-[6.5px] font-black text-income"><Sparkles size={7} /> Savings Rate: 70%</span>
        </span>
      </div>
    </div>
  );
}

/* ── RECURRING — hero total + rule rows with status pills ── */

function RecurringScreen({ m }: { m: (n: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 pt-1">
        <span>
          <Cap className="!text-[7.5px]">3 Active Subscriptions</Cap>
          <span className="block text-[19px] font-extrabold tracking-tight text-text">Recurring</span>
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-[9px] font-black text-text">AM</span>
      </div>

      <div className="relative rounded-[16px] border border-border bg-surface p-3.5 shadow-soft">
        <Eye size={13} className="absolute right-3 top-3 text-text-muted" />
        <span className="text-[7.5px] font-extrabold uppercase tracking-[0.1em] text-primary">Monthly Recurring</span>
        <div className="figures mt-0.5 text-[20px] text-text">{m(27659)}</div>
        <span className="text-[8px] text-text-muted">Across 3 active subscriptions</span>
      </div>

      <div className="divide-y divide-[var(--sf-border)] rounded-[16px] border border-border bg-surface">
        {[
          { e: "🏠", n: "House Rent", s: "Monthly · ✓ Paid Sep 1 · on time · next Oct 1", a: m(25000), st: "ACTIVE" },
          { e: "📶", n: "Wi-Fi Bill", s: "Monthly · next Sep 20", a: m(1000), st: "DUE" },
          { e: "🍿", n: "Netflix", s: "Monthly · ✓ Paid Sep 3 · on time · next Oct 3", a: m(1659), st: "ACTIVE" },
        ].map((r) => (
          <div key={r.n} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-[14px]">{r.e}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9.5px] font-bold text-text">{r.n}</span>
              <span className="block truncate text-[7px] text-text-muted">{r.s}</span>
            </span>
            <span className="text-right">
              <span className="numeric block text-[9.5px] font-extrabold text-text">{r.a}</span>
              {r.st === "DUE" ? (
                <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full border-[1.5px] border-danger/50 bg-[var(--sf-tint-danger)] px-1.5 py-px text-[6px] font-black text-danger"><AlertCircle size={6} /> DUE</span>
              ) : (
                <span className="mt-0.5 inline-block rounded-full border border-dashed border-primary px-1.5 py-px text-[6px] font-black tracking-[0.06em] text-primary">ACTIVE</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-[14px] border border-dashed border-border p-3 text-center">
        <span className="text-[14px]">🎯</span>
        <span className="block text-[8px] font-bold text-text">Quick Add Templates:</span>
        <div className="mt-1.5 flex justify-center gap-1 text-[7px] font-bold text-text-muted">
          {["🏠 House Rent", "📶 Wi-Fi Bill", "🍿 Netflix"].map((t) => (
            <span key={t} className="rounded-[8px] border border-border bg-surface-elevated px-1.5 py-1">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── SETTINGS — profile card + the real 10-row menu, exact tints ── */

function SettingsScreen({ flag, detail }: { flag: string; detail?: string }) {
  const rows: { icon: React.ReactNode; tint: string; label: string; right?: React.ReactNode }[] = [
    { icon: <DollarSign size={12} className="text-primary" />, tint: "#0F5C4D", label: "Currency", right: <span className="text-[7px] font-bold text-text-muted">{flag} {detail ?? "Nepalese Rupee"}</span> },
    { icon: <TrendingUp size={12} className="text-primary" />, tint: "#0F5C4D", label: "Budget & Reports" },
    { icon: <Tag size={12} className="text-income" />, tint: "#10B981", label: "Categories & Budgets", right: <span className="text-[7px] font-bold text-text-muted">18</span> },
    { icon: <Landmark size={12} className="text-[#3B82F6]" />, tint: "#3B82F6", label: "Bank Accounts & Wallets" },
    { icon: <Coins size={12} className="text-warning" />, tint: "#F59E0B", label: "Gold & Silver Rates", right: <span className="flex items-center gap-1 rounded-full bg-[var(--sf-tint-success)] px-1.5 py-0.5 text-[6.5px] font-black text-income"><span className="h-1 w-1 rounded-full bg-income" />Live</span> },
    { icon: <List size={12} className="text-[#94A3B8]" />, tint: "#94A3B8", label: "Bin", right: <span className="text-[7px] font-bold text-text-muted">60-day</span> },
    { icon: <Bell size={12} className="text-primary" />, tint: "#0F5C4D", label: "Notifications", right: <span className="text-[7px] font-bold text-primary">Active</span> },
    { icon: <Globe size={12} className="text-primary" />, tint: "#0F5C4D", label: "Language", right: <span className="text-[7px] font-bold text-text-muted">🇺 English</span> },
    { icon: <Upload size={12} className="text-primary" />, tint: "#0F5C4D", label: "Export data", right: <span className="text-[7px] font-bold text-text-muted">CSV / PDF</span> },
  ];
  return (
    <div className="space-y-2">
      <div className="px-1 pt-1">
        <Cap className="!text-[7.5px]">Preferences & Limits</Cap>
        <span className="block text-[17px] font-extrabold tracking-tight text-text">Settings</span>
      </div>

      <div className="flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-primary bg-surface p-2.5">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-[11px] font-black text-text">
          AM
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-income" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-extrabold text-text">Alex Morgan</span>
          <span className="block truncate text-[7.5px] text-text-muted">alex@spendflow.app</span>
          <span className="mt-0.5 flex items-center gap-0.5 text-[6.5px] font-bold text-income"><ShieldCheck size={8} /> Verified Cloud Account</span>
        </span>
        <span className="rounded-full border border-border bg-surface-elevated px-2 py-1 text-[7px] font-bold text-text-muted">Edit</span>
      </div>

      <div className="divide-y divide-[var(--sf-border)]/60 rounded-[14px] border border-border bg-surface">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 px-3 py-[7px]">
            <IconTile emoji={r.icon} tint={r.tint} size={24} />
            <span className="flex-1 text-[8.5px] font-semibold text-text">{r.label}</span>
            {r.right}
            <ChevronRight size={10} className="text-faint" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-danger/35 bg-[var(--sf-tint-danger)] py-2 text-[9px] font-bold text-danger">
        Sign out
      </div>
    </div>
  );
}

/* ── BULLION — market switcher, 2×2 benchmark grid, trend, calculator ── */

function BullionScreen({ m }: { m: (n: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text"><ArrowLeft size={12} /></span>
        <span className="flex-1 text-[12px] font-extrabold text-text">Gold/Silver Price</span>
        <Eye size={12} className="text-text-muted" />
      </div>

      <div className="flex rounded-[9px] border border-border bg-surface p-0.5 text-[7.5px] font-extrabold">
        <span className="flex-1 rounded-[7px] bg-primary py-1 text-center text-white">🇳🇵 Nepal (NPR)</span>
        <span className="flex-1 py-1 text-center text-text-muted">🇮🇳 India (INR)</span>
      </div>
      <div className="flex justify-center"><span className="flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[6.5px] font-semibold text-text-muted"><Clock size={8} /> FENEGOSIDA Fix · 10:30 AM NPT</span></div>

      <div className="grid grid-cols-2 gap-1.5">
        {[
          { e: "🪙", l: "Hallmark Gold", v: m(107540), u: "/ 1 Tola", ch: "+0.82%", sel: true },
          { e: "🥈", l: "Silver", v: m(4765), u: "/ 1 Tola", ch: "+0.84%" },
          { e: "🪙", l: "Hallmark Gold", v: m(92200), u: "/ 10 Gram", ch: "+0.82%" },
          { e: "🥈", l: "Silver", v: m(4085), u: "/ 10 Gram", ch: "+0.84%" },
        ].map((c, i) => (
          <span key={i} className={`rounded-[11px] border-2 p-2 ${c.sel ? "border-warning/60 bg-brass-tint" : "border-border bg-surface"}`}>
            <span className="flex items-center gap-1 text-[7.5px] font-extrabold uppercase tracking-[0.06em] text-text"><span className="text-[10px]">{c.e}</span> {c.l}</span>
            <span className="numeric mt-0.5 block text-[10px] font-black text-text">{c.v} <span className="text-[6px] font-semibold text-text-muted">{c.u}</span></span>
            <span className="text-[6.5px] font-bold text-income">{c.ch}</span>
          </span>
        ))}
      </div>

      <div className="rounded-[12px] border border-border bg-surface p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-black uppercase tracking-[0.05em] text-warning">Hallmark Gold / 1 Tola</span>
          <span className="flex items-center gap-0.5 rounded-full border border-border bg-surface-elevated px-1 py-0.5 text-[6px] font-bold text-text-muted">
            <span className="rounded-full bg-warning px-1 text-white">1M</span> 3M 6M 1Y
          </span>
        </div>
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="mt-1 h-10 w-full">
          <defs>
            <linearGradient id="sfGold2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sf-brass)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--sf-brass)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,20 Q15,18 25,12 T50,14 T75,8 T100,5 L100,26 L0,26 Z" fill="url(#sfGold2)" />
          <path d="M0,20 Q15,18 25,12 T50,14 T75,8 T100,5" fill="none" stroke="var(--sf-brass)" strokeWidth="1.8" />
        </svg>
        <div className="mt-1 flex gap-1.5">
          <span className="flex-1 rounded-[7px] border border-border bg-surface-elevated px-1.5 py-1"><span className="block text-[6px] text-text-muted">Period Low</span><span className="numeric text-[8px] font-extrabold text-text">{m(98400)}</span></span>
          <span className="flex-1 rounded-[7px] border border-border bg-surface-elevated px-1.5 py-1"><span className="block text-[6px] text-text-muted">Period High</span><span className="numeric text-[8px] font-extrabold text-warning">{m(112800)}</span></span>
        </div>
      </div>

      <div className="rounded-[12px] border border-border bg-surface p-2.5">
        <span className="flex items-center gap-1 text-[8.5px] font-extrabold text-text"><Gauge size={10} className="text-primary" /> Instant Metal Valuation</span>
        <div className="mt-1.5 flex gap-1 text-[6.5px] font-bold">
          <span className="rounded-[7px] bg-primary px-2 py-1 text-white">🥇 Gold 24K</span>
          <span className="rounded-[7px] border border-border bg-surface-elevated px-2 py-1 text-text-muted">👑 Gold 22K</span>
          <span className="rounded-[7px] border border-border bg-surface-elevated px-2 py-1 text-text-muted">🥈 Silver 999</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between rounded-[9px] border-[1.5px] border-primary bg-background px-2 py-1.5 text-[8px] font-extrabold text-text">
          <span className="flex items-center gap-1"><Target size={10} className="text-primary" /> 15.5 Grams</span>
          <span className="text-faint">= 1.329 tola</span>
        </div>
        <div className="mt-1.5 rounded-[9px] border border-border bg-card-highlight px-2 py-1.5">
          <span className="block text-[6.5px] text-text-muted">Estimated Total Cash Value (15.5g)</span>
          <span className="numeric text-[13px] font-black text-primary">{m(143600)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── VAULT / ACCOUNTS — total balance, quick actions, real row anatomy ── */

function VaultScreen({ m }: { m: (n: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="px-1 pt-1 text-center">
        <span className="block text-[11px] font-extrabold text-text">Accounts &amp; Wallets</span>
        <Cap className="!text-[6.5px]">5 active accounts</Cap>
      </div>

      <div className="rounded-[13px] border-[1.5px] border-income/30 bg-surface p-2.5">
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-[0.09em] text-primary"><Wallet size={9} /> Total Liquid Balance</span>
          <Eye size={11} className="text-text-muted" />
        </span>
        <span className="figures mt-0.5 block text-[16px] text-text">{m(236400)}</span>
        <span className="block text-[6.5px] text-text-muted">Across all connected banks, digital wallets, and cash reserves.</span>
      </div>

      <div className="flex gap-1.5">
        {[["＋", "Add Account"], ["⇄", "New Transfer"], ["🕘", "History"]].map(([e, l]) => (
          <span key={l} className="flex flex-1 flex-col items-center gap-0.5 rounded-[11px] border border-border bg-surface py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-primary-light text-[10px] font-black text-primary">{e}</span>
            <span className="text-[6.5px] font-extrabold text-text">{l}</span>
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        {[
          { e: "🏦", t: "#0F5C4D", n: "Nabil Bank", ty: "Bank · •••• 4821", a: m(156400), def: true },
          { e: "💵", t: "#10B981", n: "Cash Wallet", ty: "Cash Wallet", a: m(12500) },
          { e: "👛", t: "#8B5CF6", n: "eSewa", ty: "UPI App · wallet", a: m(3450) },
          { e: "💳", t: "#F59E0B", n: "NIC Asia Card", ty: "Credit Card · •••• 9034", a: `−${m(8400)}`, neg: true },
          { e: "🏦", t: "#06B6D4", n: "Savings FD", ty: "Savings · •••• 2210", a: m(72500) },
        ].map((a) => (
          <div key={a.n} className={`flex items-center gap-2.5 rounded-[13px] border bg-surface px-2.5 py-2 ${a.def ? "border-primary/60" : "border-border"}`}>
            <IconTile emoji={<span className="text-[13px]">{a.e}</span>} tint={a.t} size={32} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[9px] font-extrabold text-text">
                🇳🇵 {a.n}
                {a.def ? <span className="rounded bg-primary-light px-1 text-[5.5px] font-black text-primary">⭐ DEFAULT</span> : null}
              </span>
              <span className="text-[7px]" style={{ color: a.t }}>{a.ty}</span>
            </span>
            <span className={`numeric text-[10.5px] font-black ${a.neg ? "text-danger" : "text-income"}`}>{a.a}</span>
            <ChevronRight size={10} className="text-faint" />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-[11px] border border-border bg-surface px-2.5 py-2">
        <IconTile emoji={<ArrowLeftRight size={11} className="text-primary" />} tint="#0F5C4D" size={22} />
        <span className="min-w-0 flex-1">
          <span className="block text-[8px] font-extrabold text-text">🇳🇵 Nabil Bank → eSewa</span>
          <span className="block text-[6.5px] text-text-muted">{m(5000)} · rate 1.0000 · 15 Sep</span>
        </span>
        <span className="text-[7px] font-bold text-primary">Recent transfer</span>
      </div>
    </div>
  );
}
