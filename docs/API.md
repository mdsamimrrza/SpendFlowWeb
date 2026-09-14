# API.md — Web-facing API surface

The web app is a **direct Supabase client** (same as mobile). There is no BFF layer in v1, so this
doc covers: (a) the edge-function HTTP contracts the browser calls, (b) the external HTTP APIs the
browser calls, (c) the (deliberately minimal) Next.js server routes.

## 1. Next.js route handlers (server)

| Route | Purpose | Auth |
|---|---|---|
| `POST /auth/callback` | Google OAuth PKCE code exchange (`@supabase/ssr`), sets session cookies, redirects to `/` or `next` param. Rejects untrusted redirects. | Public (code must be valid) |
| `GET/POST` middleware (all routes) | Session refresh via `@supabase/ssr` `updateSession`; unauthenticated users redirected to `/auth` except `/auth*` and `/onboarding`. | — |

**No other server routes in v1.** No Next.js API route may hold the service-role key. If a future
feature seems to need server-side privileges, it must be an edge function in the mobile repo's
`supabase/functions/` (shared with mobile) — not a Next.js route.

Server Actions: none in v1; mutations go through `services/*` modules calling supabase-js directly,
mirroring the mobile repo module-for-module.

## 2. Supabase edge functions called from the browser

Base: `https://stisbfahlhquaqhrifjh.supabase.co/functions/v1` (gateway verifies JWT for all).

### POST /send-security-otp
- Headers: `Authorization: Bearer <access_token>`, `Content-Type: application/json`, `apikey: <anon>`.
- Body: `{ "purpose": "account_deletion" | "email_change" }` (default `account_deletion`).
- 200 `{ "success": true }` · 401 `{success:false, error:"unauthorized"}` · 429 `cooldown_active` (60 s per user+purpose) · 400 `invalid_purpose` · 502 `otp_send_failed`.
- Recipient is always resolved server-side from the JWT — client never supplies an email.

### POST /delete-account
- Headers: `Authorization: Bearer <access_token>` where the token's `amr` contains a fresh (≤ 10 min) `otp`/`magiclink` entry. **Flow: send OTP → `verifyOtp()` → immediately call with the freshly minted token.**
- Body: none.
- 200 `{ "success": true }` · errors `{success:false, error: code}`: `unauthorized`, `otp_verification_required`, `deletion_lock_failed`, `storage_cleanup_failed`, `storage_cleanup_incomplete`, `data_cleanup_failed`, `data_cleanup_incomplete`, `auth_deletion_failed`.
- On success the client clears local storage and signs out — nothing remains server-side.

### GET /bullion-history?days=N
- Headers: `apikey: <anon>` (+ optional Bearer); N clamped 30–400, default 120.
- 200 `{ "rows": [{ "date": "YYYY-MM-DD", "goldUsdPerOz": number, "silverUsdPerOz": number }] }` ascending.
- 502 `{ "error": ... }` on upstream (Yahoo) failure → client falls back to cached history.
- CORS: `*`.

### GET /fetch-nepal-gold-rate — **never called by web** (pg_cron / service-role only).

## 3. External HTTP APIs (browser, public endpoints)

| Endpoint | Used by | Notes |
|---|---|---|
| `open.er-api.com` (primary) / `api.exchangerate-api.com` (fallback), env-overridable | FX rate context | Current rates; QAR/AED/SAR pegged (never fetched); NPR derived from INR × 1.6 |
| `api.frankfurter.app` | Historical FX (bullion charts, rate resolver misses) | 8 s timeout in mobile; keep |
| `api.gold-api.com/price/XAU | XAG` | Spot bullion | |
| `query1.finance.yahoo.com` | Bullion history fallback | Mobile restricts to native (CORS); **web uses the `bullion-history` edge function instead** — do not call Yahoo from the browser |

These are all unauthenticated public APIs; nothing sensitive is sent. If a CORS or rate-limit problem appears, the answer is a new/extended edge function, not a Next.js proxy holding keys.

## 4. Supabase client API conventions (per-table)

Data access uses supabase-js with the **same query shapes as mobile services** — e.g.
`listExpenses` selects an explicit column list, joins `categories` and `bank_accounts`, paginates
with `.range()`, sanitizes the `ilike` search, and filters `deleted_at IS NULL`. Request/response
shapes therefore match the tables in SCHEMA.md; there are no views or RPCs exposed to clients
except:
- RPC `delete_user_data(uuid)` and `count_user_storage(text, uuid)` — **service-role only**, revoked from clients.

## 5. Auth requirements summary

- All app pages require a session (middleware-enforced) except `/`, `/sign-in`, `/onboarding`,
  `/auth/callback`, and the static design-preview routes (`/preview*` — mock data only, no auth,
  no network; documented here since the audit as public surface — remove before public launch if
  design previews are no longer needed).
- Session storage: `@supabase/ssr` cookies (web) — equivalent role to mobile's SecureStore adapter.
  Middleware verifies the JWT server-side per request (`auth.getUser()`, fails closed).
- OAuth: Google only (PKCE). Email/password sign-in/up. Apple: skip on web. Password-reset and
  signup-confirmation emails target the bare allowlisted `/auth/callback` (docs/SUPABASE.md §7);
  the callback exchanges the code and routes `type=recovery` sessions to
  `/profile?recovery=1` for the set-new-password step.
- Sensitive flows (email change, account deletion) always require the OTP edge-function flow.
- Every mutating Supabase call carries an explicit `.eq("user_id", …)` owner predicate (defense in
  depth over the RLS boundary — 2026-09-14 audit P2-4); services take a **required** user id.
