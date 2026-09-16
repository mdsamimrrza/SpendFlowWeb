"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// `||` not `??`: a present-but-blank env var (a deployer adding the key with an
// empty value) must fall back to the fail-closed sentinel, not build "" clients.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://missing-supabase-config.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-supabase-key";

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Cookie-backed browser client (@supabase/ssr — the web equivalent of
 * mobile's chunked SecureStore adapter). The session cookies are readable
 * from JS BY DESIGN (docs/SECURITY.md §2 — no-BFF anon-key architecture);
 * NV-9: `secure` is set explicitly because @supabase/ssr's defaults emit no
 * Secure attribute (dev on http://localhost keeps it off so cookies persist).
 * Anon key only; RLS is the security boundary (docs/SECURITY.md).
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
    });
  }
  return browserClient;
}
