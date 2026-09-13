# Architecture — SpendFlow Web

Status: **proposed / awaiting owner confirmation** (per bootstrap instructions, no feature code before sign-off).

## 1. Monorepo decision

**Target: monorepo via Turborepo** with `apps/mobile` (existing Expo app) and `apps/web` (this Next.js app), sharing a `packages/types` package whose Supabase database types are **generated** from the schema (`supabase gen types typescript`), so both clients consume identical types instead of hand-duplicating them.

### Why monorepo

1. **One backend, two consumers.** Every schema drift risk we found in the mobile migrations (e.g. `recurring_rules.bank_account_id` defined in a migration but never applied live) is exactly the class of bug shared generated types catch.
2. Shared business logic candidates: currency math (`utils/format.ts` cycle/budget logic), FX snapshot resolver semantics, bullion calibrations (FENEGOSIDA / IBJA multipliers), i18n key shape.
3. One migration folder, one `SCHEMA.md`, one source of truth for RLS.

### Current phase (Phase 0): restructure is OUT OF SCOPE right now

The mobile repo is a **deployed standalone Expo app** (EAS builds, `app.json` project config, git history with production releases). Moving it into `apps/mobile` changes EAS project paths and risks breaking the release pipeline — not acceptable as a side effect of bootstrapping the web app. Explicitly deferred.

**Interim arrangement (Phase 0):**

- `spendflowweb/` stays a standalone Next.js app in its own repo/folder; the mobile repo stays where it is.
- **Types sync (manual, scripted):**
  1. Install Supabase CLI and link the project once (`supabase link --project-ref stisbfahlhquaqhrifjh`).
  2. Run `supabase gen types typescript > packages-types/database.types.ts` (script `scripts/sync-supabase-types.mjs` in the web repo).
  3. The script **copies the generated file into both repos** (e.g. `spendflowweb/types/database.types.ts` and `SpendFlow/types/database.types.ts`) and both apps import from their local copy.
  4. Any migration in the mobile repo ⇒ rerun the script; CI (later) diffs the generated file against the committed one so drift fails the build.
- Shared constants (currencies, bullion multipliers, i18n key names) stay duplicated for now, each repo owning its copy, with the audit doc (`00-EXISTING-APP-AUDIT.md`) as the reference. Extract into `packages/` only when the monorepo move happens.

**Migration path to the real monorepo (later, deliberate):** create `spendflow-monorepo/` → move mobile repo in as `apps/mobile` unchanged (EAS config re-pointed and test-built first) → move web in as `apps/web` → extract `packages/types` (and later `packages/core` for shared math/i18n) → wire Turborepo task graph. Nothing in this doc set depends on when that happens.

## 2. Web system design

```
Browser (Next.js App Router)
├── Server Components / server-side session check (middleware)
├── Client Components
│     ├── supabase-js (anon key) ── RLS ──► Supabase Postgres
│     ├── supabase-js auth ───────────────► Supabase Auth (email/password, Google OAuth)
│     ├── supabase-js storage ────────────► receipts (private, signed URLs) / avatars (public)
│     ├── direct fetch ───────────────────► public FX APIs (open.er-api.com, frankfurter.app)
│     └── direct fetch ───────────────────► Edge functions: send-security-otp, delete-account,
│                                            bullion-history (same as mobile client)
Next.js server (Route Handlers / Server Actions — thin, stateless)
└── Optional later: server-side cron for web-specific jobs (none today; gold rates are pg_cron)
```

Key decisions:

- **Client-direct Supabase, same as mobile.** The web app is a *second client of the same backend*, not a BFF. All authorization happens through the exact RLS policies the mobile app relies on (documented in SUPABASE.md). The `anon` key is public by design.
- **No service-role key in the web app.** Ever. Server-side privileged operations already exist as edge functions (`delete-account`, `send-security-otp`) and are reused as-is.
- **Session handling**: `@supabase/ssr` (cookie-based storage for Next.js) rather than localStorage, so Server Components and middleware can read the session. PKCE flow for Google OAuth (redirect back to `/auth/callback` route handler).
- **Data fetching**: cache-then-network, mirroring mobile's pattern (see SYNC-STRATEGY.md). No React Query requirement stated; keep dependencies minimal — the mobile pattern is plain listeners + TTL caches and ports cleanly to SWR-style hooks or context stores.
- **Exports (PDF/Excel/CSV)**: client-side generation like mobile (e.g. jsPDF + SheetJS or similar), not server routes — keeps behavior byte-for-byte comparable and zero server load. CSV import is a client-side file read.
- **Hosting**: Vercel. Env vars only via Vercel project settings; `.env.local` locally.

## 3. Project structure (web app)

```
spendflowweb/
├── app/                        # Next.js App Router (routes mirror mobile screens)
│   ├── (auth)/                 # sign-in / sign-up (auth group, like mobile)
│   ├── (dashboard)/            # authenticated shell: home, history, analytics, recurring, settings
│   ├── accounts/ transfer/ export/ bullion/ profile/ profit-loss/ ...
│   └── auth/callback/          # OAuth PKCE code exchange route handler
├── components/                 # ui/, expense/, account/, category/ — mirror mobile component split
├── services/                   # same module names & responsibilities as mobile services/
├── hooks/ store/               # contexts mirroring mobile: Auth, Theme, Language, Privacy, rates
├── constants/                  # currencies, countries, categories, i18n (en/hi/ne)
├── utils/                      # format.ts (budget/cycle math), supabase.ts (SSR clients)
├── types/database.types.ts     # GENERATED — never hand-edit (sync script copies it in)
├── docs/                       # this doc set
└── scripts/                    # sync-supabase-types.mjs, etc.
```

The structure deliberately mirrors the mobile repo module-for-module (`services/expenses.ts` on web ≈ `services/expenses.ts` on mobile) so an engineer can cross-reference behavior 1:1.

## 4. Data flow (canonical example: create an expense)

1. User submits form → zod validation client-side (same rules as mobile's schema).
2. Before insert, resolve the FX snapshot for the expense's currency+date (`getRate` semantics from mobile `services/exchange.ts`: peg → cache → `exchange_rates` table → public API → fallback) and stamp `exchange_rate_to_usd` + `base_currency` — **identical to mobile**, because analytics/pivot logic depends on snapshots.
3. `supabase.from('expenses').insert(...)` — RLS scopes the row to `auth.uid()`.
4. In-memory listeners notify home/history/analytics to re-read; cache updated.
5. Budget milestone check runs client-side (same thresholds 25/50/75/90/100 %) → in-app banner; notification row insert (parity with mobile).

## 5. Non-goals for web v1

Biometric lock, screenshot blocking, haptics, push notifications, receipt OCR (stub the field, allow manual attach), Apple sign-in. Full list with rationale: `00-EXISTING-APP-AUDIT.md` §9 and `FEATURE-PARITY.md`.
