import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/store/Providers";
import { ThemeFavicon } from "@/components/ui/ThemeFavicon";

/* DM Sans – the V5 "Sage Ledger" voice: one soft geometric sans carries the
   UI. Money figures speak Geist Mono (2026-10-15 user direction) - the same
   sharp numeric voice as the Master Admin project - applied through the
   `numeric` utility. */
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-money",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpendFlow – Your personal ledger",
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
    { media: "(prefers-color-scheme: light)", color: "#F8F9FA" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeContext toggles the `dark` class pre-hydration.
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-text antialiased">
        {/* Theme before first paint: same resolution as ThemeContext.applyTheme,
            run synchronously from the document head so a dark-mode refresh
            never flashes the light theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("spendflow_theme_preference")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`,
          }}
        />
        <Providers>
          <ThemeFavicon />
          {children}
        </Providers>
      </body>
    </html>
  );
}
