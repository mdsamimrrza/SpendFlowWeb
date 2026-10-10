import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "@/store/Providers";
import { ThemeFavicon } from "@/components/ui/ThemeFavicon";

/* Display face of the Engraved Banknote system - headlines and hero money
   figures (docs/DESIGN-TOKEN-BRIDGE.md §0). Body/UI stays system sans. */
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
    <html lang="en" suppressHydrationWarning className={fraunces.variable}>
      <body className="min-h-screen bg-background text-text antialiased">
        <Providers>
          <ThemeFavicon />
          {children}
        </Providers>
      </body>
    </html>
  );
}
