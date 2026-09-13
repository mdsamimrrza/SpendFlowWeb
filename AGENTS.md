# AGENTS.md — SpendFlow Web

Rules for AI agents and engineers working in this repo. Backend/shared-backend context lives in
`docs/SUPABASE.md`; what the existing mobile app actually does lives in
`docs/00-EXISTING-APP-AUDIT.md`.

## Priority of information

When sources disagree, resolve in this order:

1. **Explicit task instruction** from the user.
2. **Existing mobile app behavior/schema** as documented in `docs/00-EXISTING-APP-AUDIT.md` (the audit of the real Expo app — screens, services, exact schema, auth flow).
3. `docs/ARCHITECTURE.md` (system design, monorepo decision, data flow).
4. Other docs (`docs/SYNC-STRATEGY.md`, `docs/SCHEMA.md`, `docs/API.md`, `docs/UI-SPECIFICATION.md`, `docs/DESIGN-TOKEN-BRIDGE.md`, `docs/SECURITY.md`).
5. General assumptions (last resort — and a smell).

**Never invent behavior that contradicts what the mobile app actually does.** The two clients share
one Supabase project and must feel like one product. If the web needs to diverge deliberately, that
is a scope decision for the user, recorded in `docs/FEATURE-PARITY.md` — not a silent rewrite.

## Before coding any feature

1. Check `docs/FEATURE-PARITY.md`: does this feature exist on mobile? What's its web status?
2. Read its row in `docs/00-EXISTING-APP-AUDIT.md` §3 for the exact mobile behavior (validation rules, snapshot semantics, defaults, edge cases).
3. Match the schema usage in `docs/SCHEMA.md` (column names, CHECK constraints, soft-delete, FX snapshot columns). Note the live-drift warnings (e.g. `recurring_rules.bank_account_id` must not be written).
4. Implement mirroring the mobile module structure (`services/expenses.ts` on web ≈ same file on mobile).

## Ambiguity

If a mobile behavior isn't documented in the audit and isn't obvious from it, **ask the user — don't
guess**. Guessing produces a second product. Cite the gap; it usually means `00-EXISTING-APP-AUDIT.md`
needs an update too.

## Security

- **Never hardcode Supabase keys.** The anon key goes in `.env.local` (gitignored) and Vercel env
  vars only, referenced as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service-role key must never appear
  anywhere in this repo.
- **Treat the RLS policies in `docs/SUPABASE.md` §1 as the actual security boundary** — the anon key
  is in browser JS by design. Client-side checks are UX, not security.
- Storage uploads only to `{uid}/...` paths within the documented bucket limits (receipts 4 MiB
  private, avatars 2 MiB public).
- Sensitive flows (email change, account deletion) go through the `send-security-otp` /
  `delete-account` edge functions exactly as documented in `docs/API.md` — never reimplement them
  client-side against tables directly.

## Schema changes

- **Never modify the Supabase schema from the web app's context.** One backend, two consumers; the
  mobile repo owns `supabase/migrations/`.
- If a schema change is genuinely required: propose it, get user confirmation, write the migration
  in the mobile repo, **update `docs/SCHEMA.md` + `docs/SUPABASE.md`**, regenerate types via
  `scripts/sync-supabase-types.mjs`, and confirm the mobile app is not broken by the change.

## Brand & design

- Do not alter the theme tokens (`docs/DESIGN-TOKEN-BRIDGE.md`): light = warm parchment `#EDEAE0` +
  teal `#0F5C4D`; dark = deep slate `#0B0F19` + indigo `#818CF8`. All components consume tokens via
  Tailwind CSS variables — no raw hex in components.
- Chart series rule: income always `income` (green); expense series theme-conditional (indigo dark /
  rust light) via a single `expenseColor` variable.
- Every user-facing string is added to **all three** i18n files (en, hi, ne) in the same change.
- Privacy masking must never cause layout shift (lock the amount container width).

## Completion bar (a task is done when ALL of these hold)

1. Implementation complete and matches the documented mobile behavior.
2. `npx tsc --noEmit` passes with 0 errors; lint clean.
3. Tests pass (`docs/TESTING.md`); build passes.
4. Docs updated: `FEATURE-PARITY.md` row, and any doc whose facts changed.
5. No regression to the mobile-facing schema/RLS (if a migration was involved: mobile repo owns it,
   pgTAP suite re-run, types regenerated).
