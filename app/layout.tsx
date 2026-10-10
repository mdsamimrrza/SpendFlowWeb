import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/store/Providers";
import { ThemeFavicon } from "@/components/ui/ThemeFavicon";

/* Inter for UI, Fraunces (the banknote serif) for money figures. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpendFlow — Your personal ledger",
  description:
    "Track expenses, income, budgets and transfers. Companion web app to the SpendFlow mobile app.",
  icons: {
    icon: [
      {
        url: "/icons/tab-dark.png",
        media: "(prefers-color-scheme: dark)",
        sizes: "64x64",
        type: "image/png",
      },
      {
        // Last + default: browsers without media-query icon support show
        // the light parchment emblem.
        url: "/icons/tab-light.png",
        media: "(prefers-color-scheme: light)",
        sizes: "64x64",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EFE2" },
    { media: "(prefers-color-scheme: dark)", color: "#0A100C" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeContext toggles the `dark` class pre-hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable}`}
    >
      <body className="min-h-screen bg-background text-text antialiased">
        <Providers>
          <ThemeFavicon />
          {children}
        </Providers>
      </body>
    </html>
  );
}
