"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://missing-supabase-config.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "missing-supabase-key";

export const isSupabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined;

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Cookie-backed browser client (httpOnly session cookies via @supabase/ssr —
 * the web equivalent of mobile's chunked SecureStore adapter). Anon key only;
 * RLS is the security boundary (docs/SECURITY.md).
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}
