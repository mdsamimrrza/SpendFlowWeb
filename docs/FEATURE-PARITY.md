# FEATURE-PARITY.md — Mobile vs Web

Status legend: ✅ done · 🚧 planned for web v1 · ⏭ deferred (explicit non-goal) · ➖ N/A.
Update the web status column as features ship. Before implementing any feature, check its mobile
behavior in `00-EXISTING-APP-AUDIT.md` §3.

| Feature | Mobile | Web | Notes |
|---|---|---|---|
| **Auth** | | | |
| Public landing page (`/`) | ➖ | ✅ | web-only marketing page in the ledger aesthetic (live SF-01 demo cycling all 12 currencies); statement dashboard moved to `/overview` — middleware sends signed-in users there, post-login + ExpenseForm redirects updated |
| Email/password sign-in & sign-up | ✅ | ✅ | zod validation, 8-char min password |
| Google OAuth | ✅ | ✅ | web = PKCE + `/auth/callback`; dev runs on `127.0.0.1` (see docs/SUPABASE.md §7 — the `localhost` hostname is NOT auto-allowed by Supabase, dotted loopback IPs are). **Phone symptom (2026-09-13):** when the browser origin (LAN-IP dev or an unlisted production domain) is not in the Supabase Redirect URL allowlist, Supabase silently rewrites the OAuth return to the Site URL `spendflow://` — Android then opens the mobile APK instead of the web app. Fix is dashboard-only (allowlist `<origin>/auth/callback`); verify any origin with `node scripts/verify-oauth-redirect.mjs <origin>` |
| Apple sign-in | ✅ (iOS only) | ⏭ | iOS-only; skip on web |
| Forgot password | ✅ | ✅ | reset email modal |
| Biometric unlock / soft-lock login card | ✅ | ⏭ | WebAuthn someday |
| Session persistence | ✅ SecureStore (chunked) | ✅ | httpOnly cookies via @supabase/ssr (supabase-js 2.116 / ssr 0.12) |
| **Core ledger** | | | |
| Expense/income entry (type flip, quick tags) | ✅ | ✅ | quick tags land with tag chips; type toggle + all core fields live |
| Expense edit + soft delete | ✅ | ✅ | confirm dialog, soft delete |
| Categories CRUD + default seeding (9 exp / 6 inc) | ✅ | ✅ | writes category_budget_history; delete reassigns |
| Multi-currency (12) + per-row FX snapshot | ✅ | ✅ | snapshot semantics match mobile tier order; 2026-09-13: converted rows + display budget quantized to the display currency's minor units at the conversion boundary so statement lines reconcile in all 12 currencies (see docs/TESTING.md §2), inflow/outflow % pairs complement-derived to sum to 100, Analytics statement No. locale-independent via cycleStatementNo, CSV export decimals match currency (0 for KRW/JPY) |
| Receipt attach (camera/gallery) | ✅ | 🚧 | file input; private bucket + signed URLs |
| Receipt OCR prefill | ✅ (ML Kit) | ⏭ | no on-device OCR in browser v1 |
| Privacy masking toggle (width-locked) | ✅ | ✅ | digit-level mask, tabular-nums lock |
| CSV import (≤2 MB / 1000 rows) | ✅ | 🚧 | file input |
| **Views** | | | |
| Home dashboard (budget hero, trend chart, donut, recent) | ✅ | ✅ | cycle-window aware; hover-scrub chart; header shows flag + code (self-hosted SVGs in /public/flags — Windows renders emoji flags as letters, so the CURRENCY_DETAILS.flag emoji is data-only, never displayed); 2026-09-12 audit: day counts inclusive (30-day cycle = 30 days), Today = local date, prev-cycle delta re-derived from the cycle rule (not a ms-shift), statement No. locale-independent, entries footer counts cycle rows only |
| History: search / date / category / sort, date-grouped, pagination | ✅ | 🚧 | search + flow switcher + day groups + pagination live; date/category/sort popovers + export pending |
| Vault & Flow summary card | ✅ | ✅ | outflow / inflow / net on History |
| Analytics: KPI rule, health score, payment methods, weekday rhythm | ✅ | ✅ | composite 0–100 score with factor rows |
| Profit & Loss: month-by-month statement, budget editor, cycle configurator | ✅ | ✅ | budget + cycle writes append user_settings_history |
| Recurring rules + generation engine + pause/resume | ✅ | ✅ | idempotent upsert (recurring_rule_id, date) |
| Bullion board (FENEGOSIDA / IBJA, chart, calculator) | ✅ | ✅ | same calibrations; history via shared edge fn |
| Accounts: multi-account, computed balances, default flag | ✅ | ✅ | balances from snapshots ± transfers |
| Transfers + rate locking + history | ✅ | ✅ | rate preview + locked row; log with delete |
| **Settings & platform** | | | |
| Currency / theme / language (EN·HI·NE) switchers | ✅ | ✅ | currency change never rewrites budget |
| Settings history (append-only) + cycle logic | ✅ | 🚧 | consumed, not just displayed |
| Export CSV + print/PDF; CSV import | ✅ | ✅ | Excel export pending |
| Budget milestone alerts | ✅ notifications | 🚧 | in-app toasts/banners on web |
| Recurring-due notifications | ✅ | ⏭ | Web Push later |
| Cross-device push on expense change | ✅ | ⏭ | mobile-only via Expo push |
| Screenshot blocking | ✅ | ⏭ | no browser equivalent |
| Haptics | ✅ | ⏭ | visual feedback instead |
| Offline read-cache | ✅ AsyncStorage | ✅ | localStorage page-0 cache, cache-paint + 30 s throttle |
| Offline mutation queue | ➖ (removed) | ➖ | writes online-only, both clients |
| Onboarding (single page, country chips) | ✅ | ✅ | currency adopted at first login; chips show flag + code like mobile |
| Account deletion (OTP-gated wipe) | ✅ | ✅ | shared edge functions; danger zone |
| Email change (OTP to current email) | ✅ | ✅ | send-security-otp + verifyOtp |
| Password change (re-verify current) | ✅ | ✅ | |
| Sign out all devices | ✅ | 🚧 | plain sign-out live; global-scope pending |

> Build state 2026-09-12 (complete pass): all 10 remaining routes built in the ledger design —
> Analytics, Recurring (+generation engine), Accounts, Transfer, Transfer log, Profit & Loss,
> Categories, Profile (+OTP flows), Export/Import, Bullion. 21 routes total; `tsc --noEmit` 0 errors;
> production build green. Still deferred (deliberate): receipt OCR, push notifications, biometrics,
> Apple sign-in, Excel export (CSV + print/PDF shipped).
| Avatar upload/remove | ✅ | ✅ | public bucket, 2 MiB guard |
