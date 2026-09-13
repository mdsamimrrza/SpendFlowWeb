"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { useLanguage } from "@/store/LanguageContext";
import type { LanguageCode } from "@/utils/format";
import { ONBOARDING_COMPLETE_KEY, ONBOARDING_CURRENCY_KEY, WIZARD_COUNTRIES } from "@/constants/countries";
import { CURRENCY_DETAILS } from "@/constants/app";

/**
 * Single-page pre-login onboarding (mobile onboarding.tsx parity): language
 * pills, 12-country chips (flag + currency code only), Get Started stores the
 * device-level currency which is adopted at first login on this device.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);

  const onStart = () => {
    const country = WIZARD_COUNTRIES.find((c) => c.code === selected);
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
    if (country) {
      localStorage.setItem(ONBOARDING_CURRENCY_KEY, country.currency);
    }
    router.push("/sign-in");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="sf-ambient" aria-hidden />
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-end">
          <ThemeToggle />
        </div>

        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit">
            <SpendFlowSeal size={84} />
          </div>
          <h1 className="font-brand text-4xl font-bold tracking-tight text-text">SpendFlow</h1>
          <p className="mt-1.5 text-sm text-text-muted">See where your money flows</p>
        </header>

        <div className="sf-card mb-5 p-5">
          <p className="mb-2 text-[13px] font-bold text-text-muted">{t("language")}</p>
          <div className="flex gap-2">
            {(["en", "hi", "ne"] as LanguageCode[]).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`flex h-10 flex-1 items-center justify-center gap-1.5 border text-xs font-bold uppercase tracking-[0.08em] transition active:scale-[0.97] ${
                  language === l
                    ? "border-primary bg-primary-light text-primary-strong"
                    : "border-border bg-surface text-text-muted hover:text-text"
                }`}
              >
                {language === l && <Check size={14} />}
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 panel p-5">
          <p className="mb-2 text-[13px] font-bold text-text-muted">{t("currency")}</p>
          <div className="flex flex-wrap gap-2">
            {WIZARD_COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setSelected(c.code)}
                className={`flex h-10 items-center gap-1.5 border px-3.5 text-xs font-bold uppercase tracking-[0.06em] transition active:scale-[0.97] ${
                  selected === c.code
                    ? "border-primary bg-primary text-white shadow-sm shadow-primary/25"
                    : "border-border bg-surface text-text-muted hover:text-text"
                }`}
              >
                {selected === c.code && <Check size={14} />}
                <CurrencyFlag currency={c.currency} size={14} />
                {c.currency}
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full" onClick={onStart}>
          {t("getStarted")}
        </Button>

        <p className="mt-4 text-center text-[11px] text-faint">
          Cloud synced · English · हिन्दी · नेपाली
        </p>
      </div>
    </main>
  );
}
