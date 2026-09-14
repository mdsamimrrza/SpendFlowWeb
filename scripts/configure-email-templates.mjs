#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// configure-email-templates.mjs — push the redesigned emails/ templates +
// subject lines into the Supabase project's Auth config (Management API).
//
// Why the API instead of the dashboard: each dashboard tab hides a
// "Customize message" toggle and the password-reset template is labelled
// "Recovery" — easy to paste into the wrong place and still send defaults.
// This writes the config fields directly and verifies the read-back.
//
// Field-name portability: Supabase stores template HTML under
// mailer_templates_<k>_new (current) or mailer_templates_<k>_content (legacy)
// depending on API version. Detection reads both; the POST tries _new first
// and falls back to _content on a 4xx.
//
// Mapping (emails/README.md):
//   confirm-signup.html  → confirmation / subjects_confirmation
//   reset-password.html  → recovery     / subjects_recovery
//   security-code.html   → magic_link   / subjects_magic_link
//   change-email.html    → email_change / subjects_email_change
//
// Usage:
//   node scripts/configure-email-templates.mjs --check          # read-only report
//   node scripts/configure-email-templates.mjs --dump           # raw mailer_* keys
//   node scripts/configure-email-templates.mjs --token sbp_xxx  # APPLY
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...parseEnv(readFileSync(resolve(ROOT, '.env'), 'utf8')), ...process.env };
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
if (!projectUrl) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(1);
}
const ref = new URL(projectUrl).hostname.split('.')[0];

const read = (f) => readFileSync(resolve(ROOT, 'emails', f), 'utf8');
const KEYS = ['confirmation', 'recovery', 'magic_link', 'email_change'];
const HTML = {
  confirmation: read('confirm-signup.html'),
  recovery: read('reset-password.html'),
  magic_link: read('security-code.html'),
  email_change: read('change-email.html'),
};
const SUBJECTS = {
  confirmation: 'Confirm your email for SpendFlow',
  recovery: 'Reset your SpendFlow password',
  magic_link: 'Your SpendFlow security code',
  email_change: 'Confirm your new SpendFlow email address',
};

// Sanity: the magic-link template MUST carry the OTP code variable.
if (!HTML.magic_link.includes('{{ .Code }}')) {
  console.error('✗ security-code.html is missing {{ .Code }} — OTP flows would break. Aborting.');
  process.exit(1);
}
for (const k of KEYS) {
  if (!HTML[k].includes('{{ .ConfirmationURL }}') && k !== 'magic_link') {
    console.error(`✗ ${k} template is missing {{ .ConfirmationURL }}. Aborting.`);
    process.exit(1);
  }
}

const buildPayload = (suffix) =>
  Object.fromEntries(
    KEYS.flatMap((k) => [
      [`mailer_subjects_${k}`, SUBJECTS[k]],
      [`mailer_templates_${k}_${suffix}`, HTML[k]],
    ]),
  );

const args = process.argv.slice(2);
const getToken = async () => {
  const flagIdx = args.indexOf('--token');
  if (flagIdx !== -1 && args[flagIdx + 1]) return args[flagIdx + 1];
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const token = await new Promise((res) => {
    rl.on('close', () => res(''));
    rl.question('\nSupabase access token (dashboard → Account → Tokens): ', res);
  });
  return token.trim();
};

async function mgmt(token, method, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error pages */ }
  return { ok: res.ok, status: res.status, json, text };
}

const templateOf = (cfg, k) =>
  cfg[`mailer_templates_${k}_content`] || cfg[`mailer_templates_${k}_new`] || '';

const brief = (cfg) =>
  Object.fromEntries(
    KEYS.map((k) => {
      const t = templateOf(cfg, k);
      const isCustom = /spendflow/i.test(t);
      return [k, {
        subject: cfg[`mailer_subjects_${k}`],
        custom: isCustom ? `yes (${t.length} chars)` : t ? `NO — wrong content (${t.slice(0, 40)}…)` : 'NO — sending default',
      }];
    }),
  );

async function main() {
  console.log(`Project: ${ref}`);
  const token = await getToken();
  if (!token) {
    console.error('✗ No access token supplied.');
    process.exit(1);
  }

  const cur = await mgmt(token, 'GET');
  if (!cur.ok) {
    console.error(`✗ GET /config/auth → ${cur.status}: ${cur.text.slice(0, 300)}`);
    console.error('  (401 = bad/expired token · 403 = token lacks access · check you pasted the FULL sbp_ token)');
    process.exit(1);
  }
  console.log('\nCurrent state:');
  console.log(JSON.stringify(brief(cur.json), null, 2));

  if (args.includes('--dump')) {
    console.log('\nRaw mailer_* keys in the API response:');
    for (const [k, v] of Object.entries(cur.json)) {
      if (!k.startsWith('mailer_')) continue;
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      console.log(`  ${k}: ${s.length > 60 ? `${s.slice(0, 60)}… (${s.length} chars)` : s}`);
    }
    return;
  }
  if (args.includes('--check')) {
    console.log('\n--check: no changes made. Re-run WITHOUT --check to apply.');
    return;
  }

  // This project's API version stores template HTML in the legacy _content
  // fields; _new writes are silently dropped. Push _content first.
  console.log('\nPushing 4 templates + subjects (PATCH _content fields)…');
  let post = await mgmt(token, 'PATCH', buildPayload('content'));
  let used = '_content';
  if (!post.ok) {
    console.log(`  _content rejected (${post.status}): ${post.text.slice(0, 200)}`);
    console.log('  Retrying with _new fields…');
    post = await mgmt(token, 'PATCH', buildPayload('new'));
    used = '_new';
  }
  if (!post.ok) {
    console.error(`✗ POST failed too (${post.status}): ${post.text.slice(0, 400)}`);
    console.error('  Paste this error back here so I can adapt the script.');
    process.exit(1);
  }

  const after = await mgmt(token, 'GET');
  const state = brief(after.ok ? after.json : post.json);
  console.log(`Applied via ${used}. Read-back:`);
  console.log(JSON.stringify(state, null, 2));

  const allCustom = Object.values(state).every((v) => v.custom.startsWith('yes'));
  console.log(
    allCustom
      ? '\n✓ All four auth emails are now custom. Trigger a real Forgot-password to see it.'
      : '\n✗ Some templates did not take — run with --dump and paste the output.',
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
