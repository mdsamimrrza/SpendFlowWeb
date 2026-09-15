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

## Codebase intelligence — Graphify

The `graphify` agent skill (user-scoped: `~/.agents/skills/graphify`, invoked as `/graphify`) turns
this repo into a persistent knowledge graph with query/path/explain tools. Running it creates a
local `graphify-out/` (interactive HTML, GraphRAG-ready JSON, `GRAPH_REPORT.md`); it is a
navigation aid, not a source of truth — the "Priority of information" order above still governs.

Use Graphify when the task requires understanding or analyzing the existing codebase, especially:

- working in an unfamiliar area of the project
- tracing relationships between modules/files
- modifying functionality that spans multiple components
- analyzing architecture or dependencies
- investigating how data flows through the application
- planning a large or cross-cutting change

Understand the relevant relationships **before** making significant architectural or cross-file
changes; re-run with `--update` for an incremental refresh instead of a full rebuild.

**Do NOT run Graphify unnecessarily** for trivial changes where the relevant files and their
relationships are already obvious.

## Simplicity discipline — Ponytail

The `ponytail` skill family (user-scoped: `~/.agents/skills/ponytail*`) keeps implementations the
simplest that actually work. These are the *preventive* rules; the completion bar's item 6 is the
matching *final* sweep. Before adding new abstractions, utilities, dependencies, wrappers,
services, or duplicated functionality:

- Check whether existing project code already provides the functionality (search `components/`,
  `utils/`, `hooks/`, `services/`, `constants/` first).
- Check whether the platform/framework already solves it (Next.js, React, Tailwind, the Supabase
  client) or whether an existing dependency in `package.json` can be reused — no new packages for
  a job the stack already covers.
- Prefer the simplest maintainable implementation; avoid speculative abstractions and premature
  generalization (YAGNI).

When reviewing or simplifying existing code, use the appropriate skill:

- `/ponytail` — simplest-solution mindset while coding (lite / full / ultra).
- `/ponytail-review` — review a diff exclusively for over-engineering: what to delete (required by
  completion bar item 6).
- `/ponytail-audit` — whole-repo over-engineering audit (ranked report; changes nothing).
- `/ponytail-debt` — harvest `ponytail:` shortcut comments into a tracked debt ledger.
- `/ponytail-gain` — one-shot scoreboard of ponytail's measured impact.
- `/ponytail-help` — quick reference for all ponytail modes and commands.

**Ponytail must NOT be read as "make the code as short as possible."** Never remove necessary
validation, error handling, security controls, accessibility, logging, tests, or maintainability
merely to reduce code size. If minimalism ever conflicts with a rule in this file — mobile parity,
security, i18n coverage, mobile-first design, the mobile-mirror module exemption in item 6, or the
completion bar — the documented rule wins.

## Recommended workflow for significant feature work

1. Understand the relevant codebase and architecture with Graphify when appropriate.
2. Inspect existing functionality before creating new code (the checks in "Before coding any
   feature" above, plus Ponytail's search-first rules).
3. Plan the smallest maintainable implementation that matches documented mobile behavior.
4. Implement incrementally, one verifiable slice at a time.
5. Apply Ponytail principles throughout to avoid unnecessary complexity.
6. Run the relevant tests and validation (`npx tsc --noEmit`, tests, `shot-preview` screenshots).
7. Review the final changes (ponytail review per completion bar item 6, then the full bar).
8. Do not modify unrelated code.

**Use these skills intelligently based on the task — do not invoke every skill on every request.**

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

- **Mobile canonical tokens** live in `docs/DESIGN-TOKEN-BRIDGE.md` (mirror of mobile
  `constants/theme.ts`): light = warm parchment `#EDEAE0` + teal `#0F5C4D`; dark = deep slate
  `#0B0F19` + indigo `#818CF8`. **The web client deliberately diverged** to a "Neo" palette
  (light = porcelain `#f3f5f3` + emerald `#0b8457`; dark = near-black `#0a0d0c` + mint `#34d399`)
  per the user's redesign direction — recorded in `docs/FEATURE-PARITY.md`, not a silent rewrite.
  Do not change either palette without a user decision. All components consume tokens via Tailwind
  CSS variables — no raw hex in components.
- Chart series rule (web Neo): income always `income` (green); expense series theme-conditional
  (red light / mint dark) via the single `--sf-expense-series` variable.
- **Lucide icons only — never render emoji or text glyphs as icons.** Every icon in the web UI is a
  `lucide-react` component. The shared DB stores category/account icons as emoji (mobile writes
  them), so they must be resolved through `components/ui/Glyph.tsx` (`categoryGlyph` /
  `accountGlyph`) — the stored glyph is data, never displayed as text. No `💡` `✨` `▲` `▼` `◆`
  `→` characters in JSX either: use `Lightbulb`, `Sparkles`, `ArrowUpRight`/`ArrowDownRight` (or
  `TrendingUp`/`TrendingDown`), `ArrowRight`, etc. Check for leaks with
  `grep -n "💡\|✨\|▲\|▼\|◆" ` on any file you touch.
- **Mobile-first, every screen.** All pages are designed at the 390 px phone width FIRST, then
  enhanced upward (`sm:` / `md:` / `lg:`) — never desktop-first with shrink-to-fit. Concretely:
  grids stack by default and only split at `sm`+; primary figures use `FitText`; interactive
  rows/tap targets are ≥44 px tall; no horizontal overflow at 390 px; phones get the full feature
  set (progressive enhancement, not a stripped mobile view). Verify before marking a screen done:
  `node scripts/shot-preview-<screen>.mjs` (390 / 768 / 1280 / 1920, light + dark) must be overflow
  -clean. This applies to new screens and to any touch on an existing screen.
- Every user-facing string is added to **all three** i18n files (en, hi, ne) in the same change.
- Privacy masking must never cause layout shift (lock the amount container width).

## Completion bar (a task is done when ALL of these hold)

1. Implementation complete and matches the documented mobile behavior.
2. `npx tsc --noEmit` passes with 0 errors; lint clean.
3. Tests pass (`docs/TESTING.md`); build passes.
4. Docs updated: `FEATURE-PARITY.md` row, and any doc whose facts changed.
5. No regression to the mobile-facing schema/RLS (if a migration was involved: mobile repo owns it,
   pgTAP suite re-run, types regenerated).
6. **Ponytail pass done.** Every change ends with an over-engineering sweep before it is called
   done: run the `ponytail-review` skill on the diff (use `ponytail-audit` for repo-wide or
   directory-wide sweeps) and remove what it finds — dead components, clone-pasted scripts,
   single-implementation abstractions, deps the platform already ships. Mobile-mirror module
   structure (`services/*` parity with the mobile repo) is exempt: that layering is a documented
   convention, not incidental complexity.
