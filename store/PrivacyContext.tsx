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

/**
 * Global privacy mode (mobile parity): when on, every money value renders as
 * •••••• with a locked container width (zero layout shift — mobile AGENTS rule).
 */
interface PrivacyContextValue {
  isPrivacyMode: boolean;
  toggle: () => void;
  mask: (formatted: string) => string;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);
const STORAGE_KEY = "spendflow_privacy_mode";

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  useEffect(() => {
    setIsPrivacyMode(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = useCallback(() => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const mask = useCallback(
    (formatted: string) =>
      isPrivacyMode ? formatted.replace(/\d/g, "•") : formatted,
    [isPrivacyMode],
  );

  const value = useMemo(() => ({ isPrivacyMode, toggle, mask }), [isPrivacyMode, toggle, mask]);

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error("usePrivacy must be used within PrivacyProvider");
  return ctx;
}
