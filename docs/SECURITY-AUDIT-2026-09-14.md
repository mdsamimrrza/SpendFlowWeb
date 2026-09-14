# SECURITY AUDIT (FULL) — SpendFlow Web — 2026-09-14 (v2, consolidated re-run)

Complete audit of every security flow, re-run line-by-line on 2026-09-14 and consolidated with the
verified earlier-pass deep dives (storage-image analysis, drift incident notes). Read-only — no
code was changed.

**Scope (all surfaces):** `middleware.ts`, `next.config.ts`, package manifest + `npm audit`,
`.gitignore`/`.env*` + git-history secret scan (all commits), `utils/supabase/{browser,server}.ts`,
`services/*` (all 14: auth, expenses, transfers, exchange, receipts, bullion, categories,
bankAccounts, recurring, bin, alerts, notifications, settingsHistory), `store/*` (Auth, Privacy,
Theme, Language, Toast), `app/(auth)/sign-in`, `app/onboarding`, `app/auth/callback`, all 14
`(dashboard)` pages, `app/expense/*`, the 17 public `/preview*` routes, chart/UI/transfer/export/
history/recurring components, `hooks/{useExpenses,useRates}.ts`, `scripts/*.mjs`, cross-checked
against `docs/SUPABASE.md` §1–§7, `docs/API.md`, `docs/SECURITY.md`, `docs/SCHEMA.md` (drift notes
1/5/6), `docs/00-EXISTING-APP-AUDIT.md` §5.

## Verdict

**No critical or high-severity vulnerability exploitable against a correctly-configured backend.**
The client is a sound thin RLS consumer: anon-key-only in code, session in SSR cookies, real JWT
verification (`auth.getUser()`, not cookie-presence) on every middleware hit, PKCE OAuth with a
robust same-origin redirect guard, both OTP-gated flows (email change, account deletion) matching
the documented edge-function contracts exactly — including the fresh-session `amr` gate for
deletion — and no code path that can touch another user's rows or the schema landmines
(`recurring_rules.bank_account_id` never written; slot-key upserts correct; bin semantics correct).

**However:** the whole posture rests on the *live* Supabase project matching the docs, and the
docs themselves record production drift before (SECURITY.md §8: *"storage limits from migration 21
never applied"*). That unverified state, plus a small cluster of missing defense-in-depth the docs
promise, is what this audit's P2s are about. 0 P0 / 0 P1 / **7 P2** / **11 P3** / 5 P4.

---

# Part 1 — P2 (fix soon; none directly exploitable cross-user today)

## P2-1 · No Content-Security-Policy — a control SECURITY.md §4 explicitly claims exists
`next.config.ts:13-21,34-36` ships XFO `DENY`, `nosniff`, Referrer-Policy, Permissions-Policy —
and no CSP. Doc requires `frame-ancestors 'none'`, script/connect-source allowlists. The app has
exactly four outbound origins (project Supabase REST/storage/auth, `api.frankfurter.app`,
`api.gold-api.com`, Google OAuth), so a tight policy is feasible. CSP is the browser-level backstop
for every P2-6/P3 sink below (print-window HTML, raw `avatar_url` img, plaintext localStorage
finance cache). **Fix:** add the documented CSP; keep `unsafe-inline` out of `script-src` in prod.

## P2-2 · Live storage-bucket limits are documented as historically NOT applied (verify before trusting the client gates)
All client-side upload gates (4 MiB/2 MiB, MIME, `{uid}/` path — `services/receipts.ts`,
`profile/page.tsx:68-96`) are browser-checkable labels: anyone can POST
`/storage/v1/object/{bucket}/{own-uid}/evil.html` with `content-type: text/html` using their own
JWT. The real enforcement is bucket config + policies — and `docs/SECURITY.md` §8 records that
migration 21's limits were **never applied in production**, while `docs/00-EXISTING-APP-AUDIT.md`
claims migration 29 superseded them. The docs contradict; only the live DB settles it. If limits
are absent: **HTML/SVG execution as top-level pages on the trusted `supabase.co` origin** (public
`avatars` bucket; private receipts bucket reachable via the "Open receipt" link which navigates to
the signed URL — `ExpenseDetailSheet.tsx:173,189`, already `rel="noopener noreferrer"`, but
top-level navigation itself is the sink) + unbounded storage writes.
**Action (verification, not a web change):**
`SELECT name, file_size_limit, allowed_mime_types FROM storage.buckets WHERE name IN
('receipts','avatars');` + reconcile `storage.policies` vs SUPABASE.md §2; drift fixes belong to
the mobile repo per AGENTS.md. Meanwhile: never offer top-level navigation to a signed receipt URL
(blob fetch or forced download).

## P2-3 · EXIF/GPS metadata uploaded intact into the PUBLIC avatars bucket
Verified zero resize/re-encode anywhere in the upload path (no canvas/`createImageBitmap`/
`toBlob`). A phone-camera JPEG retains GPS + device + timestamp; it lands at
`{uid}/{ts}.jpg` in a public-read bucket and the URL is persisted in `users.avatar_url` and auth
metadata. Anyone who obtains the URL gets the photo's geolocation. **Fix (web-side, cheap):**
canvas re-encode on pick before upload (also solves the 2 MiB cliff for high-res portraits);
receipts' EXIF into the private owner-only bucket is acceptable, note it.

## P2-4 · Systemic missing owner-scope on mutations (defense-in-depth inversion)
Doctrine says "client checks are UX, not security" — then the code omits the checks it calls
"defense in depth", so a single future policy relaxation becomes cross-tenant. Not exploitable
today (RLS + `validate_owned_references` verified in docs SUPABASE.md §1 as the live boundary; all
UI ids come from the user's own listings, URL ids hit a UUID regex):

| File | Lines | Statement lacking `.eq("user_id", …)` |
|---|---|---|
| `services/categories.ts` | 57-62, 87-90 | `updateCategory`; `deleteCategory`'s bulk re-point of `expenses` + `recurring_rules` **and** the delete — plus both re-point updates ignore `error` |
| `services/bankAccounts.ts` | 148-164, 174-178 | `updateBankAccount`; `deleteBankAccount` (userId not even a param) |
| `services/expenses.ts` | 100-113, 188-235, 237-259 | `getExpense`, `updateExpense` (also no `deleted_at IS NULL` guard → bin rows editable without restore), `softDeleteExpense`, `setExpenseReceipt` |
| `services/transfers.ts` | 93-102 | `deleteTransfer` |
| `services/recurring.ts` | 214-216, 234-238 | `if (userId)` makes the owner scope **optional** — a dropped session sends `undefined` and silently degrades to id-only writes; make required |

`bin.ts:108-133` is the correct template (`.eq("id").eq("user_id")`). **Fix:** one mechanical PR
adding required `userId` params + owner predicates everywhere; check the ignored errors.

## P2-5 · Recurring-slot squatting (griefing that RLS structurally cannot catch)
`createExpense` stamps `recurring_rule_id` + `recurring_due_date` from caller input with no
ownership check (`services/expenses.ts:139,177`); the inserted row is legitimately the attacker's,
so RLS passes, but the UNIQUE `(recurring_rule_id, recurring_due_date)` slot index then swallows
the *victim's* idempotent upserts (`recurring.ts:357-359,402-422`) — the victim's installment for
that date never books. **Open question flagged honestly:** whether `validate_owned_references()`
covers `expenses.recurring_rule_id` is NOT determinable from this repo (SUPABASE.md §1 lists the
trigger on `expenses` but not its column set) — verify against the mobile repo's migration SQL
before sizing the fix. Client-side pre-check of rule ownership is the web-side band-aid; a trigger
fix belongs to the mobile repo with user confirmation.

## P2-6 · Password-reset & signup-confirmation redirects sit OUTSIDE the documented allowlist pattern
SUPABASE.md §7 records: Site URL is `spendflow://` and only `<origin>/auth/callback` entries are
allowlisted — any other `redirect_to` is **silently rewritten to the mobile deep link** (on Android
the APK opens; the web flow dies). Two auth-delivery flows use non-`/auth/callback` targets:
- `services/auth.ts:31-35` — reset `redirectTo: /sign-in?reset=1` (never allowlisted per docs;
  `scripts/verify-oauth-redirect.mjs` only ever probes `/auth/callback`).
- `services/auth.ts:18-29` — signup passes no `emailRedirectTo`; if "Confirm email" is enabled
  (setting unrecorded anywhere), web signups can never activate — yet the UI assumes confirmation
  (`sign-in/page.tsx:147-150`).
**Action:** probe the live config with the documented `/auth/v1/verify` oracle; allowlist
`<origin>/sign-in` or route reset through `/auth/callback`; record the real dashboard state
(allowlist entries + Confirm-email flag) in SUPABASE.md §7. A silently broken recovery path is a
support-channel/credential-hygiene risk, and an allowlist nobody can see is unauditable.

## P2-7 · `next@15.5.4` carries four vulnerable vendored `postcss` advisories (npm audit: 1 high + 1 moderate)
GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>` in stringify), GHSA-6g55-p6wh-862q +
GHSA-fxqj-rqcc-2cmp + GHSA-r28c-9q8g-f849 (arbitrary `.map` file read / path traversal via
`sourceMappingURL`). **Build-time class** — needs hostile CSS during build; this repo compiles only
first-party Tailwind input, so realistic exposure is low (hence P2, not P1). Direct deps
(supabase-js 2.4x, @supabase/ssr 0.12.x, react 19.1, zod 3.24) are clean; no install hooks.
**Fix:** `next@16.3.5` (semver-major) with full completion-bar regression, or track the latest
15.x patch if backported.

---

# Part 2 — P3 (low)

1. **Callback redirect origin trusts `x-forwarded-host`/`Host`** (`app/auth/callback/route.ts:31-36`).
   Mandated for LAN dev (§7); browsers can't forge these cross-site, and Vercel overwrites them, so
   prod risk needs a misconfigured proxy *and* a victim completing OAuth on an attacker link —
   phishing vector, no session leak (cookies stay on the real origin; code already exchanged).
   Consider honoring forwarded hosts only outside production. The `next` param guard itself is
   **robust** (`startsWith("/") && !startsWith("//")` + absolutization onto `origin` kills
   protocol-relative and scheme smuggling; the `/\` trick does not apply to absolute targets —
   re-verified this pass).
2. **Arbitrary-URL `avatar_url`** — `saveProfile` forwards any string; rendered raw
   (`profile/page.tsx:262` `<img src>`); mirrored to auth metadata consumed by mobile. Self-row
   only (RLS), but it's a tracking-pixel/IP-leak sink and inconsistent with the receipts design
   (which stores a path and derives the URL). Validate prefix `{supabaseHost}/object/avatars/` at
   write time. (Interacts with P2-3: a re-encode-on-upload fixes both.)
3. **Onboarding currency unvalidated on insert** — `ensureProfile` writes the
   `spendflow_onboarding_currency` localStorage value straight into `users.preferred_currency`
   (`services/auth.ts:117-122`) while the sibling metadata path enforces `/^[A-Z]{3}$/` (`:102`).
   Devtools-editable; DB CHECK likely rejects — apply the same regex.
4. **Plaintext financial cache** — page-0 rows with descriptions/notes/amounts/receipt paths in
   `localStorage` (`services/expenses.ts:43-49`), cleared only for `sf_cache_*` on sign-out
   (`services/auth.ts:55-61`): not on session expiry; `sf_alert_sent_*` (embeds 8-hex-char user-id
   fragment, `services/alerts.ts:21-29`) survives sign-out entirely. Deliberate mobile
   cache-paint parity; pair with CSP (P2-1); purge the residual keys too. Note: SECURITY.md §3's
   blanket "httpOnly" claim overstates `@supabase/ssr` browser-client behavior — the client
   re-persists session state readable by JS; worth a deployed-cookie-flags check + doc fix.
5. **`updateBankAccount(is_default:true)` never unsets the old default** (`bankAccounts.ts:148-163`
   vs `createBankAccount:115-121`) → partial unique index rejects the write (availability bug;
   also no client validation of currency/name/last4 length — DB CHECKs backstop).
6. **Print-window HTML sinks** (`ExportStatement.tsx:134-158`): free-text escaped via `escapeHtml`
   (which misses `"`/`'` — fine for the current text-node positions, fragile if reused);
   `${r.date}` unescaped (schema-`date`-CHECK-constrained, plus import ISO-validates) and
   `displayCurrency` unescaped (3-letter CHECK). Works today; migrate to `DOMParser`/`textContent`
   or escape everything, so DB constraints are not the XSS defense.
7. **CSV formula guard gap**: `^[=+\-@]` (`ExportStatement.tsx:112`) misses `\t`/`\r` prefixes.
8. **17 public `/preview*` routes** (`middleware.ts:11`) — all verified render deterministic mock
   data with fetch paths gated on `inject` (spot-verified in export/transfer/dashboard statements),
   but that safety depends on every future statement component honoring the inject short-circuit;
   undocumented in API.md §5. Document the exception or drop the routes pre-launch.
9. **Raw Supabase `error.message` surfaced in sign-in banner** (`sign-in/page.tsx:122,140`) —
   enumeration risk depends on GoTrue "exact messages" setting (record it while doing P2-6).
10. **`images.remotePatterns` wildcard `*.supabase.co`** (`next.config.ts:31`) — any Supabase
    tenant qualifies as an image origin; pin to the project host (the fallback already encodes it).
11. **Category write hygiene** — no client caps on name/icon/budget (`budget_monthly` has no DB
    CHECK: negative budgets persist to own rows); `isValidISODate` (`utils/format.ts:78-80`)
    engine-edge dates pass (read-filters only — harmless; PostgREST parameterization means no
    injection either way; search text is already quote/backslash-sanitized and double-quoted —
    `expenses.ts:74-80`).

# Part 3 — P4 / verified-clean record (the "nothing missed" list)

- **Secrets:** no service-role key, JWT, or secret in any git object ever (full `git rev-list`
  scan) or working tree; `.env` gitignored + untracked with only the 4 public-by-design
  `NEXT_PUBLIC_*` vars; `.env.example` carries an explicit NEVER-set list; all clients read env
  with inert fail-closed placeholders (`missing-supabase-config.invalid`); scripts read the anon
  key from env and print no secrets. Zero `console.*` of data in app code.
- **No injection primitives:** zero `dangerouslySetInnerHTML`/`eval`/`new Function`/`innerHTML`
  repo-wide; React auto-escaping covers the render path; PostgREST access is builder-based; sort
  whitelisted; deep-link date params ISO-validated; `exchange.ts`'s Frankfurter URL interpolation
  is host-bound (path can't escape) with validated internal callers today (add an ISO regex
  guardrail anyway).
- **CSRF structurally absent:** data ops are Bearer-header calls (cross-site forms can't set them);
  no Next server actions; the only state-changing GET route is the PKCE-neutralized callback.
- **Sensitive flows honored exactly per contract** (cross-checked line-by-line vs API.md §2,
  SECURITY.md §3, audit §5): OTP recipient resolved server-side from the JWT (body `{purpose}`
  only); `verifyOtp type:"email"` semantics match the documented mobile flow; deletion presents
  the freshly OTP-minted token (≤10-min `amr` gate); password change re-authenticates; global
  sign-out + cache purge; `localStorage.clear()` on deletion; no client-side table access to
  `security_otp_sends`; `users` never deleted directly; `fetch-nepal-gold-rate` never called.
- **Storage code:** owner-derived paths, extension allowlist, SVG excluded everywhere,
  `upsert:true` confined to own `{uid}/` folder by policy, DB stores raw receipt paths, 1-h signed
  URLs resolved per-view into state only, bin purge double-guarded + owner-only orphan RPC, replaced
  avatars' old objects linger until account deletion purges `{uid}/**` (minor), avatar MIME lacks
  documented HEIC/HEIF parity (stricter than server; record in FEATURE-PARITY.md).
- **Schema discipline:** `recurring_rules.bank_account_id` written nowhere (grep-confirmed);
  slot-key `onConflict` correct (drift note 5); only documented hard deletes exist; FX snapshots
  frozen on edit unless date/currency changed (mobile parity); transfers pre-verify both accounts
  are the caller's and distinct (RLS + `validate_owned_references` would also reject cross-user).
- **Middleware:** real token verification per request (fails closed; rate-limit consideration only);
  signed-in bounce excludes `/auth/callback`, `/onboarding`, `/`.
- **Doc staleness to correct:** API.md §1/§5 say redirect target `/auth` (code: `/sign-in`) and
  describe the callback as POST (route: GET); SECURITY.md §3 httpOnly absolutism (P3-4) and §8
  migration-21 vs audit-doc §migration-29 contradiction (P2-2) need reconciling against live state.

# Part 4 — Recommended order

1. **P2-2 verification query** (10 minutes, unblocks the biggest unknown) and P2-5 trigger-column
   check against the mobile repo's migration SQL — both are *checks*, not web changes.
2. **P2-1 CSP** (+ P3-10 image host pin, + HSTS while there) in one PR.
3. **P2-4 mechanical owner-scope PR** (incl. ignored-error checks; required `userId` params).
4. **P2-6 live probe + doc truth record**; P3-9 setting check rides along.
5. **P2-3 canvas re-encode + P3-2 avatar URL validation** (one upload-path PR); P3-3 regex.
6. **P2-7 Next 16 upgrade** with full completion-bar regression (typecheck, lint, build,
   `shot-preview-*` × all screens × 4 widths × 2 themes).

*Every RLS/bucket statement here is "as documented"; the mobile repo's pgTAP suite remains the
verification mechanism (AGENTS.md completion bar). No item in this audit required a schema change
proposed from the web side.*

---

# Part 5 — Remediation status (same day, 2026-09-14)

All web-side items are now **implemented**; `tsc --noEmit` clean, production build passes (Next
now pinned 16.3.5), `npm audit` reports **0 vulnerabilities**. Live verification results from the
REST probes are recorded inline.

| ID | Status | Where |
|----|--------|-------|
| P2-1 CSP | **Fixed** — non-nonce CSP shipped (nonce rejected with rationale: would kill static rendering; remote-script + egress lockdown carry the defense), + HSTS, `img-src`/`connect-src` pinned to exact hosts | `next.config.ts` |
| P2-2 Bucket limits | **Closed with no drift** — live REST probe: `receipts` 4 MiB + image allowlist + private; `avatars` 2 MiB + allowlist + public (exactly SUPABASE.md §2; migration-21 note stale). Web hardening shipped anyway: receipt "open" links now use a `download`-disposition signed URL — no storage object can ever render top-level | `services/receipts.ts` (`resolveReceiptDownloadUrl`), `ExpenseDetailSheet.tsx`, SECURITY.md §8 updated |
| P2-3 EXIF | **Fixed** — avatars canvas re-encoded (≤512 px webp/jpeg) before upload; replaced avatar object best-effort deleted | `app/(dashboard)/profile/page.tsx` |
| P2-4 Owner scope | **Fixed** — required `userId` + `.eq("user_id", …)` on every mutation across categories/bankAccounts/expenses/transfers/recurring; ignored errors in `deleteCategory` surfaced; `deleted_at IS NULL` guards on edits | all services + call sites (tsc-enforced) |
| P2-5 Slot squatting | **Mitigated client-side** — `createExpense` pre-checks stamped-rule ownership. Open question (does the trigger cover `recurring_rule_id`?) raised with the user for the mobile repo — the only item not closed from this side | `services/expenses.ts` |
| P2-6 Reset/confirm | **Fixed + live-verified** — signup `emailRedirectTo` and reset `redirectTo` are now bare `/auth/callback`; probe confirms the live server **accepts** that target path. Callback detects `type=recovery` → `/profile?recovery=1` set-new-password modal (i18n ×3 langs). Round-trip send+click on a deployed origin remains the final check | `services/auth.ts`, callback route, profile page, SUPABASE.md §7 |
| P2-7 postcss | **Fixed** — Next 15.5.4 → 16.3.5 (exact pin); vendored postcss 8.5.12 patched; 0 vulnerabilities; all routes build | `package.json` |
| P3-1 | **Fixed** — forwarded-host trust restricted to development; production uses request URL | callback route |
| P3-2 | **Fixed** — `isAllowedAvatarUrl` enforced at write + render | services/auth, profile |
| P3-3 | **Fixed** — currency regex before insert | services/auth |
| P3-4 | **Fixed** — alert keys purged; purge also on silent session loss | services/auth, AuthContext |
| P3-5 | **Fixed** — default un-rooted on update | bankAccounts |
| P3-6/7 | **Fixed** (superseded by parallel `services/export.ts` refactor) — full-entity `escapePdf` on every interpolated field incl. dates; `sanitizeSpreadsheetCell` now covers category/type/method, so the CSV/Excel formula guard includes tab/CR | `services/export.ts` |
| P3-8 | **Documented** in API.md §5 as an intentional public mock-data surface (kept for the screenshot workflow) | API.md |
| P3-9 | **Fixed** — credential failures map to generic text (i18n ×3); signup "already registered" renders the neutral confirmation banner | sign-in page |
| P3-10 | **Fixed** — remotePatterns pinned to the project Supabase host (wildcard removed) | next.config.ts |
| P3-11 | **Fixed** — category/account write validation; `exchange.ts` URL inputs regex-gated; FX URL interpolation is host-bound | services |
| P4 docs | **Fixed** — SECURITY.md §3/§4/§8, API.md §1/§5, SUPABASE.md §7 brought in line with the code | docs |

**Remaining for the user (config, not code):** (1) send a real reset + signup email on each
deployed origin once (the target paths moved); (2) confirm GoTrue "exact messages" state while
there; (3) mobile repo to decide the `recurring_rule_id` trigger-column question (P2-5).
