"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  Coins,
  Download,
  Fingerprint,
  Globe2,
  HardDrive,
  Info,
  Landmark,
  Lock,
  PiggyBank,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Reveal } from "@/components/ui/Reveal";
import { PhoneShowcase, type PhoneScreen } from "@/components/landing/PhoneShowcase";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { useLanguage } from "@/store/LanguageContext";
import { formatMoney } from "@/utils/format";
import type { LanguageCode } from "@/utils/format";
import { CURRENCIES, CURRENCY_DETAILS, ANDROID_DOWNLOAD_URL } from "@/constants/app";

/**
 * Public landing page — 2026-09-15 redesign (reference: SpendFlowWebsite
 * static site), rebuilt on the app's own token system so light (parchment/
 * teal/brass) and dark (slate/indigo) both read as SpendFlow.
 *
 * Structure: aurora hero (badge → gradient headline → CTAs → release meta →
 * trust figures) → app showcase (CSS phone mockup + floating feature chips,
 * mobile-first: chips collapse to a grid under the phone) → features bento →
 * currency/trust strip → 3-step install → closing CTA → footer.
 *
 * Motion: one-shot scroll reveals (Reveal), chip bob, live clock — all
 * disabled under prefers-reduced-motion. The demo ledger cycles through all
 * 12 currencies (figures quantized per currency, verify-currency-sync parity).
 * Signed-in users never see it (middleware routes them to /overview).
 */

/** Demo ledger in NPR minor units — converted per cycled display currency. */
const DEMO_ROWS: { type: "expense" | "income"; amountNpr: number }[] = [
  { type: "income", amountNpr: 42000 },
  { type: "expense", amountNpr: 12750 },
  { type: "expense", amountNpr: 650 },
  { type: "expense", amountNpr: 320 },
  { type: "income", amountNpr: 8400 },
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

/** APK facts (measured from the production build, 2026-09-15). Version
 *  strings are deliberately NOT shown — the download always serves the latest
 *  release, so a printed version would go stale on every new build. */
const APK_SIZE = "~53 MB";

/** Hex tints are the app's own fixed accent hues — legible on both themes. */
const FEATURES: {
  icon: React.ReactNode;
  hex: string;
  title: string;
  body: string;
}[] = [
  {
    icon: <PiggyBank size={16} />,
    hex: "#10B981",
    title: "Cycle-aware budgets",
    body: "Budgets that follow your cycle, with alerts at 25/50/75/90/98/100%.",
  },
  {
    icon: <Globe2 size={16} />,
    hex: "#0EA5E9",
    title: "12-currency ledger",
    body: "Every amount keeps the exchange rate of the day it was logged.",
  },
  {
    icon: <Coins size={16} />,
    hex: "#F59E0B",
    title: "Live bullion benchmarks",
    body: "Official FENEGOSIDA & IBJA gold/silver fixings, verified daily.",
  },
  {
    icon: <Repeat size={16} />,
    hex: "#818CF8",
    title: "Recurring & transfers",
    body: "Rules that post on schedule; money moves across 7 account types.",
  },
  {
    icon: <BarChart3 size={16} />,
    hex: "#8B5CF6",
    title: "Analytical statements",
    body: "Health score, burn analysis and weekday rhythm, with formulas shown.",
  },
  {
    icon: <ShieldCheck size={16} />,
    hex: "#14B8A6",
    title: "Private by design",
    body: "Row Level Security, biometric lock, email-confirmed changes.",
  },
];

export default function LandingPage() {
  const { t, language, setLanguage } = useLanguage();
  const [currencyIdx, setCurrencyIdx] = useState(0); // NPR home
  const [clock, setClock] = useState("15:41");
  // Which app screen the phone mockup is currently showing (live tab bar).
  const [screen, setScreen] = useState<PhoneScreen>("home");

  // Rotate the demo through all 12 currencies every 2.6 s.
  useEffect(() => {
    const id = setInterval(() => setCurrencyIdx((i) => (i + 1) % CURRENCIES.length), 2600);
    return () => clearInterval(id);
  }, []);

  // Mockup status-bar clock.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 30_000);
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
  /** Format a raw NPR demo amount through the cycled currency. */
  const m = (npr: number) => fmt(q(npr));

  const downloadButton = (
    <a
      href={ANDROID_DOWNLOAD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-12 items-center justify-center gap-2.5 border border-primary bg-primary px-7 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong sm:h-11"
    >
      <Download size={16} /> {t("downloadAndroid")}
    </a>
  );

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      {/* ── Aurora ambience (hero region only) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[720px]">
        <div className="aurora-blob aurora-primary -left-24 top-[-120px] h-[380px] w-[380px] opacity-40" />
        <div className="aurora-blob aurora-blob-alt aurora-brass right-[-120px] top-[-60px] h-[420px] w-[420px] opacity-30" />
        <div className="aurora-blob aurora-sky aurora-blob-alt left-1/3 top-[240px] h-[320px] w-[320px] opacity-25" />
      </div>

      {/* ===== Masthead ===== */}
      <header className="glass sticky top-0 z-40 border-b border-border">
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
                  className={`h-9 border px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${
                    language === l
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-transparent text-text-muted"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <ThemeToggle className="h-9 w-9" />
            <a
              href={ANDROID_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1.5 border border-border px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-text transition-colors hover:border-primary hover:text-primary-strong md:flex"
            >
              <Download size={13} className="text-primary" /> {t("downloadAndroid")}
            </a>
            <Link
              href="/sign-in"
              className="flex h-9 items-center border border-primary bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
            >
              {t("signIn")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* ===== HERO (text-only; the single phone lives in Get-the-app) ===== */}
        <section className="flex flex-col items-center py-14 text-center lg:py-20">
          <div className="w-full max-w-2xl">
            <Reveal>
              <span className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                <span className="pulse-dot inline-flex h-2 w-2 rounded-full bg-income" />
                {t("freeBadge")}
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="font-brand mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-text sm:text-5xl lg:text-[3.4rem]">
                {t("landingHeroTitle")}{" "}
                <span className="gradient-accent">{t("landingHeroAccent")}</span>
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-text-muted">
                {t("landingHeroBody")}
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {downloadButton}
                <Link
                  href="/sign-up"
                  className="flex h-12 items-center justify-center gap-2 border border-border px-7 text-xs font-bold uppercase tracking-[0.08em] text-text transition-colors hover:border-text-muted sm:h-11"
                >
                  {t("landingCtaCreate")} <ArrowUpRight size={15} />
                </Link>
              </div>
            </Reveal>
            {/* Release meta strip */}
            <Reveal delay={260}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] font-semibold text-text-muted">
                <span className="flex items-center gap-1.5">
                  <HardDrive size={13} className="text-primary" /> <span className="numeric">{APK_SIZE}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-income" /> {t("zeroTrackers")}
                </span>
                <span className="flex items-center gap-1.5">
                  <Smartphone size={13} className="text-info" /> Android 8.0+
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe2 size={13} className="text-brass" /> {t("landingTrustCurrency")}
                </span>
              </div>
            </Reveal>
            {/* Trust figures */}
            <Reveal delay={320}>
              <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-px border border-border bg-border">
                {[
                  { n: "0%", d: t("figNoAds") },
                  { n: "12", d: t("figCurrencies") },
                  { n: "3", d: t("figLanguages") },
                ].map((x) => (
                  <div key={x.d} className="bg-surface px-4 py-3 text-center">
                    <div className="figures text-xl text-text">{x.n}</div>
                    <div className="caps-faint mt-0.5">{x.d}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== GET THE APP — showcase with floating chips ===== */}
        <section id="get-the-app" className="relative border-t border-border py-14 lg:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="aurora-blob aurora-primary right-[-140px] top-10 h-[360px] w-[360px] opacity-25" />
            <div className="aurora-blob aurora-blob-alt aurora-brass left-[-140px] bottom-0 h-[320px] w-[320px] opacity-20" />
          </div>
          <div className="relative grid items-center gap-12 lg:grid-cols-2 xl:grid-cols-[1fr_1.35fr]">
            <div className="order-2 lg:order-1">
              <Reveal>
                <p className="caps !text-primary-strong">{t("getTheApp")}</p>
                <h2 className="font-brand mt-3 text-3xl font-bold leading-tight text-text sm:text-4xl">
                  {t("appSectionTitle")}
                </h2>
                <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-text-muted">
                  {t("appSectionDesc")}
                </p>
              </Reveal>
              <ul className="mt-7 space-y-4">
                {[
                  { icon: <Bell size={16} className="text-hue-amber" />, label: t("chipMilestone") },
                  { icon: <RefreshCw size={16} className="text-info" />, label: t("chipRecurring") },
                  { icon: <Coins size={16} className="text-brass" />, label: t("chipBullion") },
                  { icon: <Fingerprint size={16} className="text-income" />, label: t("chipBiometric") },
                ].map((f, i) => (
                  <Reveal key={f.label} delay={i * 70}>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-surface">
                        {f.icon}
                      </span>
                      <span className="text-[14px] leading-relaxed text-text">{f.label}</span>
                    </li>
                  </Reveal>
                ))}
              </ul>
              <Reveal delay={220}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {downloadButton}
                  <a
                    href="#install"
                    className="flex h-12 items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:text-text sm:h-11"
                  >
                    <Info size={14} /> {t("howToInstall")}
                  </a>
                </div>
                <p className="stamp mt-4">{APK_SIZE} · Android 8.0+</p>
              </Reveal>
            </div>

            {/* Phone + floating chips (laptop & desktop) / chip grid (mobile) */}
            <div className="relative order-1 lg:order-2">
              <div aria-hidden className="phone-glow absolute inset-x-8 top-8 bottom-8" />
              <div className="relative mx-auto max-w-[340px]">
                <PhoneTilt>
                <PhoneShowcase
                  clock={clock}
                  currency={currency}
                  m={m}
                  screen={screen}
                  onScreen={setScreen}
                />
                </PhoneTilt>
              </div>
              {/* Reference layout: chips straddle the phone's edges. Only from
                  xl up, where the widened phone column leaves gutters big
                  enough that 185px chips sit beside the phone instead of over
                  its cards; pointer-events-none so any bezel overlap never
                  steals clicks from the tappable phone beneath. */}
              <div className="chip-bob pointer-events-none absolute left-0 top-[7%] hidden w-[185px] xl:block">
                <FeatureChip
                  icon={<Bell size={16} className="text-hue-amber" />}
                  sub={t("chipMilestoneS")}
                  main="🟡 50% Budget Mark"
                />
              </div>
              <div className="chip-bob-slow pointer-events-none absolute left-0 top-[40%] hidden w-[185px] xl:block">
                <FeatureChip
                  icon={<RefreshCw size={16} className="text-info" />}
                  sub={t("chipRecurringS")}
                  main="Netflix · Due Tomorrow"
                />
              </div>
              <div className="chip-bob-slow pointer-events-none absolute bottom-[27%] right-0 hidden w-[185px] xl:block">
                <FeatureChip
                  icon={<Coins size={16} className="text-brass" />}
                  sub={t("chipBullionS")}
                  main={<>Gold 24K: <span className="text-brass">₹7,250/g</span> <span className="text-income">▲ +0.8%</span></>}
                />
              </div>
              <div className="chip-bob pointer-events-none absolute bottom-[5%] right-0 hidden w-[185px] xl:block">
                <FeatureChip
                  icon={<Fingerprint size={16} className="text-income" />}
                  sub={t("chipBiometricS")}
                  main="Face ID / Fingerprint"
                />
              </div>
              {/* Below xl (incl. laptops): chips as a 2-up grid under the phone */}
              <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 xl:hidden">
                <FeatureChip icon={<Bell size={17} className="text-hue-amber" />} sub={t("chipMilestoneS")} main="🟡 50% Budget Mark Reached" />
                <FeatureChip icon={<RefreshCw size={17} className="text-info" />} sub={t("chipRecurringS")} main="Netflix · Due Tomorrow" />
                <FeatureChip icon={<Coins size={17} className="text-brass" />} sub={t("chipBullionS")} main={<>Fine Gold 24K: <span className="text-brass">₹7,250/g</span> <span className="text-income">▲ +0.8%</span></>} />
                <FeatureChip icon={<Fingerprint size={17} className="text-income" />} sub={t("chipBiometricS")} main="Face ID / Fingerprint" />
              </div>
            </div>
          </div>
        </section>

        {/* ===== What's inside (bento) ===== */}
        <section className="border-t border-border py-14 lg:py-16">
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[var(--sf-chip-tint)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary">
                <Sparkles size={11} /> {t("featuresKicker")}
              </span>
              <h2 className="font-brand mt-4 text-3xl font-bold tracking-tight text-text sm:text-4xl">
                {t("landingInsideTitle")}
              </h2>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:shadow-pop">
                  {/* hover aurora in the card's own hue */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
                    style={{ background: f.hex }}
                  />
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                    style={{ background: `${f.hex}1f`, border: `1px solid ${f.hex}33`, color: f.hex }}
                  >
                    {f.icon}
                  </span>
                  <h3 className="mt-3 text-[13.5px] font-extrabold tracking-tight text-text">{f.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ===== Currency & trust strip ===== */}
        <section className="border-t border-border py-14">
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <p className="caps !text-primary-strong">{t("currencyKicker")}</p>
              <h2 className="font-brand mt-2 text-2xl font-bold text-text sm:text-3xl">
                {t("landingCurrencyStrip")}
              </h2>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {CURRENCIES.map((c, i) => {
                const active = i === currencyIdx;
                return (
                  <span
                    key={c}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-extrabold transition-all duration-300 ${
                      active
                        ? "scale-105 border-primary bg-primary text-white shadow-pop"
                        : "border-border bg-surface text-text-muted"
                    }`}
                  >
                    <span className="text-[14px] leading-none">{CURRENCY_DETAILS[c]?.flag}</span>
                    {c}
                    <span className={`text-[10px] font-bold ${active ? "text-white/80" : "text-faint"}`}>
                      {CURRENCY_DETAILS[c]?.symbol}
                    </span>
                  </span>
                );
              })}
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
              <TrustCell icon={<Landmark size={14} />} label={t("landingTrustOneLedger")} />
              <TrustCell icon={<ShieldCheck size={14} />} label={t("landingTrustRls")} />
              <TrustCell
                icon={<Smartphone size={14} />}
                label={t("landingTrustMobile")}
                href={ANDROID_DOWNLOAD_URL}
              />
            </div>
          </Reveal>
        </section>

        {/* ===== Install — 3 steps ===== */}
        <section id="install" className="relative overflow-hidden border-t border-border py-14 lg:py-16">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="aurora-blob aurora-primary left-1/2 top-0 h-[300px] w-[520px] -translate-x-1/2 opacity-20" />
          </div>
          <Reveal>
            <div className="relative flex flex-col items-center text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[var(--sf-chip-tint)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary">
                <Download size={11} /> {t("installKicker")}
              </span>
              <h2 className="font-brand mt-4 text-3xl font-bold tracking-tight text-text sm:text-4xl">
                {t("installTitle")}
              </h2>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-text-muted">{t("installDesc")}</p>
            </div>
          </Reveal>
          <div className="relative mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "01",
                hex: "#818CF8",
                icon: <Download size={18} />,
                title: t("step1Title"),
                body: t("step1Body"),
                action: downloadButton,
              },
              {
                n: "02",
                hex: "#0EA5E9",
                icon: <ShieldCheck size={18} />,
                title: t("step2Title"),
                body: t("step2Body"),
              },
              {
                n: "03",
                hex: "#10B981",
                icon: <Check size={18} />,
                title: t("step3Title"),
                body: t("step3Body"),
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-6">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: `${s.hex}1f`, border: `1px solid ${s.hex}33`, color: s.hex }}
                  >
                    {s.icon}
                  </span>
                  <span className="stamp mt-4 block">Step {s.n}</span>
                  <h3 className="mt-1 text-[15px] font-extrabold text-text">{s.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{s.body}</p>
                  {s.action ? <div className="mt-4">{s.action}</div> : null}
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <p className="stamp mt-6 flex items-center justify-center gap-1.5">
              <Lock size={11} /> {t("installNote")}
            </p>
          </Reveal>
        </section>

        {/* ===== Closing CTA ===== */}
        <section className="border-t border-border py-14">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary-light via-surface to-brass-tint p-8 sm:p-12">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brass-tint opacity-60 blur-3xl"
              />
              <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="caps !text-primary-strong">{t("landingCtaStamp")}</p>
                  <h2 className="font-brand mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">
                    {t("landingCtaTitle")}
                  </h2>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                  <Link
                    href="/sign-up"
                    className="flex h-11 items-center justify-center gap-2 border border-primary bg-primary px-6 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
                  >
                    {t("getStarted")} <ArrowUpRight size={15} />
                  </Link>
                  <a
                    href={ANDROID_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center gap-2 border border-border bg-surface/70 px-6 text-xs font-bold uppercase tracking-[0.08em] text-text backdrop-blur transition-colors hover:border-primary hover:text-primary-strong"
                  >
                    <Download size={15} className="text-primary" /> {t("downloadAndroid")}
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <SpendFlowSeal size={30} />
                <span className="font-brand text-base font-bold text-text">SpendFlow</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-text-muted">{t("footerTagline")}</p>
              <p className="stamp mt-3">{t("landingFooterLangs")}</p>
            </div>
            <nav className="flex gap-14">
              <div>
                <span className="caps">SpendFlow</span>
                <ul className="mt-3 space-y-2 text-[13px] font-semibold">
                  <li><Link href="/sign-in" className="text-text-muted transition-colors hover:text-text">{t("signIn")}</Link></li>
                  <li><Link href="/sign-up" className="text-text-muted transition-colors hover:text-text">{t("getStarted")}</Link></li>
                  <li>
                    <a href={ANDROID_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="text-text-muted transition-colors hover:text-text">
                      {t("androidApp")}
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <span className="caps">App</span>
                <ul className="mt-3 space-y-2 text-[13px] font-semibold">
                  <li><a href="#get-the-app" className="text-text-muted transition-colors hover:text-text">{t("getTheApp")}</a></li>
                  <li><a href="#install" className="text-text-muted transition-colors hover:text-text">{t("howToInstall")}</a></li>
                  <li><a href={ANDROID_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="text-text-muted transition-colors hover:text-text">{t("downloadAndroid")}</a></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="end-rule mt-8 flex flex-wrap items-center justify-between gap-2 pt-5">
            <span className="stamp">© 2026 SpendFlow</span>
            <span className="stamp flex items-center gap-1.5"><Lock size={10} /> {t("zeroTrackers")} · {t("landingTrustRls")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Mouse-follow 3D tilt for the phone (reference-site parity: perspective
 * rotateX/rotateY + 1.02 scale, resets on leave). Desktop + hover devices
 * only; reduced-motion users get a static phone.
 */
function PhoneTilt({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const enabled = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        if (!enabled()) return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `perspective(1000px) rotateX(${(-y / 25).toFixed(2)}deg) rotateY(${(x / 25).toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
      }}
      onMouseLeave={() => {
        const el = ref.current;
        if (el) el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      }}
      style={{ transition: "transform 250ms ease-out", transformStyle: "preserve-3d" }}
    >
      {children}
    </div>
  );
}

/** Floating notification chip beside the phone (reference-site showcase).
 *  Wraps instead of truncating so nothing shows "…" on narrow columns. */
function FeatureChip({
  icon,
  sub,
  main,
}: {
  icon: React.ReactNode;
  sub: string;
  main: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2.5 border border-border bg-surface/95 px-3 py-2.5 shadow-pop backdrop-blur">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-surface-elevated">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="caps-faint block text-[9px] leading-snug">{sub}</span>
        <span className="block text-[11.5px] font-bold leading-snug text-text">{main}</span>
      </span>
    </div>
  );
}

/**
 * CSS-built replica of the app's dashboard (Budget tab) — mirrors the real
 * mobile UI: status bar, greeting + currency chip, tab pills, monthly-target
 * card with gradient progress, vault & cash-flow card, recent activity, and
 * the bottom nav with the center add button.
 */
function TrustCell({ icon, label, href }: { icon: React.ReactNode; label: string; href?: string }) {
  const inner = (
    <>
      <span className="text-brass">{icon}</span>
      <span className="text-xs font-bold text-text">{label}</span>
    </>
  );
  const base = "flex items-center gap-3 bg-surface px-5 py-4";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} hover:bg-primary-light`}>
      {inner}
    </a>
  ) : (
    <div className={base}>{inner}</div>
  );
}
