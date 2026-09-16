# TESTING.md — SpendFlow Web

## 1. Tooling

| Layer | Tool | Scope |
|---|---|---|
| Types | `npx tsc --noEmit` | **0 errors required** (house rule inherited from mobile) |
| Unit / logic | Vitest | `utils/format.ts` (cycle windows, budget conversion, masking), FX snapshot resolver, bullion calibrations, CSV sanitize, balance computation |
| Component | Vitest + React Testing Library | forms, dialogs, privacy masking (width lock), i18n fallback (t() → en → key) |
| E2E | Playwright | auth, expense create/edit/delete, transfer, budget flows, export downloads |
| Lint | ESLint (next/core-web-vitals + TS) | clean required |

## 2. Logic parity tests (highest value)

The riskiest web/mobile divergence is in pure math. Port mobile behavior and lock it with tests:

- **Cycle windows**: `cycle_start_day` 1 = calendar-month sentinel; 2–31 custom; 29–31 must not clamp to 28; end-day nullability.
- **Cross-currency statement reconciliation** (`scripts/verify-currency-sync.mjs`): every FX-converted row and the display-converted budget are quantized to the display currency's minor units (`quantizeMoney`, half away from zero; KRW/JPY = 0 digits) at the conversion boundary — so displayed Net (inflow − outflow) and Remaining/Over-by (budget − spent) reconcile with the displayed operands to the minor unit in all 12 currencies. Inflow/outflow % pairs are complement-derived (`100 − rounded`) so they always sum to 100. Display-layer only — stored amounts, budgets, and FX snapshots are never rewritten.
- **Budget conversion**: display-only conversion budget_currency → preferred_currency; **assert stored budget is never rewritten** (regression guard for the critical currency rule).
- **FX tiers** (`scripts/verify-fx-tiers.mjs`): pegged (QAR/AED/SAR constants, NPR = INR/1.6) → cache TTLs → table nearest-date lookup → API → fallback table; snapshot stamped on create. Current-rate (undated) requests are API-first (frankfurter → er-api) — the table answers only when both APIs are unreachable; dated lookups stay table-first, byte-compatible with mobile.
- **Bullion calibrations**: FENEGOSIDA (fine 1.20649, tejabi 92.5588 %, silver 1.22765), IBJA (1.0918, 22K 91.67 %), session fixing times (10:30 NPT; AM/PM IST), board rounding.
- **Recurring normalization**: daily×30, weekly×4.33 monthly totals; idempotent generation against `ON CONFLICT (recurring_rule_id, date)` semantics (mock the DB).
- **Balances**: `computeAccountBalances` from initial + expenses + transfers.

## 3. RLS / backend tests

Backend behavior is tested in the mobile repo: `supabase/tests/rls_regression.sql` (49 pgTAP
assertions: cross-user isolation, owned-reference rejection, exchange_rates read-only, CHECK
constraints). Web does **not** duplicate that suite. Web responsibilities:

- E2E smoke with a real (staging) user: verify a user A cannot read user B's rows through the web client (RLS through the browser path).
- After any migration: rerun the pgTAP suite + regenerate types + re-run web E2E.

## 4. What to mock vs not

- Unit tests: mock supabase-js and network. Snapshot/peg math is pure.
- Component tests: mock `services/*` modules (keep services thin so this is easy).
- E2E: real Supabase (staging project or a shadow project with the same migrations). Never E2E against production data.

## 5. Definition of done (per feature)

1. Implementation matches `00-EXISTING-APP-AUDIT.md` + `FEATURE-PARITY.md` row updated.
2. `tsc --noEmit` 0 errors; lint clean; unit + component tests pass; build passes.
3. Loading/empty/error/disabled states implemented (UI-SPECIFICATION.md §2).
4. New strings added to en + hi + ne.
5. Both themes visually verified; no layout shift with privacy masking on/off.
6. No schema/RLS change without the §3 checklist.
