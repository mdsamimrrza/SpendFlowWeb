/**
 * OAuth redirect allowlist verifier — checks whether an origin is in the
 * Supabase project's Redirect URL allowlist WITHOUT any real login.
 *
 * Why: the project's Site URL is the mobile deep link `spendflow://`. When the
 * web app starts Google OAuth with `redirect_to = <origin>/auth/callback` and
 * that origin is NOT allowlisted, Supabase silently rewrites the redirect to
 * `spendflow://…` — on Android the browser then opens the installed mobile APK
 * instead of returning to the web app (docs/SUPABASE.md §7).
 *
 * Oracle used: GET /auth/v1/verify with a fake token + our redirect_to. The
 * verify endpoint resolves redirect_to against the project's allowlist
 * *independent of any OAuth session* — even on guaranteed failure (the token
 * is fake) it redirects to:
 *   - <our origin>/auth/callback#error=...  → the origin IS allowlisted
 *   - spendflow://#error=...                → rewritten to Site URL → NOT allowlisted
 * The authorize first-hop is NOT a valid oracle: this auth-server build passes
 * any redirect_to through to Google untouched and only enforces the allowlist
 * on the way back (which is exactly where the phone lands in the APK).
 *
 * Usage:
 *   node scripts/verify-oauth-redirect.mjs https://your-production-domain.com
 *   node scripts/verify-oauth-redirect.mjs http://192.168.1.20:3000   # LAN dev from a phone
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local
 * or .env (anon key only — safe to run anywhere; no secrets are printed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  // .env.local first (matches Next.js precedence), then .env.
  for (const file of [path.join(root, ".env.local"), path.join(root, ".env")]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

loadEnv();

const origin = process.argv[2];
if (!origin) {
  console.error("Usage: node scripts/verify-oauth-redirect.mjs <origin>   e.g. https://app.example.com");
  process.exit(2);
}
if (!/^https?:\/\//.test(origin)) {
  console.error(`Invalid origin: ${origin} (must start with http:// or https://)`);
  process.exit(2);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — fill .env.local first.");
  process.exit(2);
}

const redirectTo = `${origin.replace(/\/$/, "")}/auth/callback`;
const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/verify`);
url.searchParams.set("token", "invalid-token-allowlist-probe");
url.searchParams.set("type", "magiclink");
url.searchParams.set("token_hash", "fake-hash-allowlist-probe");
url.searchParams.set("redirect_to", redirectTo);

let res;
try {
  res = await fetch(url, {
    headers: { apikey: anonKey },
    redirect: "manual",
  });
} catch (e) {
  console.error(`Could not reach ${supabaseUrl}: ${e.message}`);
  process.exit(2);
}

const location = res.headers.get("location") ?? "";
const locLower = location.toLowerCase();
const allowed = locLower.startsWith(redirectTo.toLowerCase());

console.log(`Origin under test : ${origin}`);
console.log(`redirect_to       : ${redirectTo}`);
console.log(`Redirect decision : ${location || "(none)"}`);
console.log("");
if (allowed) {
  console.log("✓ ALLOWLISTED — Supabase will send OAuth back to this origin; Google login on the web app returns to /auth/callback.");
  process.exit(0);
}
if (locLower.startsWith("spendflow://") || locLower.startsWith("spendflow:")) {
  console.log("✗ NOT ALLOWLISTED — Supabase rewrote the redirect to the Site URL (spendflow://).");
  console.log("  On Android this is the bug where Google login 'succeeds' but opens the mobile");
  console.log("  APK instead of returning to the web app.");
} else if (!location) {
  console.log("✗ INCONCLUSIVE — the auth server returned no Location header.");
} else {
  console.log(`✗ INCONCLUSIVE — unexpected redirect target: ${location}`);
}
console.log("");
console.log("Fix (dashboard, no code): Supabase Dashboard → Authentication → URL Configuration →");
console.log(`Redirect URLs → add: ${redirectTo}`);
console.log("Then re-run this script to confirm it flips to ALLOWLISTED.");
process.exit(1);
