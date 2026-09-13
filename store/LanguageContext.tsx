"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, hi, ne, type TranslationKey } from "@/constants/i18n/dictionaries";
import { LANGUAGE_LOCALES, type LanguageCode } from "@/utils/format";

interface LanguageContextValue {
  language: LanguageCode;
  locale: string;
  setLanguage: (l: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "spendflow_language";

const DICTIONARIES = { en, hi, ne } as const;

/** t() falls back en → key (mobile LanguageContext parity). */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    if (stored && stored in DICTIONARIES) setLanguageState(stored);
  }, []);

  const setLanguage = useCallback((l: LanguageCode) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLanguageState(l);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => DICTIONARIES[language][key] ?? en[key] ?? key,
    [language],
  );

  const value = useMemo(
    () => ({ language, locale: LANGUAGE_LOCALES[language], setLanguage, t }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
