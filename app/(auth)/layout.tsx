"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, PiggyBank, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { LangPills } from "@/components/auth/AuthPrimitives";
import { useLanguage } from "@/store/LanguageContext";
import { isSupabaseConfigured } from "@/utils/supabase/browser";

/**
 * Auth shell for /sign-in, /sign-up and /forgot-password.
 * Mobile-first: below lg a compact masthead + aurora ambience behind one
 * parchment card. From lg (laptop) up the whole experience lives in ONE
 * master card — brand statement half on the left, form half on the right.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="panel w-full max-w-md p-6 text-center">
          <p className="text-sm font-bold text-text">{t("authUnavailableTitle")}</p>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            {t("authUnavailableBody")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-dvh bg-background">
      {/* Aurora ambience behind the form column (phones: behind the card). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-blob aurora-primary -left-24 top-[-120px] h-[380px] w-[380px] opacity-30" />
        <div className="aurora-blob aurora-blob-alt aurora-brass bottom-[-140px] right-[-120px] h-[420px] w-[420px] opacity-25" />
        <div className="aurora-blob aurora-sky left-1/2 top-1/2 h-[320px] w-[320px] opacity-20" />
      </div>

      <div className="relative flex min-h-dvh w-full flex-col">
        {/* Mobile masthead */}
        <header className="flex items-center justify-between px-5 py-2 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <SpendFlowSeal size={24} />
            <span className="font-brand text-sm font-bold text-text">SpendFlow</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <LangPills />
            <ThemeToggle className="h-9 w-9" />
          </div>
        </header>

        {/* Laptop/desktop controls — top right of the viewport */}
        <div className="absolute right-5 top-6 z-10 hidden items-center gap-2 lg:flex xl:right-10">
          <LangPills />
          <ThemeToggle className="h-9 w-9" />
        </div>

        <main className="flex flex-1 items-center justify-center px-4 py-1.5 sm:px-8 sm:py-6">
          {/* Below lg: a plain centering wrapper. From lg: one master card
              (frame, accent bar and entrance handled by .sf-auth-master). */}
          <div className="sf-auth-master flex w-full max-w-[960px] justify-center lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-stretch">
            {/* ===== Brand half — laptop and up ===== */}
            <aside className="sf-auth-brand hidden flex-col justify-between p-8 lg:flex xl:p-10">
              <Link href="/" className="flex items-center gap-2.5">
                <SpendFlowSeal size={34} />
                <span className="font-brand text-lg font-bold text-text">SpendFlow</span>
              </Link>

              <div className="py-6">
                <h2 className="font-brand gradient-accent text-[28px] font-bold leading-[1.15] tracking-tight xl:text-[32px]">
                  {t("brandAuthHead")}
                </h2>
                <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-text-muted">
                  {t("brandAuthSub")}
                </p>
                <ul className="mt-6 divide-y divide-border border-y border-border">
                  <BrandFeature icon={<BarChart3 size={14} />} tone="primary">
                    {t("brandAuthF1")}
                  </BrandFeature>
                  <BrandFeature icon={<PiggyBank size={14} />} tone="brass">
                    {t("brandAuthF2")}
                  </BrandFeature>
                  <BrandFeature icon={<ShieldCheck size={14} />} tone="income">
                    {t("brandAuthF3")}
                  </BrandFeature>
                </ul>
              </div>

              <p className="stamp">{t("authFooterSynced")}</p>
            </aside>

            {/* ===== Form half — the page's own card (children) ===== */}
            <div className="flex w-full justify-center lg:items-center lg:p-8 xl:p-10">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const CHIP_TONES = {
  primary: { ink: "text-primary-strong", bg: "var(--sf-icon-chip)" },
  brass: { ink: "text-brass", bg: "var(--sf-brass-tint)" },
  income: { ink: "text-income", bg: "var(--sf-tint-success)" },
} as const;

function BrandFeature({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone: keyof typeof CHIP_TONES;
  children: ReactNode;
}) {
  const c = CHIP_TONES[tone];
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center ${c.ink}`}
        style={{ background: c.bg }}
      >
        {icon}
      </span>
      <span className="text-[13px] font-medium text-text">{children}</span>
    </li>
  );
}
