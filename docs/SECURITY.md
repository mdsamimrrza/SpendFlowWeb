# SECURITY.md — SpendFlow Web

## 1. Threat model shift: anon key in browser JS

On mobile the anon key ships in the binary; on web it is visible in browser devtools — by design,
same as mobile. **The RLS policies are the actual security boundary**, not client-side checks.
Everything an attacker could do with the anon key + a stolen user session is already bounded by:

- Owner-scoped RLS on all 13 tables (`auth.uid() = user_id` / `= id`) — see SUPABASE.md §1.
- Client DELETE revoked on `users` and both history tables; history inserts trigger-gated to
  baseline/current-month ≤ today.
- `exchange_rates` / `market_gold_rates` read-only for clients; `security_otp_sends` fully
  invisible (zero policies).
- `validate_owned_references()` triggers reject cross-user FK writes even with a valid session.
- Storage policies pin objects to `{auth.uid()}/*` folders; receipts are private (signed URLs only).
- Deletion write-block trigger (`deletion_pending`) freezes writes mid-deletion.

**Web dev rules:** never trust client validation as security; never fetch with `auth.uid()`-like
client-supplied user ids in filters for authorization decisions (RLS handles ownership); never
propose weakening a policy to make a web feature easier.

## 2. Key handling

| Key | Where | Never |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` (gitignored) + Vercel env vars | hardcoded in source |
| Service role key | **Nowhere in the web repo** | imported server-side, logged, or placed in any `NEXT_PUBLIC_*` var |
| Exchange-rate API keys | Mobile keeps them server-only (`EXCHANGE_RATE_API_KEY` in `.env.maintenance`); web doesn't need them (public endpoints) | bundled |

`.env.local` is gitignored; `.env.example` documents the required vars with placeholders.

## 3. Auth security

- **Session storage**: `@supabase/ssr` httpOnly cookies — not localStorage — so XSS can't read tokens and Server Components/middleware can gate routes.
- **OAuth**: Google via PKCE; `/auth/callback` validates the code exchange server-side; redirects restricted to same-origin paths (no open redirect via `next` param).
- Port mobile's **deep-link trust gate** thinking to web: only accept auth callbacks on our own origin; ignore `error` fragments from unknown hosts.
- **Email change / account deletion** require the `send-security-otp` edge-function flow (recipient resolved from JWT server-side; 60 s cooldown; deletion additionally requires a ≤ 10 min OTP-minted session — a stolen cookie alone cannot delete an account).
- Sign out = local revoke; "sign out all devices" = `signOut({ scope: 'global' })`.

## 4. Browser hardening

- **CSP** via `next.config.js` headers: allow Supabase URL + the public FX/bullion hosts; no `unsafe-inline` scripts in production (nonces if needed); `frame-ancestors 'none'`.
- **Cookies**: `Secure`, `SameSite=Lax`, httpOnly (Supabase SSR defaults).
- No sensitive data in `localStorage` beyond non-credential caches (expense cache, preferences, privacy toggle) — same policy as mobile's AsyncStorage usage.
- **CSV import / export**: sanitize on import (mobile has formula-injection guards in `services/export.ts` — port them); escape on export identically.
- Receipt/avatar uploads: enforce MIME + size limits client-side *and* rely on bucket limits (4 MiB receipts / 2 MiB avatars); upload only to `{uid}/` paths.
- Signed receipt URLs are 1-hour — never persist them; resolve on display (mobile `useReceiptUrl` pattern).

## 5. Rate limiting

- **OTP cooldown**: enforced server-side (60 s per user+purpose in `security_otp_sends`) — client just handles 429 gracefully.
- **Supabase Auth** has built-in rate limits on password/OAuth endpoints.
- Bullion-history edge function: clamp `days` 30–400; cache responses client-side (24 h TTL like mobile) — don't hammer Yahoo via the function.
- Vercel platform limits + middleware-level throttling are **out of scope for v1**; no public write API exists beyond Supabase (which RLS + Auth rate-limits).

## 6. CORS

- Next.js app: same-origin only; no CORS headers needed on route handlers.
- Edge functions: `bullion-history` sends `Access-Control-Allow-Origin: *` (stateless public data); the two sensitive functions answer only same-Supabase calls with Bearer JWTs (CORS irrelevant to their threat model; the JWT + amr checks are).
- Browser calls to `open.er-api.com` / `frankfurter.app` / `gold-api.com` are CORS-open public APIs (mobile web build already uses them).

## 7. Database change discipline

One backend, two consumers. Any migration (new table, column, policy change):
1. Write it in the mobile repo's `supabase/migrations/`.
2. Regenerate types (`scripts/sync-supabase-types.mjs`) → update SCHEMA.md/SUPABASE.md.
3. Verify RLS regression suite (`supabase/tests/rls_regression.sql`, 49 assertions) still passes.
4. Confirm the mobile app is unaffected (it's the primary client), then wire web.

## 8. Incident notes from the mobile repo worth knowing

- Migration history shows real production drift (`transfers_distinct_accounts` absent live until
  migration 34; storage limits from migration 21 never applied) — **verify against the live DB,
  don't assume migration files equal live state** for security-critical checks.
- `fetch-nepal-gold-rate` has a legacy-JWT decode branch that is only safe behind gateway JWT
  verification (`verify_jwt = true` in config.toml). Never deploy with `--no-verify-jwt`.
