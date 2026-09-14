# SpendFlow auth email templates

Redesigned HTML for the four Supabase Auth emails SpendFlow actually sends. These live in the
**Supabase project** (Dashboard → Authentication → **Email Templates**), not in the app — one set
serves **both** web and mobile, and editing them needs no deploy.

| File | Dashboard template (may be labelled) | Subject line to paste | Variables used |
|---|---|---|---|
| `confirm-signup.html` | Confirm signup / Sign Up Confirmation | `Confirm your email for SpendFlow` | `{{ .ConfirmationURL }}` `{{ .Email }}` |
| `reset-password.html` | Reset password / Recovery | `Reset your SpendFlow password` | `{{ .ConfirmationURL }}` `{{ .Email }}` |
| `security-code.html` | **Magic Link** (also listed as "One-tap sign in" / "Magic link & OTP") | `Your SpendFlow security code` | `{{ .Code }}` `{{ .ConfirmationURL }}` |
| `change-email.html` | Change email address | `Confirm your new SpendFlow email address` | `{{ .ConfirmationURL }}` `{{ .Email }}` `{{ .NewEmail }}` |

Unused templates (Invite user, Verify identity, …): leave at defaults — SpendFlow never triggers them.

## How to apply

1. Supabase Dashboard → your project → **Authentication → Email Templates**.
2. Pick the template, paste the **subject** from the table into the Subject field, and the file's
   full HTML into the body editor (switch the editor to HTML/code view if it shows rich text).
3. Save each one. No deploy, no restart — the next email GoTrue sends uses it immediately.
4. Verify with real flows: `node scripts/configure-smtp.mjs --test you@example.com` (renders the
   *reset* template), sign up a throwaway account (confirm template), start account deletion in
   the app (security-code template — check the 8-digit code is legible on a phone; live
   `mailer_otp_length` is 8, `mailer_otp_exp` 3600 s).
5. Or skip the dashboard entirely (recommended — no hidden toggles):
   `node scripts/configure-email-templates.mjs --token sbp_xxx` pushes all four templates +
   subjects via the Management API and verifies the read-back. Live-project quirks the script
   handles: updates are **PATCH** (POST returns 404) and this project stores bodies in the
   legacy `mailer_templates_*_content` fields (`_new` writes are silently dropped).

Alternative (CLI-free but scriptable): these same fields exist as `mailer_subjects_*` /
`mailer_templates_*` on the Management API `POST /v1/projects/{ref}/config/auth` — same body as
`scripts/configure-smtp.mjs` uses. Ask an agent to wire that up if you want templated changes
version-controlled end-to-end.

## Hard rules when editing

- **`security-code.html` must keep `{{ .Code }}`.** The `send-security-otp` flow (account
  deletion, email change) is code-typed in BOTH apps — drop the code from this template and those
  flows break silently. The fallback `{{ .ConfirmationURL }}` link is optional.
- Keep `{{ .ConfirmationURL }}` intact in the other three (single GoTrue-built URL — never
  hand-assemble auth URLs; the redirect allowlist in docs/SUPABASE.md §7 is baked into it).
- Email HTML constraints: table layout, inline styles only, no external images (clients block
  them), no `<style>` blocks, 560 px max width rendered **fluid on phones** — the container table
  uses `width="100%"` + inline `max-width:560px` (a fixed `width="560"` attribute overflows at
  390 px because tables ignore `max-width:100%`), system font stack. The brand "S" seal is
  rendered as a styled table cell for that reason. Re-check with
  `node .smoke/shot-emails.mjs` (390 + 800 px, overflow must be 0).
- Design source of truth: web **Neo palette** — porcelain `#f3f5f3` page, white card, emerald
  `#0b8457` primary action, near-black `#0a0d0c` headings. No emoji / no text-glyph icons
  (AGENTS.md brand rule; arrows/entities like `&rarr;` in body copy are fine).
- Templates are English-only (single shared set; Supabase can't localize per user without custom
  JWT metadata — a deliberate, recorded simplification, not an omission).

## Flow map (why four)

- Sign up → **Confirm signup** → link lands on `/auth/callback` (bare allowlisted target).
- Forgot password → **Reset password** → link lands on `/auth/callback?type=recovery` →
  `/profile?recovery=1` set-new-password modal.
- Profile email change / account deletion → app sends OTP → **Magic Link template** carries the
  6-digit code (sent to the CURRENT email). Email change then also fires **Change email address**
  to the NEW email. Deletion additionally requires the code to mint a ≤10 min session.
