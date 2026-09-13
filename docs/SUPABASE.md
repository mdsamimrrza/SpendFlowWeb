# Supabase — Shared Backend (one project, two clients)

> Referenced by both the mobile app and the web app. Project ref: **`stisbfahlhquaqhrifjh`**
> (from `supabase/config.toml` in the mobile repo). All edge functions deploy with `verify_jwt = true`.

## 1. Tables (13) and their RLS posture

RLS is enabled on every table. Owner-scoped = `auth.uid() = user_id` (or `= id` for `users`).

| Table | RLS policies | Notes for web |
|---|---|---|
| `users` | SELECT / INSERT / UPDATE own row. **No DELETE policy; DELETE revoked** | Profile row mirrors auth metadata (`display_name`, `avatar_url`, `preferred_currency`, `theme_preference`, `monthly_budget`, `budget_currency` semantics via history, `cycle_start_day` 1–31 where **1 = standard calendar cycle**, `cycle_end_day` nullable, `deletion_pending` server-managed) |
| `categories` | 4 owner policies | UNIQUE `(user_id, name)`; `type` ∈ expense/income; `budget_monthly` nullable; delete → FK RESTRICT on expenses (client reassigns to fallback category first) |
| `expenses` | 4 owner policies | Soft delete (`deleted_at`); `receipt_image_url` stores a storage **path** (private bucket); FX snapshot columns `exchange_rate_to_usd` + `base_currency`; `date` CHECK 2000-01-01 → today+1; UNIQUE `(recurring_rule_id, date)` backs recurring generation |
| `recurring_rules` | 4 owner policies | ⚠️ `bank_account_id` defined in migration 5 but **never applied live** — do not write this column from web until resolved |
| `bank_accounts` | SELECT hides soft-deleted rows (`deleted_at IS NULL`); INSERT/UPDATE/DELETE owner | One default per user via partial unique index |
| `transfers` | SELECT hides soft-deleted; INSERT/UPDATE/DELETE owner | DB CHECKs: from ≠ to, `converted_amount ≈ amount × exchange_rate` (±0.05), fee ≥ 0 |
| `exchange_rates` | **SELECT only** (authenticated) — INSERT/UPDATE/DELETE revoked from clients | Shared reference data, PK `(currency, date)`; writes are service-role/backfill |
| `market_gold_rates` | **SELECT only** (authenticated) | FENEGOSIDA daily fix, written by pg_cron edge function; UNIQUE `(rate_date, country_code)` |
| `user_settings_history` | SELECT / INSERT own; **UPDATE only baseline row or current month, ≤ today; DELETE revoked** | Append-only audit; baseline row `1900-01-01`; UNIQUE `(user_id, effective_from)`; insert trigger `enforce_settings_history_dates` |
| `category_budget_history` | same shape as above | Append-only audit of category budgets |
| `device_tokens` | ALL owner | Mobile push only — web can ignore |
| `notifications` | 4 owner policies | Inserted client-side on budget milestones (parity behavior for web) |
| `security_otp_sends` | RLS on, **zero policies**, all grants revoked | Service-role only (OTP cooldown ledger) |

Cross-user FK integrity is enforced DB-side by `validate_owned_references()` triggers on
`expenses`, `recurring_rules`, `transfers`, `category_budget_history` — web cannot out-write these.

## 2. Storage buckets

| Bucket | Visibility | Limits | Policies |
|---|---|---|---|
| `receipts` | **private** (signed URLs, 1 h TTL in mobile) | 4 MiB, `image/jpeg, png, webp, heic, heif` | Owner-folder only: first path segment must equal `auth.uid()`; INSERT blocked while `deletion_pending` |
| `avatars` | **public** | 2 MiB, same MIME allowlist | Owner-folder INSERT/UPDATE/DELETE; public SELECT |

Object layout: `{auth.uid()}/filename`. Web must upload with the same layout or RLS will reject it.

## 3. Realtime

**None configured.** No tables in the `supabase_realtime` publication; the mobile app has zero
channel subscriptions. If web later enables realtime, that is a backend change requiring a
migration (`alter publication supabase_realtime add table ...`) and an update to this doc +
SYNC-STRATEGY.md + mobile-side awareness. See SYNC-STRATEGY.md for the current sync model.

## 4. Edge functions (reused as-is by web)

| Function | Contract (summary) |
|---|---|
| `POST /functions/v1/send-security-otp` | Bearer user JWT; body `{ purpose: 'account_deletion' \| 'email_change' }`; 200 `{success:true}`; 429 `cooldown_active` (60 s per user+purpose) |
| `POST /functions/v1/delete-account` | Bearer JWT whose `amr` contains `otp`/`magiclink` ≤ 10 min old (verify OTP first); 200 `{success:true}`; coarse error codes; wipes data + storage + auth user |
| `GET /functions/v1/bullion-history?days=N` | N clamped 30–400; `{rows:[{date, goldUsdPerOz, silverUsdPerOz}]}` (Yahoo futures); CORS `*` |
| `GET /functions/v1/fetch-nepal-gold-rate` | Service-role/pg_cron only — web must never call |

## 5. Scheduled jobs (pg_cron)

4 schedules call `trigger_fetch_nepal_gold_rate()` at 11:00 / 11:15 / 11:30 / 12:00 NPT
(05:15/05:30/05:45/06:15 UTC), which POSTs to the edge function using the service key read from
`vault.decrypted_secrets`. First verified fetch of the day wins (idempotent).

## 6. Security invariants (do not break from web)

1. `anon` key only — no service role anywhere in the Next.js app.
2. Never disable or "simplify" RLS assumptions in client code; treat these policies as the auth boundary (see SECURITY.md).
3. Storage uploads must use `{uid}/...` paths and respect MIME/size limits.
4. Account deletion must go through the OTP → edge function flow, never direct table deletes (client DELETE is revoked anyway).
5. Schema changes are made in the mobile repo's `supabase/migrations/` only, then `SCHEMA.md` regenerated and web re-tested.

## 7. OAuth redirect URLs (auth host configuration — dashboard, not code)

The Supabase project's **Site URL is the mobile deep link `spendflow://`**. Google OAuth on the
web app relies on `redirect_to` surviving Supabase's allowlist check:

- **Symptom when the origin is NOT allowlisted (the "opens the APK" bug)**: the web app's Google
  button sends `redirect_to = <current origin>/auth/callback`, but Supabase silently REWRITES any
  non-allowlisted `redirect_to` to the Site URL — which is `spendflow://…`, the mobile app's
  custom scheme. On Android, a `spendflow://` redirect in the browser resolves to the installed
  Expo APK via its intent filter, so Google login "succeedfully" lands the user in the **mobile
  app instead of the web app**. The web tab never receives the code; its PKCE session never
  completes. This is NOT Android App Links / assetlinks (the web repo ships no
  `.well-known/assetlinks.json` and the app.json scheme is plain `spendflow://`) — it is purely
  the Supabase redirect-rewrite fallback.
- **Fix (dashboard, 1 minute)**: **Dashboard → Authentication → URL Configuration → Redirect
  URLs** → add every origin the web app is served from, as `<origin>/auth/callback`:
  - production: `https://<production-domain>/auth/callback` (e.g. the Vercel domain)
  - LAN dev on a phone: `http://<your-LAN-IP>:3000/auth/callback` (e.g. `http://192.168.1.20:3000/auth/callback`)
  Then also add the bare origins to **Google Cloud Console → APIs & Services → Credentials →
  (the OAuth client) → Authorized redirect URIs**: `https://<supabase-ref>.supabase.co/auth/v1/callback`
  is already there for the mobile flow; no change is needed on the Google side for the web flow —
  Google only ever sees the Supabase callback URL. The allowlist that matters is Supabase's.
  (Wildcard `*` must never be used — it would let any site start Supabase OAuth flows for this project.)
  Verify without a phone: `node scripts/verify-oauth-redirect.mjs <origin>` — see below.
- **Dev (`next dev`)**: Supabase Auth auto-allows **dotted loopback IPs** (`http://127.0.0.1:*`) per
  RFC 8252 §7.3, but treats the `localhost` **hostname** as a normal domain that must be in the
  project's Redirect URL allowlist. If it is not, Supabase silently rewrites the OAuth redirect to
  the Site URL (`spendflow://…`) and Google login on web never returns to `/auth/callback`.
  The sign-in page therefore bounces dev sessions from `localhost` to `127.0.0.1` before any
  OAuth state is created (client-side — `next dev` collapses cross-host middleware redirect
  Locations to relative paths, so a middleware bounce would loop).
  **Always open the dev server at `http://127.0.0.1:3000` when testing Google login.**
  **Testing from a phone** (the exact scenario that opens the APK): the browser origin is
  `http://<LAN-IP>:3000`, which is NOT auto-allowed like loopback — it must be added to the
  Redirect URL allowlist exactly as above, or the phone login will keep bouncing to the APK.
- **The origin must match exactly, cookie jar and all.** Allowlisting `http://A…/auth/callback`
  does not cover origin `B`. A LAN hostname like `http://192.168.0.102.nip.io:3000` is a DIFFERENT
  allowlist entry (and a different cookie jar) from the bare IP `http://192.168.0.102:3000` —
  the browser must open the app on the same origin that is allowlisted, or Supabase rewrites the
  redirect to `spendflow://` and the login never returns. Verify the origin in the browser's
  address bar against the allowlist with `scripts/verify-oauth-redirect.mjs`.
- **`next dev` normalizes `request.url` to its bind host (localhost)**, so `/auth/callback` must
  build its redirect targets from the forwarded `Host` header, not `request.url` — otherwise a
  successful exchange on a LAN/nip.io origin bounces the browser to `http://localhost:3000`,
  which a phone cannot reach and which holds no session cookies. This is implemented in
  `app/auth/callback/route.ts` (Host/`x-forwarded-host` + `x-forwarded-proto` derivation);
  middleware already uses `request.nextUrl` and preserves the host, so only the route handler
  needed the fix.
- **Production (deploy)**: before the first production deployment, add the deployed origin to
  **Dashboard → Authentication → URL Configuration → Redirect URLs**, e.g.
  `https://<production-domain>/auth/callback`. Unlike loopback IPs, public hostnames are only
  allowed when explicitly listed. (Wildcard `*` must never be used — it would let any site start
  Supabase OAuth flows for this project.)
- `access_denied` (user cancelled consent) now returns to `/auth/callback` and is surfaced on
  `/sign-in` as `?error=oauth_cancelled`; failed exchanges land as `?error=oauth`. Success
  redirects to `/overview` (mobile parity — into the app, not the marketing landing).

### 7.1 Redirect allowlist verification script

`scripts/verify-oauth-redirect.mjs` checks an origin against the live Supabase Auth server the
same way the sign-in flow does (starts a Google OAuth request with that `redirect_to` and reads
the Location Supabase actually returns). If the origin is allowlisted, the Location points at
Google with the redirect preserved; if not, it points at `spendflow://…` (the APK bug). Run it
after every allowlist change, and from any new environment before shipping:

```bash
node scripts/verify-oauth-redirect.mjs https://your-production-domain.com
node scripts/verify-oauth-redirect.mjs http://192.168.1.20:3000   # LAN dev from a phone
```

No secrets needed — it uses only the anon key from `.env.local`.
