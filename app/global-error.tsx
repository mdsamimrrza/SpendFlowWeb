"use client";

import { useEffect, useState } from "react";
import "./globals.css";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/layout/StatusPage";
import { en, hi, ne, type TranslationKey } from "@/constants/i18n/dictionaries";

/**
 * Last-resort boundary for errors in the ROOT layout itself — renders its own
 * <html>/<body>, so Providers (LanguageContext, ThemeToggle…) are unavailable.
 * Reads the persisted language directly from localStorage (en fallback) and
 * composes the same StatusPage shell with plain dictionary lookups.
 * Theme class is not applied here — the root layout that manages it failed,
 * so this page always renders in light mode.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<"en" | "hi" | "ne">("en");
  useEffect(() => {
    console.error(error);
    try {
      const l = localStorage.getItem("spendflow_language");
      if (l === "hi" || l === "ne") setLang(l);
    } catch {
      // private mode / storage blocked → English fallback
    }
  }, [error]);
  const dict = { ...en, ...(lang === "hi" ? hi : lang === "ne" ? ne : {}) };
  const t = (k: TranslationKey) => dict[k] ?? en[k];

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-text antialiased">
        <StatusPage
          tone="danger"
          icon={<TriangleAlert size={26} aria-hidden />}
          title={t("errorTitle")}
          body={t("errorBody")}
          actions={
            <>
              <Button className="min-h-[44px]" onClick={reset}>
                {t("tryAgain")}
              </Button>
              <Button
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => {
                  window.location.assign("/");
                }}
              >
                {t("backHome")}
              </Button>
            </>
          }
        />
      </body>
    </html>
  );
}
