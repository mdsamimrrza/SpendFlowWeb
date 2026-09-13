"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Coins,
  Globe2,
  Landmark,
  Lock,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { CashFlowHero } from "@/components/dashboard/CashFlowHero";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { useLanguage } from "@/store/LanguageContext";
import { formatMoney } from "@/utils/format";
import type { LanguageCode } from "@/utils/format";
import { CURRENCIES } from "@/constants/app";

/**
 * Public landing page (ledger aesthetic): brand masthead → live SF-01
 * statement hero → what's-inside rules → currency/trust strip → CTA rule.
 * Signed-in users never see it (middleware routes them to /overview).
 * All figures in the demo statement are quantized to the cycled currency's
 * minor units so every line reconciles (see scripts/verify-currency-sync.mjs).
 */

/** Demo ledger in NPR minor units — converted per cycled display currency. */
const DEMO_ROWS: { type: "expense" | "income"; amountNpr: number }[] = [
  { type: "income", amountNpr: 65000 },
  { type: "expense", amountNpr: 18400 },
  { type: "expense", amountNpr: 15000 },
  { type: "expense", amountNpr: 6200 },
  { type: "expense", amountNpr: 4800 },
  { type: "expense", amountNpr: 3500 },
];

/** USD-per-unit pegs for the demo conversion (services/exchange.ts parity). */
const DEMO_USD_PER_UNIT: Record<string, number> = {
  NPR: 1 / 133.76,
  INR: 1 / 94.84,
  USD: 1,
  QAR: 1 / 3.64,
  GBP: 0.738,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
  MYR: 1 / 4.06,
  KRW: 1 / 1341.0,
  JPY: 1 / 153.8,
  AUD: 1 / 1.386,
  CAD: 1 / 1.378,
};

const FEATURES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <PiggyBank size={16} />,
    title: "Cycle-aware budgets",
    body: "Custom start/end days, pace projection and milestone alerts — your budget follows your cycle, not the calendar.",
  },
  {
    icon: <Globe2 size={16} />,
    title: "12-currency ledger",
    body: "Every amount keeps the exchange rate from the day you logged it, so your history stays exact in every currency.",
  },
  {
    icon: <Repeat size={16} />,
    title: "Recurring & transfers",
    body: "Set a rule once and entries appear on schedule, move money between accounts, and look back on everything you've done.",
  },
  {
    icon: <BarChart3 size={16} />,
    title: "Analytical statements",
    body: "Burn analysis, health score, weekday rhythm and payment-method mix — every figure with its formula on the sheet.",
  },
  {
    icon: <ShieldCheck size={16} />,
    title: "Private by design",
    body: "Your records are visible only to you, and sensitive changes are confirmed with a code sent to your email.",
  },
  {
    icon: <Smartphone size={16} />,
    title: "One account, everywhere",
    body: "Sign in on the web or the SpendFlow mobile app — your ledger is always up to date on both.",
  },
];

export default function LandingPage() {
  const { t, language, setLanguage } = useLanguage();
  const [currencyIdx, setCurrencyIdx] = useState(4); // AED — matches the user's statement
  const [tick, setTick] = useState(0);

  // Rotate the demo statement through all 12 currencies every 2.4 s.
  useEffect(() => {
    const id = setInterval(() => {
      setCurrencyIdx((i) => (i + 1) % CURRENCIES.length);
      setTick((n) => n + 1);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const currency = CURRENCIES[currencyIdx];
  const fmt = (n: number) => formatMoney(n, currency, "en-US");

  // Quantized demo aggregates (quantizeMoney semantics: round half away from zero).
  const rate = DEMO_USD_PER_UNIT[currency];
  const factor = currency === "KRW" || currency === "JPY" ? 1 : 100;
  const q = (npr: number) => {
    const raw = (npr * DEMO_USD_PER_UNIT.NPR) / rate;
    return Math.round(raw * factor) / factor;
  };
  const inflow = q(DEMO_ROWS.find((r) => r.type === "income")!.amountNpr);
  const outflow = DEMO_ROWS.filter((r) => r.type === "expense").reduce(
    (s, r) => s + q(r.amountNpr),
    0,
  );
  const net = inflow - outflow;
  const budget = q(50000);
  const pace = {
    daysTotal: 30,
    daysElapsed: 14,
    spentPct: outflow / budget,
    expectedPct: 14 / 30,
    projected: Math.round((outflow / 14) * 30 * factor) / factor,
    onPace: (outflow / 14) * 30 <= budget,
  };

  const cycleLabel = "Aug 31 – Sep 29";

  return (
    <div className="min-h-screen bg-background">
      {/* ===== Masthead ===== */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <SpendFlowSeal size={34} />
            <span className="font-brand text-lg font-bold text-text">SpendFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 sm:flex">
              {(["en", "hi", "ne"] as LanguageCode[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`h-8 border px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${
                    language === l
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-transparent text-text-muted"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="flex h-9 items-center border border-primary bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
            >
              {t("signIn")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* ===== Hero ===== */}
        <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:py-16">
          <div>
            <p className="caps !text-primary-strong">Form SF-01 · Personal ledger</p>
            <h1 className="font-brand mt-3 text-4xl font-bold leading-[1.12] text-text sm:text-5xl">
              {t("landingHeroTitle")}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-text-muted">
              {t("landingHeroBody")}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in?mode=signUp"
                className="flex h-11 items-center gap-2 border border-primary bg-primary px-6 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
              >
                {t("landingCtaCreate")} <ArrowUpRight size={15} />
              </Link>
              <Link
                href="/sign-in"
                className="flex h-11 items-center border border-border px-6 text-xs font-bold uppercase tracking-[0.08em] text-text transition-colors hover:border-text-muted"
              >
                {t("landingCtaSignIn")}
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-text-muted">
              <li className="flex items-center gap-1.5">
                <Lock size={13} className="text-primary" /> {t("landingTrustRls")}
              </li>
              <li className="flex items-center gap-1.5">
                <Coins size={13} className="text-primary" /> {t("landingTrustCurrency")}
              </li>
              <li className="flex items-center gap-1.5">
                <Smartphone size={13} className="text-primary" /> {t("landingTrustMobile")}
              </li>
            </ul>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-10 h-48 w-48 bg-brass-tint blur-2xl"
            />
            <CashFlowHero
              net={net}
              income={inflow}
              expense={outflow}
              todayTotal={0}
              budget={budget}
              pace={pace}
              formatted={fmt}
              cycleLabel={cycleLabel}
              todayLabel={t("today")}
              entries={DEMO_ROWS.length}
              statementNo="2026-08"
              compact
            />
            <p className="stamp mt-3 text-right">
              <span className="numeric">{fmt(0).replace(/[\d.,]/g, "")}</span>
              Live demo · cycling {CURRENCIES.length} currencies · {currency}
            </p>
          </div>
        </section>

        {/* ===== What's inside ===== */}
        <section className="border-t border-border py-12">
          <div className="flex items-baseline gap-4">
            <h2 className="font-brand text-2xl font-bold text-text">
              {t("landingInsideTitle")}
            </h2>
            <span className="rule-after" aria-hidden />
            <span className="caps-faint hidden sm:block">Form SF-01 · All pages</span>
          </div>
          <div className="mt-7 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-surface p-6">
                <span className="flex h-8 w-8 items-center justify-center border border-brass text-brass">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-sm font-bold text-text">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Currency & trust strip ===== */}
        <section className="border-t border-border py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="caps">{t("landingCurrencyStrip")}</p>
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {CURRENCIES.map((c, i) => (
                <span
                  key={c}
                  className={`border px-2 py-1 text-[11px] font-bold tracking-wide transition ${
                    i === currencyIdx
                      ? "border-primary bg-primary text-white"
                      : "border-border text-text-muted"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-px border-t border-border bg-border sm:grid-cols-3">
            <TrustCell icon={<Landmark size={14} />} label={t("landingTrustOneLedger")} />
            <TrustCell icon={<ShieldCheck size={14} />} label={t("landingTrustRls")} />
            <TrustCell icon={<Smartphone size={14} />} label={t("landingTrustMobile")} />
          </div>
        </section>

        {/* ===== Closing CTA ===== */}
        <section className="border-t border-border py-12">
          <div className="panel flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <p className="caps !text-primary-strong">{t("landingCtaStamp")}</p>
              <h2 className="font-brand mt-2 text-2xl font-bold text-text sm:text-3xl">
                {t("landingCtaTitle")}
              </h2>
            </div>
            <Link
              href="/sign-in?mode=signUp"
              className="flex h-11 shrink-0 items-center gap-2 border border-primary bg-primary px-6 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
            >
              {t("getStarted")} <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      </main>

      {/* ===== End-of-statement footer ===== */}
      <footer className="border-t border-border bg-surface">
        <div className="end-rule mx-auto max-w-[1200px] px-5 py-6 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <SpendFlowSeal size={22} />
              <span className="text-xs font-bold text-text">{t("spendFlow")}</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/sign-in" className="stamp hover:!text-text">
                {t("signIn")}
              </Link>
              <span className="stamp">{t("landingFooterLangs")}</span>
            </div>
          </div>
          <p className="stamp mt-3">{t("landingFooterStamp")}</p>
        </div>
      </footer>

      {/* tick re-renders fmt closures keyed by currency rotation */}
      <span aria-hidden className="hidden">{tick}</span>
    </div>
  );
}

function TrustCell({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 bg-surface px-5 py-4">
      <span className="text-brass">{icon}</span>
      <span className="text-xs font-bold text-text">{label}</span>
    </div>
  );
}
