# SpendFlow clarity and trust plan

## Overview

Reduce SpendFlow's biggest product risk: users cannot immediately tell which
number to trust, what it means, or what to do next. The work will first define
the financial contract, then centralize the dashboard data model, then rebuild
the dashboard around one clear job: explaining what the user can spend now and
why.

## Product decisions

- The primary dashboard question is: "What can I safely spend before the next
  cycle reset?"
- Until commitments are included in the calculation, the UI must call the
  number "Budget remaining", not "Safe to spend".
- The first implementation uses the signed equation `budget - cycle spending`;
  negative values are shown as the amount over budget.
- Every important money figure must expose its basis: live rate, historical
  rate, cached value, or unavailable.
- The primary action is "Add transaction"; expense, income, and transfer are
  its explicit choices.
- Empty states guide the user through setup instead of showing unexplained
  zeroes and blank charts.
- The design system is frozen during the information-architecture work.

## Dependency order

```text
Financial definitions
  -> calculation helpers and tests
  -> dashboard data boundary
  -> dashboard information hierarchy
  -> responsive UI
  -> error/empty/accessibility polish
  -> visual review and launch decision
```

## Task list

### Phase 1: Define the financial contract

#### Task 1: Document dashboard number definitions

**Description:** Write the current, short dashboard contract: cycle dates,
budget currency, balance authority, budget remaining definition, commitment
handling, FX basis, privacy behavior, and loading/error states.

**Acceptance criteria:**

- Each dashboard number has one plain-language definition.
- The contract distinguishes budget remaining from genuinely safe-to-spend.
- Live, historical, cached, estimated, and unavailable values are defined.
- The mobile audit and schema remain the source of truth where behavior already
  exists.

**Verification:**

- Product review confirms no term has two meanings.
- No code changes are made until this contract is approved.

**Dependencies:** None

**Estimated scope:** Small

#### Task 2: Decide the safe-to-spend model

**Description:** Choose whether to ship "Budget remaining" first or include
upcoming recurring commitments and a cash buffer in a true safe-to-spend
calculation.

**Acceptance criteria:**

- The chosen formula is written as an equation.
- Over-budget behavior includes amount exceeded and days remaining.
- Missing budget and missing commitments have explicit behavior.

**Verification:**

- Example scenarios are calculated by hand and captured as test cases.
- Human approval is required before implementation.

**Dependencies:** Task 1

**Estimated scope:** Small

### Checkpoint: Product contract

- [ ] Tasks 1–2 approved
- [ ] No ambiguous dashboard terminology remains
- [ ] Safe-to-spend scope is explicitly chosen

### Phase 2: Make the financial data trustworthy

#### Task 3: Extract and test dashboard calculations

**Description:** Move cycle totals, budget pacing, balance presentation,
commitment subtraction, and FX-state labeling into pure calculation helpers.

**Acceptance criteria:**

- Helpers have no React or Supabase dependencies.
- Tests cover income, expenses, transfers, soft-deleted rows, budget overrun,
  no budget, and cycle boundaries.
- Tests cover active-cycle live FX versus closed-cycle historical FX.

**Verification:**

- `npm test`
- `npm run typecheck`

**Dependencies:** Task 2

**Estimated scope:** Medium

#### Task 4: Centralize account-balance loading

**Description:** Create one account-balance data boundary used by the dashboard
and accounts surfaces, with one rate map per load and explicit loading/error
states.

**Acceptance criteria:**

- UI components do not independently repeat account balance orchestration.
- Foreign-currency conversion is resolved once per unique currency.
- Conversion failure is visible as unavailable or estimated, never silently
  presented as an exact value.
- Refresh behavior remains compatible with expense changes.

**Verification:**

- Account balance tests cover income, expense, outgoing transfer, incoming
  transfer, fees, multiple currencies, and deleted rows.
- Browser check confirms dashboard and accounts show the same total.

**Dependencies:** Task 3

**Estimated scope:** Medium

#### Task 5: Reduce dashboard data fetching

**Description:** Replace the dashboard's broad 5,000-row fetch with bounded
  data requests for current-cycle totals, recent activity, chart range, and
  category/calendar summaries.

**Acceptance criteria:**

- The initial dashboard does not request an unbounded historical dataset.
- Recent activity remains paginated or bounded.
- Chart and summary ranges return the same totals as the existing logic.
- Cache-paint behavior remains intact.

**Verification:**

- Network inspection confirms bounded queries.
- Comparison tests verify old and new aggregations on the same fixture data.

**Dependencies:** Task 3

**Estimated scope:** Medium

### Checkpoint: Data trust

- [ ] Financial calculation tests pass
- [ ] Dashboard and accounts agree on balances
- [ ] FX failures cannot produce success-shaped exact figures
- [ ] Dashboard queries are bounded

### Phase 3: Rebuild the dashboard around one job

#### Task 6: Define the dashboard information hierarchy

**Description:** Reorder dashboard content around the selected primary question
instead of adding another visual skin.

**Acceptance criteria:**

- First view shows the primary amount, its definition, and the next action.
- The explanation shows the inputs that produced the amount.
- Upcoming commitments and recent activity are prioritized before deep analysis.
- Chart, calendar, mix, and account detail are secondary.

**Verification:**

- A new user can identify the primary amount and action within five seconds.
- Desktop and 390px mobile wireframes are reviewed before implementation.

**Dependencies:** Checkpoint: Data trust

**Estimated scope:** Small

#### Task 7: Implement trustworthy primary amount states

**Description:** Build the primary dashboard panel with normal, over-budget,
missing-budget, unavailable-rate, loading, error, and empty-account states.

**Acceptance criteria:**

- Over-budget state says how much the budget was exceeded.
- The basis and freshness of converted values are visible.
- Retry is available for recoverable failures.
- Privacy masking preserves the amount container width.

**Verification:**

- Component tests cover every state.
- Browser screenshots cover light/dark and 390/768/1280 widths.

**Dependencies:** Tasks 3, 4, 6

**Estimated scope:** Medium

#### Task 8: Unify the primary transaction action

**Description:** Make "Add transaction" the stable action and present expense,
income, and transfer as clear choices while retaining recurring bill actions
as a distinct "Pay bill" action.

**Acceptance criteria:**

- Header, mobile dock, and dashboard use the same action label.
- Expense, income, transfer, and pay-bill flows remain distinguishable.
- Every action is keyboard accessible and has an accessible name.

**Verification:**

- Browser keyboard walkthrough.
- Browser test confirms each choice routes to the correct form.

**Dependencies:** Task 6

**Estimated scope:** Medium

### Phase 4: Make the product understandable on first use

#### Task 9: Design first-run and empty states

**Description:** Replace unexplained zeroes and blank dashboard sections with a
short setup path for accounts, budget, first transaction, and recurring bills.

**Acceptance criteria:**

- No-account state tells the user exactly what to do.
- No-budget state explains what is missing and links to setup.
- No-transaction state offers the first relevant action.
- Empty charts explain why there is no data.

**Verification:**

- Test fixtures cover each setup stage.
- Manual walkthrough from a fresh account has no dead ends.

**Dependencies:** Task 7

**Estimated scope:** Medium

#### Task 10: Simplify recurring and FX language

**Description:** Hide schedule-chain and rate-resolution complexity behind plain
language explanations appropriate for everyday users.

**Acceptance criteria:**

- Recurring UI uses due date, amount, frequency, and payment mode language.
- Advanced occurrence/timeline details remain available but secondary.
- Converted figures state their rate basis in plain language.

**Verification:**

- Copy review against the mobile behavior audit.
- Browser walkthrough of late payment, skip, undo, and converted totals.

**Dependencies:** Tasks 1, 2, 7

**Estimated scope:** Medium

### Phase 5: Consolidate the frontend architecture

#### Task 11: Split dashboard orchestration from presentation

**Description:** Decompose the large overview page into a dashboard data hook,
pure calculations, and focused visual sections without changing behavior.

**Acceptance criteria:**

- The page component primarily composes sections.
- Business calculations are not duplicated in presentation components.
- Each extracted section has one clear responsibility.
- No unrelated visual redesign is included.

**Verification:**

- Typecheck and tests pass before and after extraction.
- Browser screenshots are unchanged except for intended hierarchy changes.

**Dependencies:** Tasks 3–7

**Estimated scope:** Medium

#### Task 12: Stabilize navigation and responsive order

**Description:** Use one stable desktop navigation model and a deliberate
mobile order instead of compressing the desktop dashboard.

**Acceptance criteria:**

- Desktop navigation does not depend on hover to reveal primary labels.
- Mobile order is: primary amount, explanation, add action, commitments,
  activity, chart, accounts, analysis.
- No horizontal overflow at 320px or 390px.
- Floating navigation does not cover actionable content.

**Verification:**

- Browser keyboard navigation.
- Screenshots at 320, 390, 768, 1024, and 1440px.
- Overflow check passes for light and dark themes.

**Dependencies:** Task 6

**Estimated scope:** Medium

### Final checkpoint: Dashboard clarity release

- [ ] Financial terms are unambiguous
- [ ] Primary amount is trustworthy and explainable
- [ ] Empty/error/loading states guide the user
- [ ] Dashboard and account totals agree
- [ ] Browser and unit tests pass
- [ ] Mobile overflow and keyboard checks pass
- [ ] Design system is frozen and no new visual skin is introduced
- [ ] Final code review completed

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Safe-to-spend scope expands into a backend/schema project | High | Ship budget remaining first unless commitments are explicitly approved |
| FX rules change existing totals | High | Add fixture comparisons before changing calculation code |
| Dashboard query splitting causes inconsistent snapshots | High | Use one load timestamp and compare aggregate fixtures |
| UI rewrite changes mobile behavior | Medium | Preserve mobile audit behavior and test at phone widths |
| More visual iteration recreates the same confusion | High | Freeze tokens and review hierarchy before styling |

## Open questions

- Should the first release call the number "Budget remaining" or implement a
  true commitment-aware "Safe to spend" calculation?
- Should account balances include a user-configurable minimum cash buffer?
- Should investment and credit-card accounts be included in the primary liquid
  balance?
