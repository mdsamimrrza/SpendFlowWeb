import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "stisbfahlhquaqhrifjh.supabase.co";
  } catch {
    return "stisbfahlhquaqhrifjh.supabase.co";
  }
})();

const isDev = process.env.NODE_ENV === "development";

/*
 * CSP (docs/SECURITY.md §4). Nonce-based CSP would force dynamic rendering on every
 * page (killing the static landing + /preview* surfaces and CDN caching), so this is
 * the documented non-nonce posture: 'unsafe-inline' is accepted for scripts/styles
 * (Next emits inline flight payloads; components use inline style attributes), while
 * the load-bearing controls — remote script lockdown (script-src 'self'), egress
 * lockdown (connect-src), clickjacking (frame-ancestors 'none'), base/form hijacks —
 * are enforced. Add a host here when a new outbound API/feed is introduced.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${supabaseHost}${isDev ? " http://localhost:3000 http://127.0.0.1:3000" : ""}`,
  `connect-src 'self' https://${supabaseHost} https://api.frankfurter.app https://api.gold-api.com${isDev ? ` http://localhost:3000 ws://localhost:3000 http://127.0.0.1:3000 ws://127.0.0.1:3000` : ""}`,
  `frame-src https://accounts.google.com https://${supabaseHost}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Separate caches so `next build` can never corrupt a concurrently running
  // `next dev` (a shared .next caused "__webpack_modules__[moduleId] is not a
  // function" when a production build overwrote the dev server's chunks).
  // NEXT_DIST_DIR additionally lets a second dev instance (e.g. the screenshot
  // QA harness) run with its own cache — two dev servers sharing one .next-dev
  // corrupt each other's webpack packs (intermittent 404/500 on hot routes).
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  images: {
    remotePatterns: [
      // Only the project's own Supabase host (avatars/receipts live there).
      { protocol: "https", hostname: supabaseHost },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
