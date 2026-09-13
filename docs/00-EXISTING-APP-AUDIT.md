# 00 — Existing App Audit (SpendFlow Mobile)

> **This file is the source of truth for the web app.** Everything here was read directly from the
> mobile repo (`C:\Users\samim_40uxmfb\Desktop\deplyed project\SpendFlow`, Expo SDK 57 / RN 0.86+ /
> React 19, expo-router) and from its Supabase migrations (`supabase/migrations/`, 34 files).
> Audit date: 2026-09-12. If the mobile app changes, update this file first.
>
> Schema was derived from the committed SQL migrations — the Supabase CLI is not installed on this
> machine, so `supabase gen types typescript` has **not** been run yet (see SCHEMA.md).

---

## 1. App identity

| | |
|---|---|
| Name / slug | SpendFlow (`com.samimrrza.spendflow`), v2.0.0 |
| Deep link scheme | `spendflow://` |
| Backend | Supabase project ref **`stisbfahlhquaqhrifjh`** (same project the web app will use) |
| Client env vars | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (anon/publishable), `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_EXCHANGE_RATE_API_URL`, `EXPO_PUBLIC_EXCHANGE_RATE_FALLBACK_API_URL` |
| Server-only secrets | `.env.maintenance` (gitignored): `SUPABASE_SERVICE_ROLE_KEY`, `EXCHANGE_RATE_API_KEY`, `EXCHANGE_RATE_HOST_ACCESS_KEY` — never bundled into the client |

## 2. Navigation map (expo-router)

Root stack (headers hidden): `(auth)` → `onboarding` → `(tabs)` → pushed screens
(`expense/add` modal, `expense/[id]`, `transfer` modal, `transfer-history`, `export` modal,
`bullion`, `profile`, `profit-loss` modal, plus `accounts` and `categories` reachable from Settings).

Bottom tabs: **Home · History · Analytics · Recurring · Settings**.

Auth routing: session → tabs; no session + onboarding incomplete → onboarding; else → auth.

## 3. Feature inventory (per screen)

### Home (dashboard)
- Time-aware greeting + user name, currency flag, theme toggle, avatar quick card.
- `BudgetLimitHeroCard`: budget gauge, spent/remaining, today's spend, vs-previous-month deltas.
- `StockTrendChart` (1D/7D/4W/6M/1Y), `CategoryBreakdown` donut, recent 3 transactions, FAB "+".
- Pull-to-refresh; per-row **snapshot-aware FX conversion** (each transaction converted at the rate of its own date via `useRateResolver`).

### History (ledger)
- Search (300 ms debounce, server-side `ilike`), date-range filter via `CalendarModal`, category filter, sort — each via in-place floating popover menus.
- "Vault & Flow" summary card: total outflow / inflow / net cash flow, peak expense, All/Expense/Income switcher.
- `SectionList` grouped by date with per-day totals; pagination (15/page).
- Export modal: PDF / Excel (multi-sheet) / CSV — **generated entirely client-side** (expo-print + write-excel-file), no Supabase calls.

### Analytics ("Financial Intelligence")
- Period dropdown (Today/Week/Month/Year/Custom/All) + section focus (Overview / Categories / Habits / All).
- Overview: income vs expense vs budget card, KPI tiles (Total Spent, Daily Velocity, Peak, Average Ticket) each with a calculation-explainer modal, `FinancialHealthScoreCard` (0–100 composite).
- Categories: donut (flips category → payment method → income), per-category `BudgetProgress`, payment-method breakdown bars.
- Habits: day-of-week rhythm (`FinancialInsights`), burn velocity / pacing forecast (`BudgetAnalyticsCard`).

### Recurring
- Subscription/recurring-bill rules: list with monthly-normalized totals (daily×30, weekly×4.33), pause/resume, detail modal, bottom-sheet form with frequency presets.
- `generateDueRecurringExpenses` runs on login/refresh: idempotent batch generation into `expenses` using `ON CONFLICT (recurring_rule_id, date)`; forward-only `next_due_date` advance; local notification reminder.

### Settings
- Currency picker (from `constants/app.ts` — 12 currencies: NPR, INR, USD, QAR, GBP, AED, SAR, MYR, KRW, JPY, AUD, CAD). **Changing display currency never rewrites the stored budget** — conversion is display-only.
- Budget & Reports → Profit & Loss; Categories & Budgets; Bank Accounts & Wallets; Gold & Silver Rates (live); App Lock (biometric switch); Notifications (milestone thresholds 25/50/75/90/100 % + alert-suppression reset); Theme (light/dark/system); Language (EN/HI/NE); Export Data; Sign Out (soft-lock vs full global revoke).

### Auth screen
- Email/password sign-in + sign-up (react-hook-form + zod, 8-char min password).
- Google OAuth (native browser session → implicit tokens or PKCE code exchange). Apple sign-in (iOS only, `signInWithIdToken` + SHA-256 nonce).
- **Biometric-first unlock card** when session is soft-locked (remembered session + Face ID/fingerprint).
- Forgot-password modal (reset email). No magic-link sign-in, no phone auth.

### Onboarding
- Single fixed page, pre-login: language pills (EN/HI/NE), 12-country chip picker (flag + currency code only), "Get Started" → stores device-level `@spendflow_onboarding_currency` (adopted as display currency at first login on that device).

### Accounts (`accounts`)
- Total liquid balance (net worth across account currencies at today's rate), account list with **live balances computed from expenses + transfers + initial balances** (`computeAccountBalances`), per-account edit modal, seed-default-accounts on first view, recent transfers with delete.

### Transfers (`transfer`, `transfer-history`)
- From/To account pickers (mutually exclusive), quick-amount pills, **live conversion preview** (debounced), fee + notes, insufficient-balance banner.
- `createTransfer` **locks the FX rate on the row** at creation (`exchange_rate`, `converted_amount`; DB CHECK enforces `|converted − amount×rate| ≤ 0.05`).

### Bullion (`bullion`)
- Gold/silver price board with two markets: Nepal (**FENEGOSIDA** official fix, locked daily 10:30 AM NPT Sun–Fri; fine gold tariff multiplier 1.20649, Tejabi 92.5588 % of fine, silver 1.22765) and India (**IBJA**, AM 12:00 / PM 4:30 IST fixes; 1.0918 duty+GST calibration, 22K at 91.67 %).
- 2×2 benchmark grid (gold/silver per tola and per 10 g), custom SVG financial chart with tap-to-scrub tooltips, 1M/3M/6M/1Y periods, day-over-day change badges, instant metal valuation calculator (grams → value), buyer-guide card.

### Export (`export`)
- Period pills, statement preview, PDF/Excel/CSV export; **CSV import** (≤ 2 MB / 1000 rows) via document picker → `importExpensesFromCsv` (auto-creates categories, per-row FX snapshot).

### Profile (`profile`)
- Avatar upload (camera/gallery → `avatars` bucket, public URL persisted to `users.avatar_url` + auth metadata).
- Inline name editor; email change is **OTP-gated against the CURRENT email** (edge function `send-security-otp`, purpose `email_change`) before `updateUser({ email })`; password change re-verifies current password via `signInWithPassword`; "Sign out all devices" (`signOut({ scope: 'global' })`).
- Danger zone: `DeleteAccountModal` (warning → email OTP → wipe via edge function `delete-account`).

### Profit & Loss (`profit-loss`)
- Date-range P&L with executive SVG chart (All/Income/Expense/Net views, tap-to-select month HUD, savings rate).
- **Monthly budget inline editor — budget is stored ONCE in `users.monthly_budget` with its own `budget_currency`**; every past change is appended to `user_settings_history` (append-only, baseline row `1900-01-01`, UNIQUE `(user_id, effective_from)`) so past cycles are computed with the budget/days active at the time.
- **Paycheck & Budget Cycle card**: `cycle_start_day` (1 = standard calendar month sentinel; 2–31 custom; 29–31 valid, never capped at 28), optional `cycle_end_day`; cycle logic in `utils/format.ts`.

### Categories (`categories`)
- Expense/Income switcher, 2-column grid, per-category monthly budgets (`CategoryBudgetFormModal` bulk editor), category CRUD (delete reassigns expenses/rules to a fallback category), changes appended to `category_budget_history`.

### Expense form (`ExpenseForm`, shared add/edit)
- Types `expense | income` with card-flip animation; quick tags (8 expense / 7 income); amount, currency (12), category, date + AM/PM time, payment method (Cash/Card/UPI/Other), bank account, notes.
- **Receipt capture** (camera/library) → upload to private `receipts` bucket (path stored in `expenses.receipt_image_url`, read via 1-hour signed URLs) + **on-device OCR** (`@react-native-ml-kit`) prefills untouched fields only.
- Live currency conversion preview; soft-delete with confirm.

## 4. Cross-cutting behaviors

- **Privacy mode**: global eye toggle masks all money values as `••••••` (persisted, `utils/format.setGlobalPrivacyMode`); container width locked so badges don't shift.
- **i18n**: EN / HI / NE, ~410 flat keys each in `constants/i18n/`, `t()` falls back en → key; also drives date/number locale (`en-US`, `hi-IN`, `ne-NP`).
- **Theme**: `light | dark | system` (`ThemeContext`), all colors from `constants/theme.ts` (tokens table in DESIGN-TOKEN-BRIDGE.md). Light = warm parchment `#EDEAE0` bg + teal `#0F5C4D` primary; dark = deep slate `#0B0F19` + indigo `#818CF8`.
- **Chart colors rule**: income series is always `theme.colors.income` (green); the expense series is theme-conditional (indigo in dark, rust in light).
- **12-country currency system**: `CURRENCIES` + `CURRENCY_DETAILS` in `constants/app.ts`; QAR/AED/SAR are USD-pegged and never hit the FX API; NPR derives from INR × 1.6.
- **Offline read-cache** (AsyncStorage, per user): expenses page 0, accounts, transfers, recurring rules, categories, profile, FX snapshot (6 h TTL), bullion history (24 h TTL), session-fixed bullion rates. **There is NO offline mutation queue** — all writes are online-only; `expenses.client_sync_id` column remains as a future hook (its unique index is intentionally dropped).
- **Cache-paint pattern**: paint cached data instantly → network refresh → in-memory `notifyExpensesChanged()` listeners for cross-screen freshness. **30 s refresh throttle** on tab focus.
- **Notifications**: budget milestones (25/50/75/90/100 %, AsyncStorage dedup + suppression reset), category thresholds (90/100 %), recurring-bill-due reminders; notification rows also inserted into `notifications` table; cross-device pushes via `device_tokens` + Expo push API.

## 5. Auth & session flow (end to end)

1. **Client setup** (`utils/supabase.ts`): `createClient` with `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`. Session stored in a **chunked expo-secure-store adapter** on native (2000-byte chunks; iOS Keychain / Android Keystore) and plain AsyncStorage on web. `AppState` listener starts/stops token auto-refresh on foreground/background.
2. **Sign-in methods**: email/password, Google OAuth, Apple (iOS only).
3. **OAuth deep-link trust gate** (`AuthContext`): only the project's Supabase host or `spendflow://` callback URLs are accepted (login-CSRF defense).
4. **Soft lock / biometric**: `lockToLogin()` keeps the valid session in a ref and drops to the login screen; biometric success restores it. Separate `SecurityContext` + `BiometricLockOverlay` auto-locks on background→foreground.
5. **Profile bootstrap**: `ensureProfile` on every login — select/upsert `users` row, seeds default categories (9 expense + 6 income), resolves budget/cycle/currency (DB > auth metadata > device onboarding value), caches profile.
6. **Email change**: OTP to current email (edge function) → `verifyOtp('email'|'magiclink')` → `updateUser({ email })`.
7. **Password change**: verify-current via `signInWithPassword` → `updateUser({ password })`.
8. **Account deletion** (`delete-account` edge function, fail-closed state machine): OTP-minted fresh session required (JWT `amr` must contain `otp`/`magiclink` ≤ 10 min old) → `users.deletion_pending = true` (blocks all client writes via triggers) → purge storage `{uid}/**` in `receipts` + `avatars` (verified via `count_user_storage` RPC) → transactional `delete_user_data` RPC → `admin.deleteUser` last.
9. **Sign out**: unregister push token → `signOut` → clear all per-user AsyncStorage caches. "Sign out fully" adds `{ scope: 'global' }`.

## 6. Supabase usage map (what touches what)

| Client module | Tables | Storage | Edge functions |
|---|---|---|---|
| `services/auth.ts` | `users` | `avatars` (public) | `send-security-otp`, `delete-account` |
| `services/expenses.ts` | `expenses` (joins `categories`, `bank_accounts`) | — | — |
| `services/categories.ts` | `categories`, `category_budget_history`, `user_settings_history` | — | — |
| `services/bankAccounts.ts` | `bank_accounts` | — | — |
| `services/transfers.ts` | `transfers`, `bank_accounts` | — | — |
| `services/recurring.ts` | `recurring_rules`, `expenses` | — | — |
| `services/exchange.ts` | `exchange_rates` (read; legacy best-effort upsert no longer permitted by RLS) | — | — |
| `services/nepalGold.ts` | `market_gold_rates` (read-only) | — | — |
| `services/bullion.ts` | (via nepalGold) | — | `bullion-history` (anon-key headers) |
| `services/receipts.ts` | — | `receipts` (private, signed URLs) | — |
| `services/settingsHistory.ts` | `user_settings_history`, `category_budget_history` | — | — |
| `services/notifications.ts` | `notifications` (insert) | — | — |
| `services/pushNotifications.ts` | `device_tokens` | — | — (calls Expo push API directly) |
| `services/export.ts`, `services/receiptOcr.ts` | none (pure client-side) | — | — |

**External APIs called from the client**: `api.gold-api.com` (spot gold/silver), `query1.finance.yahoo.com` (bullion history fallback, native only), `api.frankfurter.app` (historical FX), `open.er-api.com` / `api.exchangerate-api.com` (current FX), `exp.host` (push). Server-only: FENEGOSIDA API + byajdar mirror (edge function/cron).

**Realtime: NONE.** No `.channel()` / `postgres_changes` anywhere. Cross-device freshness currently arrives via push notifications, not realtime sync. (See SYNC-STRATEGY.md.)

## 7. Edge functions (deployed with gateway JWT verification ON)

| Function | Trigger | Contract |
|---|---|---|
| `send-security-otp` | client POST | `{ purpose: 'account_deletion' \| 'email_change' }` → `{ success: true }`; 429 `cooldown_active` (60 s per user+purpose, table `security_otp_sends`); recipient always resolved from caller's JWT |
| `delete-account` | client POST | Bearer access token with fresh OTP `amr`; 200 `{ success: true }` or coarse error codes; full wipe state machine |
| `bullion-history` | client GET | `?days=30..400` (default 120) → `{ rows: [{ date, goldUsdPerOz, silverUsdPerOz }] }` from Yahoo futures; CORS `*`; exists because browsers/native can't hit Yahoo directly |
| `fetch-nepal-gold-rate` | **pg_cron only** (11:00/11:15/11:30/12:00 NPT) | Service-role gated; writes FENEGOSIDA daily fix to `market_gold_rates`, idempotent per day, stale-publication rejection |

## 8. Database schema summary

Full column-level detail lives in **[SCHEMA.md](./SCHEMA.md)**. Headline facts:

- **13 tables**: `users`, `categories`, `expenses`, `recurring_rules`, `bank_accounts`, `transfers`, `exchange_rates`, `market_gold_rates`, `user_settings_history`, `category_budget_history`, `device_tokens`, `notifications`, `security_otp_sends`.
- **RLS enabled on every table**, all owner-scoped (`auth.uid() = user_id` or `= id`) except: `exchange_rates` and `market_gold_rates` (authenticated SELECT only — writes are service-role), and `security_otp_sends` (zero policies — service-role only).
- **Client DELETE revoked**: `users` (no delete policy + REVOKE), both history tables (DELETE policies dropped + REVOKE). History tables are append-only; updates restricted to the baseline row / current month.
- **Storage**: `receipts` — private, 4 MiB, image MIME allowlist, owner-folder policies, reads via signed URLs; `avatars` — public, 2 MiB, same allowlist. Both bucket settings are data (in `storage.buckets`), final state from migration 29.
- **Integrity triggers**: `validate_owned_references` (rejects cross-user FKs on expenses/rules/transfers/category-budget-history), `block_writes_during_deletion` (10 tables), `enforce_settings_history_dates` (baseline or current-month only), updated_at triggers.
- **Known live drift** (recorded in migrations themselves): `recurring_rules.bank_account_id` was never applied live; `transfers_distinct_accounts` + fee CHECK had to be re-asserted in migration 34; migration 21's storage limits were superseded by migration 29.
- **Realtime publication**: no tables added to `supabase_realtime`.
- **pg_cron**: 4 schedules calling `trigger_fetch_nepal_gold_rate()` (reads service key from `vault.decrypted_secrets`).

## 9. Mobile-only behaviors the web app must adapt or skip

| Mobile capability | Web disposition |
|---|---|
| Biometric app lock (Face ID / fingerprint, overlay + soft-lock login card) | Skip for v1 (WebAuthn later); plain session only |
| Screenshot/recording blocking (`expo-screen-capture`) | No equivalent — skip; privacy masking mode stays |
| Haptics everywhere | Drop; replace with visual feedback |
| Local + push notifications (budget milestones, recurring due, cross-device) | In-app toasts/banners for v1; Web Push optional later |
| Receipt OCR (on-device ML Kit) | Browser file input + optional client-side OCR later; no ML Kit |
| Swipe-to-delete rows, swipe-down-dismiss drawers | Buttons / hover actions / drag handlers |
| Camera capture (receipts, avatar) | `<input type="file" accept="image/*" capture>` |
| Native share sheet / document picker (exports, CSV import) | Blob downloads / `<input type="file">` |
| Keyboard-avoiding, safe areas, status bar, splash | N/A |
| Apple Sign-In (iOS-only) | Skip on web; keep Google OAuth |
| AsyncStorage caches | localStorage/IndexedDB equivalents (same keys conceptually) |
