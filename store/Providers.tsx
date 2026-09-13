"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeContext";
import { LanguageProvider } from "./LanguageContext";
import { PrivacyProvider } from "./PrivacyContext";
import { ToastProvider } from "./ToastContext";
import { AuthProvider } from "./AuthContext";

/**
 * Provider stack mirrors the mobile root layout order
 * (app/_layout.tsx: ExchangeRate → Language → Auth → Security → Theme → Privacy).
 * On web, theme wraps first so the dark class applies before paint;
 * session gating is done server-side by middleware.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <PrivacyProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </PrivacyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
