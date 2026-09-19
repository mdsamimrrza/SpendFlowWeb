# SYNC-STRATEGY.md — How mobile and web stay in sync

Shared backend, two clients, no realtime today. This doc defines the sync model web v1 uses and
what would change if that ever does.

## 1. Source of truth

**Supabase Postgres is the single source of truth.** Everything else — AsyncStorage on mobile,
localStorage on web — is a disposable read cache. No client ever invents state that isn't derivable
from the DB.

## 2. Current mobile model (keep on web)

The mobile app uses **cache-then-network with zero realtime subscriptions**:

1. **Paint cache instantly** → per-user AsyncStorage caches keyed by user id (`@spendflow_expense_cache_<uid>`, accounts, transfers, recurring rules, categories, profile).
2. **Refresh from network** → throttled (30 s on tab focus), in-flight deduped.
3. **In-memory listener sets** (`notifyExpensesChanged()`) → cross-screen freshness within one app session.
4. **FX snapshots on rows** → each expense/transfer stores its rate at creation (`exchange_rate_to_usd`, `base_currency`); historical views are computed from snapshots, *not* from today's rates. Web must reproduce this or historical numbers will differ from mobile.
5. **Cross-device freshness** arrives via Expo push notifications ("an expense changed on another device") — a nudge to refetch, not data sync.

Web v1 ports this 1:1 with localStorage (or IndexedDB) replacing AsyncStorage and the same listener
pattern inside React context. No Supabase realtime subscription is required for parity.

## 3. Realtime vs polling — decision

| Option | Verdict |
|---|---|
| Supabase Realtime (`postgres_changes`) | **Not for v1.** It would require adding tables to the `supabase_realtime` publication (a backend change affecting both clients), and mobile doesn't consume it — the two apps could show different data anyway. Revisit only if the user asks for multi-tab live sync on web. |
| Polling / refresh-on-focus (chosen) | Matches mobile behavior exactly; 30 s throttle + refetch on window focus + listener-triggered refetch after local mutations. |

**Rule: web never fetches *more* eagerly than mobile.** If web shows data mobile wouldn't show yet,
that's a product inconsistency, not a feature.

## 4. Conflict resolution

- **No offline mutation queue exists** (it was removed from mobile; `client_sync_id`'s unique index was deliberately dropped). All writes are online-only on both clients → the classic multi-writer conflict surface is small.
- **Last-write-wins per row** for concurrent edits of the same expense/rule/account (whole-row UPDATE). Acceptable: the window is tiny and financial rows are short-lived edits.
- **Append-only tables** (`user_settings_history`, `category_budget_history`) can't conflict — inserts only, UNIQUE `(user_id, effective_from)`; the DB trigger rejects backdated inserts.
- **Transfers** are insert-only (rate locked at creation); no update path exists.
- **Soft deletes** (`deleted_at`) mean a stale client re-save after a delete on another device resurrects nothing — updates target live rows and RLS/`deleted_at` filters keep deleted rows invisible. Web must filter `deleted_at IS NULL` exactly like mobile's queries do.

## 5. Offline behavior

| | Mobile | Web v1 |
|---|---|---|
| Reads while offline | Cached data paints with "estimated rates" notices | localStorage cache paints the same way; show the same `rates_estimated_notice` semantics |
| Writes while offline | **Rejected** (online-only; no queue) | Rejected (buttons disabled / error toast on failure). Do **not** add a mutation queue on web — it would break parity with mobile |
| FX rates offline | Peg constants → cached snapshot → hardcoded fallbacks | Same fallback chain (port `FALLBACK_UNITS_PER_USD` / PEGGED tables verbatim) |
| Bullion offline | 24 h history cache, session-fixed rates cached per day | Same TTL caches |

## 6. What must stay byte-compatible between clients

1. **FX snapshot semantics** — `services/exchange.ts` tier order (pegs → cache → table → API → fallback) and stamping on create. Web refinement 2026-09-16: UNDATED (current-rate) requests are API-first (frankfurter → er-api) and the table only answers when both APIs are unreachable — clients can no longer write `exchange_rates` (SELECT-only by RLS) and no refresh job exists, so any freshness allowance still eventually serves a frozen rate (a 3-day gate leaked in testing the same day). Dated (historical) lookups keep the byte-compat order exactly; **mobile converged 2026-09-19** — mobile `getRate()` now routes date ≥ today through the same API-first order (frankfurter `.dev` first, then the er-api live snapshot, then the table as an offline fallback of any age) and keeps the table-first byte-compat order for dated lookups; the retired frankfurter `.app` host was demoted below `.dev`.
2. **Budget/cycle math** — `getMonthlyBudget()` conversion (budget_currency → display currency, never rewriting storage), cycle window from `cycle_start_day` (1 = calendar sentinel, 2–31 custom).
3. **Bullion calibrations** — FENEGOSIDA multipliers (fine gold 1.20649, Tejabi 92.5588 %, silver 1.22765) and IBJA (1.0918, 22K 91.67 %), session fixing times.
4. **Recurring generation** — idempotent `ON CONFLICT (recurring_rule_id, date)` upsert, forward-only `next_due_date`.
5. **Balance computation** — `computeAccountBalances` formula (initial + Σ income − Σ expenses ± transfers) computed client-side from the same rows.
6. **i18n keys** — same key names in `constants/i18n/` so translations stay synchronized across all three languages.

## 7. If realtime is ever added

Migration in the mobile repo's `supabase/migrations/` (e.g. add `expenses`, `transfers`, `bank_accounts` to the publication) → update `SUPABASE.md` + this doc → decide whether mobile also subscribes or keeps push-nudges → remember Realtime bypasses nothing: RLS still applies to realtime payloads.
