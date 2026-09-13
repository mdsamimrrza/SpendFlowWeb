import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/store/Providers";

export const metadata: Metadata = {
  title: "SpendFlow — Your personal ledger",
  description:
    "Track expenses, income, budgets and transfers. Companion web app to the SpendFlow mobile app.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDEAE0" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F19" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeContext toggles the `dark` class pre-hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
