#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// configure-smtp.mjs — apply custom SMTP to the shared Supabase project.
//
// All auth emails (signup confirm, password reset, security OTP via the
// send-security-otp edge function → GoTrue /auth/v1/otp) are sent by the
// Supabase Auth server. Enabling SMTP here makes ALL of them go out from the
// custom mailbox — for both the web and mobile clients, instantly, no deploys.
//
// Credentials are read from the repo's local .env (gitignored):
//   EMAIL_SERVER_HOST / EMAIL_SERVER_PORT / EMAIL_SERVER_USER /
//   EMAIL_SERVER_PASSWORD / EMAIL_FROM ("Display Name <a@b.c>")
// plus NEXT_PUBLIC_SUPABASE_URL for the project ref. The Supabase Management
// API needs a PERSONAL ACCESS TOKEN (dashboard → Account → Tokens), which is
// supplied via --token, env SUPABASE_ACCESS_TOKEN, or an interactive prompt.
// It is never written to disk or echoed back.
//
// Usage:
//   node scripts/configure-smtp.mjs --check                 # show current state (no token needed for URL/ref display)
//   node scripts/configure-smtp.mjs --apply --token sbp_xxx
//   node scripts/configure-smtp.mjs --test you@example.com  # send a real recovery mail through GoTrue
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

// Parse EMAIL_FROM: "SpendFlow <a@b.c>" → sender name + address
const fromRaw = env.EMAIL_FROM || env.EMAIL_SERVER_USER;
let senderName = '', adminEmail = fromRaw;
const m = fromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
if (m) {
  senderName = m[1].replace(/^["']|["']$/g, '');
  adminEmail = m[2];
}

for (const [k, v] of Object.entries({
  EMAIL_SERVER_HOST: env.EMAIL_SERVER_HOST,
  EMAIL_SERVER_PORT: env.EMAIL_SERVER_PORT,
  EMAIL_SERVER_USER: env.EMAIL_SERVER_USER,
  EMAIL_SERVER_PASSWORD: env.EMAIL_SERVER_PASSWORD,
})) {
  if (!v) {
    console.error(`✗ ${k} missing from .env`);
    process.exit(1);
  }
}

const smtpConfig = {
  smtp_host: env.EMAIL_SERVER_HOST,
  smtp_port: parseInt(env.EMAIL_SERVER_PORT, 10),
  smtp_user: env.EMAIL_SERVER_USER,
  smtp_pass: env.EMAIL_SERVER_PASSWORD,
  smtp_admin_email: adminEmail,
  smtp_sender_name: senderName || 'SpendFlow',
};

console.log(`Project: ${ref} (${projectUrl})`);
console.log(`SMTP:    ${smtpConfig.smtp_host}:${smtpConfig.smtp_port} as ${smtpConfig.smtp_user}`);
console.log(`From:    "${smtpConfig.smtp_sender_name}" <${smtpConfig.smtp_admin_email}>`);
if (smtpConfig.smtp_user !== smtpConfig.smtp_admin_email) {
  console.log('⚠ Gmail rejects relaying when the From address differs from the SMTP user.');
}

const args = process.argv.slice(2);
const getToken = async () => {
  const flagIdx = args.indexOf('--token');
  if (flagIdx !== -1 && args[flagIdx + 1]) return args[flagIdx + 1];
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const token = await new Promise((res) => {
    rl.on('close', () => res(''));
    rl.question('\nSupabase access token (dashboard → Account → Tokens, starts with sbp_): ', res);
  });
  rl.close();
  return token.trim();
};

async function mgmt(token, method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(body ? {} : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.status === 204 ? null : res.json();
}

const summarize = (cfg) => ({
  smtp_host: cfg.smtp_host || '(empty → Supabase built-in mailer)',
  smtp_port: cfg.smtp_port,
  smtp_user: cfg.smtp_user || '(empty)',
  smtp_admin_email: cfg.smtp_admin_email,
  smtp_sender_name: cfg.smtp_sender_name,
});

async function main() {
  if (args.includes('--test')) {
    const email = args[args.indexOf('--test') + 1];
    if (!email || !email.includes('@')) {
      console.error('✗ --test requires a recipient: node scripts/configure-smtp.mjs --test you@example.com');
      process.exit(1);
    }
    // Real end-to-end probe: password-recovery mail for `email` through the
    // project's GoTrue (anon key only, same path a user's "Forgot password"
    // click takes). If it lands in the inbox, every auth email now flows from
    // the custom mailbox.
    const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await fetch(`${projectUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ email }),
    });
    const body = await res.text();
    console.log(`POST /auth/v1/recover → ${res.status}`);
    console.log('GoTrue always returns 200 to avoid account enumeration; check the inbox.');
    if (res.ok && body) console.log(`response: ${body.slice(0, 200)}`);
    return;
  }

  const token = await getToken();
  if (!token) {
    console.error('✗ No access token supplied.');
    process.exit(1);
  }

  const current = await mgmt(token, 'GET', '/config/auth');
  console.log('\nCurrent SMTP state:');
  console.log(JSON.stringify(summarize(current), null, 2));

  if (args.includes('--check')) {
    console.log('\n--check: no changes made.');
    return;
  }

  console.log('\nApplying custom SMTP config…');
  const updated = await mgmt(token, 'PATCH', '/config/auth', smtpConfig);
  console.log('New SMTP state:');
  console.log(JSON.stringify(summarize(updated ?? await mgmt(token, 'GET', '/config/auth')), null, 2));

  const ok = updated && updated.smtp_host === smtpConfig.smtp_host;
  console.log(ok ? '\n✓ SMTP configured — all auth emails now send via this mailbox.' : '\n✗ Read-back mismatch; inspect the state above.');
  if (ok) {
    console.log('Next: verify delivery with a real email:');
    console.log(`  node scripts/configure-smtp.mjs --test you@example.com`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
