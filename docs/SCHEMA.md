# SCHEMA.md — SpendFlow database schema

> ⚠️ **Provenance**: Supabase CLI is not installed on this machine, so this file is derived from the
> **34 committed SQL migrations** in the mobile repo (`supabase/migrations/`), read in order on
> 2026-09-12 — this is the real applied DDL, not guesswork. It is **not yet** the output of
> `supabase gen types typescript`. Once the CLI is linked (`supabase link --project-ref
> stisbfahlhquaqhrifjh`), run `scripts/sync-supabase-types.mjs` and replace/augment this file with
> the generated types + verify no drift. Column-level details below are the contract for web code.

## public.users
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | — | PK, FK → auth.users(id) ON DELETE CASCADE |
| email | text | — | UNIQUE NOT NULL |
| display_name | text | NULL | |
| avatar_url | text | NULL | |
| preferred_currency | text | 'NPR' | NOT NULL, CHECK `^[A-Z]{3}$` |
| theme_preference | text | 'system' | CHECK in (light, dark, system) |
| monthly_budget | numeric(12,2) | NULL | Stored once with its own budget currency; display conversion only |
| cycle_start_day | integer | 1 | NOT NULL, CHECK 1–31 (**1 = standard calendar cycle sentinel**; 29–31 valid) |
| cycle_end_day | integer | NULL | CHECK null or 1–31 |
| deletion_pending | boolean | false | Server-managed (deletion state machine) |
| created_at / updated_at | timestamptz | now() | NOT NULL |

Triggers: set_updated_at; block_writes_during_deletion.

## public.categories
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| user_id | uuid | — | NOT NULL, FK users CASCADE |
| name | text | — | NOT NULL, UNIQUE (user_id, name) |
| icon | text | — | NOT NULL |
| color | text | — | NOT NULL, CHECK `^#[0-9A-Fa-f]{6}$` |
| is_custom | boolean | false | NOT NULL |
| budget_monthly | numeric | NULL | |
| type | text | 'expense' | CHECK in (expense, income) |
| created_at | timestamptz | now() | NOT NULL |

FK note: `expenses.category_id` and `recurring_rules.category_id` are **ON DELETE RESTRICT** — clients must reassign to a fallback category before delete (mobile does).

## public.expenses
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| user_id | uuid | — | NOT NULL, FK users CASCADE |
| category_id | uuid | — | NOT NULL, FK categories RESTRICT |
| amount | numeric | — | NOT NULL, CHECK > 0 AND ≤ 1e12 |
| currency | text | 'NPR' | CHECK `^[A-Z]{3}$` |
| description | text | NULL | |
| date | date | — | NOT NULL, CHECK 2000-01-01 ≤ date ≤ current_date + 1 |
| time | time | NULL | |
| payment_method | text | 'Cash' | CHECK in (Cash, Card, UPI, Other) |
| notes | text | NULL | |
| receipt_image_url | text | NULL | Storage **path** in private `receipts` bucket |
| is_recurring | boolean | false | NOT NULL |
| recurring_rule_id | uuid | NULL | FK recurring_rules SET NULL |
| is_synced | boolean | false | NOT NULL |
| deleted_at | timestamptz | NULL | Soft delete |
| bank_account_id | uuid | NULL | FK bank_accounts SET NULL |
| client_sync_id | text | NULL | Unique index intentionally dropped (future offline queue hook) |
| exchange_rate_to_usd | numeric(14,8) | NULL | CHECK null or > 0 (NOT VALID) |
| base_currency | text | 'USD' | CHECK null or `^[A-Z]{3}$` |
| type | text | 'expense' | CHECK in (expense, income) |
| search_vector | tsvector | generated (description + notes, english) STORED | GIN indexed |
| created_at / updated_at | timestamptz | now() | NOT NULL |

Indexes: `(user_id, date DESC) WHERE deleted_at IS NULL` (live list), `(user_id, deleted_at)`, `(category_id)`, GIN(search_vector), **UNIQUE (recurring_rule_id, date)** (recurring upsert conflict target).

## public.recurring_rules
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| user_id | uuid | — | NOT NULL, FK users CASCADE |
| category_id | uuid | — | NOT NULL, FK categories RESTRICT |
| amount | numeric | — | NOT NULL, CHECK > 0 AND ≤ 1e12 |
| currency | text | 'NPR' | CHECK `^[A-Z]{3}$` |
| description | text | NULL | |
| payment_method | text | 'Cash' | CHECK in (Cash, Card, UPI, Other) |
| frequency | text | — | CHECK in (daily, weekly, monthly, custom) |
| next_due_date | date | — | NOT NULL, CHECK ≥ 2000-01-01 |
| is_active | boolean | true | NOT NULL |
| bank_account_id | uuid | NULL | ⚠️ **in migration but never applied live — column may not exist** |
| exchange_rate_to_usd / base_currency | | | FX snapshot columns (nullable) |
| created_at / updated_at | timestamptz | now() | NOT NULL |

Index: `(user_id, next_due_date) WHERE is_active`.

## public.bank_accounts
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| user_id | uuid | — | NOT NULL, FK auth.users CASCADE |
| name | text | — | NOT NULL |
| account_type | text | 'bank' | CHECK in (bank, wallet, cash, credit_card, savings, investment, other) |
| currency | text | 'NPR' | CHECK `^[A-Z]{3}$` |
| initial_balance | numeric(14,2) | 0.00 | NOT NULL |
| current_balance | numeric(14,2) | 0.00 | NOT NULL (live balances are *computed* client-side from expenses+transfers) |
| color | text | '#10B981' | NOT NULL |
| icon | text | '🏦' | NOT NULL |
| account_number_last4 | text | NULL | |
| is_default | boolean | false | Partial unique: one per user WHERE is_default AND NOT deleted |
| country | text | NULL | ISO-2, no CHECK |
| created_at / updated_at | timestamptz | timezone('utc', now()) | NOT NULL |
| deleted_at | timestamptz | NULL | Soft delete |

## public.transfers
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| user_id | uuid | — | NOT NULL, FK auth.users CASCADE |
| from_account_id / to_account_id | uuid | — | NOT NULL, FK bank_accounts RESTRICT |
| amount | numeric(14,2) | — | NOT NULL, CHECK > 0 |
| from_currency / to_currency | text | — | CHECK `^[A-Z]{3}$` |
| exchange_rate | numeric(18,8) | 1 | NOT NULL, CHECK > 0 (locked at creation) |
| converted_amount | numeric(14,2) | — | CHECK `abs(converted_amount − amount×rate) ≤ 0.05` |
| fee | numeric(14,2) | 0.00 | CHECK ≥ 0 |
| date | date | — | CHECK 2000-01-01 → today+1 |
| time | time | NULL | |
| notes | text | NULL | |
| created_at / updated_at | timestamptz | timezone('utc', now()) | NOT NULL |
| deleted_at | timestamptz | NULL | Soft delete |

CHECK `from_account_id <> to_account_id`.

## public.exchange_rates
| Column | Type | Default |
|---|---|---|
| currency | text | PK part |
| date | date | PK part |
| rate_to_usd | numeric(14,8) | NOT NULL, CHECK > 0 (NOT VALID) |
| fetched_at | timestamptz | now() |
| source | text | NULL ('backfill', provider names) |

Clients: **read-only**. QAR/AED/SAR pegged (never stored/fetched); NPR = INR/1.6 derived.

## public.market_gold_rates
| Column | Type | Default |
|---|---|---|
| id | uuid | gen_random_uuid(), PK |
| rate_date | date | NOT NULL, UNIQUE (rate_date, country_code) |
| country_code | text | 'NP' |
| currency_code | text | 'NPR' |
| fine_gold_per_tola | numeric | NOT NULL |
| fine_gold_per_10g, tejabi_gold_per_tola, tejabi_gold_per_10g, silver_per_tola, silver_per_10g | numeric | NULL |
| source | text | 'FENEGOSIDA' |
| source_url, fetch_source | text | fetch_source NOT NULL |
| market_authority | text | 'FENEGOSIDA' |
| fetched_at / published_at | timestamptz | now() / NULL |
| status | text | 'verified' |
| created_at / updated_at | timestamptz | now() |

## public.user_settings_history (append-only)
| Column | Type | Default | Constraints |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| user_id | uuid | — | FK users CASCADE |
| effective_from | date | — | NOT NULL, UNIQUE (user_id, effective_from); insert trigger: only `1900-01-01` baseline or current-month ≤ today |
| monthly_budget | numeric | NULL | |
| cycle_start_day | integer | 1 | CHECK 1–31 |
| cycle_end_day | integer | NULL | CHECK null or 1–31 |
| budget_currency | text | NULL | CHECK null or `^[A-Z]{3}$` |
| created_at | timestamptz | now() | NOT NULL |

UPDATE policy: only baseline row or rows from current month; WITH CHECK effective_from ≤ today. DELETE revoked.

## public.category_budget_history (append-only)
| Column | Type | Default |
|---|---|---|
| id | uuid | gen_random_uuid(), PK |
| user_id | uuid | FK users CASCADE |
| category_id | uuid | FK categories CASCADE |
| effective_from | date | NOT NULL (same insert trigger rules) |
| budget_monthly | numeric | NULL |
| created_at | timestamptz | now() |

## public.device_tokens (mobile push — web can ignore)
id uuid PK · user_id FK auth.users CASCADE · expo_push_token text UNIQUE NOT NULL · platform / device_name text NULL · timestamps.

## public.notifications
id uuid PK · user_id FK auth.users CASCADE · type / title / body text NOT NULL · data jsonb NULL · is_read boolean false · created_at timestamptz timezone('utc', now()).
Indexes: (user_id, created_at DESC); (user_id) WHERE NOT is_read.

## public.security_otp_sends (service-role only)
user_id FK public.users CASCADE + purpose ('account_deletion'|'email_change') composite PK · last_sent_at timestamptz NOT NULL.

## Full RLS policy listing
See **[SUPABASE.md](./SUPABASE.md) §1** — all 40+ policies are enumerated there (owner-scope expressions, the two read-only reference tables, the zero-policy OTP table, and revoked DELETEs).

## Known live drift (documented in migrations themselves)
1. `recurring_rules.bank_account_id` — never applied live; do not write it.
2. `transfers_distinct_accounts` + `transfers_fee_nonnegative_check` — had drifted, re-asserted in migration 34; assume present.
3. Storage size/MIME limits — migration 29 is the effective final state (receipts 4 MiB private, avatars 2 MiB public).
4. `security_otp_sends.user_id` references `public.users`, not `auth.users` (unlike device_tokens/notifications).
