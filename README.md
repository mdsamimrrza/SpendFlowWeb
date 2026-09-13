# SpendFlow Web

Next.js + Tailwind companion web app to the SpendFlow React Native/Expo mobile app. Both clients
share the same Supabase project (`stisbfahlhquaqhrifjh`) and must behave as one product.

> **Status: bootstrap / documentation phase.** The audit and architecture docs are written and
> awaiting owner confirmation before feature code starts.

## Documentation

| Doc | Contents |
|---|---|
| [docs/00-EXISTING-APP-AUDIT.md](docs/00-EXISTING-APP-AUDIT.md) | **Source of truth.** Real mobile app: features, screens, schema, auth flow, edge functions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monorepo decision (Turborepo target, standalone Phase 0), system design, project structure |
| [docs/SYNC-STRATEGY.md](docs/SYNC-STRATEGY.md) | Cache-then-network sync model, no-realtime rationale, conflict resolution, offline behavior |
| [docs/SUPABASE.md](docs/SUPABASE.md) | Shared backend: tables, RLS policies, buckets, edge functions, pg_cron |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Column-level schema (from migrations; to be regenerated via `supabase gen types`) |
| [docs/UI-SPECIFICATION.md](docs/UI-SPECIFICATION.md) | Web routes, required states, responsive rules |
| [docs/DESIGN-TOKEN-BRIDGE.md](docs/DESIGN-TOKEN-BRIDGE.md) | RN theme tokens → Tailwind mapping (both themes) |
| [docs/API.md](docs/API.md) | Edge-function contracts, external APIs, Next.js server routes |
| [docs/SECURITY.md](docs/SECURITY.md) | RLS as the boundary, key handling, CSP, rate limits |
| [docs/TESTING.md](docs/TESTING.md) | Tooling, logic-parity tests, definition of done |
| [docs/FEATURE-PARITY.md](docs/FEATURE-PARITY.md) | Feature | mobile | web status table |

## Stack (planned)

- Next.js (App Router, TypeScript) + Tailwind CSS
- `@supabase/ssr` + supabase-js (anon key only; RLS is the security boundary)
- Deploy: Vercel

## Setup (once scaffolding begins)

```bash
cp .env.example .env.local   # fill in Supabase URL + anon key
npm install
npm run dev
```

## Mobile repo

The mobile app lives at `C:\Users\samim_40uxmfb\Desktop\deplyed project\SpendFlow` (Expo SDK 57).
Its `docs`-relevant source: `supabase/migrations/` (schema), `services/` (data layer),
`constants/theme.ts` + `constants/i18n/` (design + translations).
