/**
 * Auth service — mirrors mobile services/auth.ts semantics (docs/00-EXISTING-APP-AUDIT.md §5).
 * Session storage differs by platform (cookies via @supabase/ssr instead of
 * SecureStore); flows and guards match.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile, ProfileInsert, ProfileUpdate } from "@/types/database.types";
import { DEFAULT_CATEGORIES } from "@/constants/categories";

export async function signInWithEmail(
  supabase: SupabaseClient<Database>,
  email: string,
  password: string,
) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(
  supabase: SupabaseClient<Database>,
  email: string,
  password: string,
  displayName: string,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      // Audit P2-6: confirmation links must land on the one redirect target
      // this project's allowlist documents (docs/SUPABASE.md §7) — anything
      // else gets silently rewritten to the mobile deep link. Bare path so the
      // allowlist entry matches; the callback defaults signed-in users to
      // /overview.
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

/**
 * Forgot-password request via the send-password-reset Edge Function
 * (2026-09-15): the broker answers whether the account exists, enforces a
 * DB-backed 60s per-email cooldown for found AND not-found attempts alike,
 * and only then sends the recovery mail. Kept the allowlisted
 * /auth/callback redirect target (audit P2-6: anything unlisted is rewritten
 * to spendflow://; the callback detects type=recovery and lands the user on
 * the profile set-new-password step).
 */
export type ResetOutcome =
  | "sent"
  | "no_account"
  | "cooldown"
  | "invalid"
  | "failed";

export async function resetPassword(
  supabase: SupabaseClient<Database>,
  email: string,
): Promise<ResetOutcome> {
  const { data, error } = await supabase.functions.invoke("send-password-reset", {
    body: { email, channel: "web", origin: window.location.origin },
  });
  if (error) return "failed";
  const res = data as { success?: boolean; code?: string } | null;
  if (res?.success) return "sent";
  switch (res?.code) {
    case "no_account":
      return "no_account";
    case "cooldown_active":
      return "cooldown";
    case "invalid_email":
      return "invalid";
    default:
      return "failed";
  }
}

/** Recovery-session password set (after a reset link completed via callback). */
export async function finalizeRecoveryPassword(
  supabase: SupabaseClient<Database>,
  newPassword: string,
): Promise<{ error: string | null }> {
  if (newPassword.length < 8) return { error: "At least 8 characters" };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

/** PKCE Google OAuth — web counterpart of mobile's browser-session flow. */
export async function signInWithGoogle(supabase: SupabaseClient<Database>) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signOut(supabase: SupabaseClient<Database>) {
  await supabase.auth.signOut();
  clearLocalCaches();
}

export async function signOutAllDevices(supabase: SupabaseClient<Database>) {
  await supabase.auth.signOut({ scope: "global" });
  clearLocalCaches();
}

/** Purge per-user client-side data (sign-out / session loss — audit P3-4). */
export function clearLocalCaches() {
  // Per-user caches are intentionally left simple on web v1 (no offline
  // mutation queue exists — docs/SYNC-STRATEGY.md §5).
  for (const key of Object.keys(localStorage)) {
    // Audit P3-4: alert-dedupe keys also carry user-derived data — purge both
    // prefixes on sign-out so nothing per-user survives the session.
    if (key.startsWith("sf_cache_") || key.startsWith("sf_alert_sent_")) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Audit P3-2: stored avatar URLs must point at the avatars bucket on THIS
 * project's Supabase host. Anything else (arbitrary third-party URL =
 * tracking-pixel sink, non-http scheme) is rejected at write time; the mobile
 * client stores exactly this shape, so parity holds.
 */
export function isAllowedAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const projectHost = projectUrl ? new URL(projectUrl).hostname : null;
    return (
      parsed.protocol === "https:" &&
      !!projectHost &&
      parsed.hostname === projectHost &&
      parsed.pathname.startsWith("/object/public/avatars/")
    );
  } catch {
    return false;
  }
}

/**
 * Profile bootstrap (mobile ensureProfile parity): select-or-insert the users
 * row, seed default categories on first login, resolve display currency from
 * the device onboarding choice (first login on this device only).
 */
export async function ensureProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string,
  displayName: string | null,
  authMeta?: Record<string, unknown> | null,
): Promise<Profile> {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    await seedDefaultCategories(supabase, userId, true);
    const profile = existing as Profile;
    // Metadata fallback (mobile parity): budget/cycle/currency were mirrored to
    // auth metadata — adopt them when the DB row holds only defaults.
    const meta = (authMeta ?? {}) as {
      monthly_budget?: number;
      budget_currency?: string;
      cycle_start_day?: number;
      cycle_end_day?: number;
      preferred_currency?: string;
      avatar_url?: string;
    };
    const patch: ProfileUpdate = {};
    // Google-photo mirror (app/auth/callback): the callback stores the bucket
    // URL in auth metadata; adopt it here when the row has no avatar (covers a
    // first sign-in where the row did not exist yet at callback time).
    // Audit NV-7 (healing): session.user.email is the server-confirmed
    // identity — keep users.email aligned with it. Covers a two-sided
    // email change confirmed out-of-band (mobile / link click) and re-syncs
    // any legacy row that mirrored an address before its confirmation.
    if (email && profile.email !== email) patch.email = email;
    if (!profile.avatar_url && meta.avatar_url && isAllowedAvatarUrl(meta.avatar_url)) {
      patch.avatar_url = meta.avatar_url;
    }
    if (profile.monthly_budget == null && typeof meta.monthly_budget === "number" && meta.monthly_budget > 0) {
      patch.monthly_budget = meta.monthly_budget;
    }
    // Budget currency travels with the budget figure. Mobile NEVER writes the
    // users column (PostgREST rejects unknown columns) — the live value lives
    // in auth metadata, so the DB row is null and must adopt it here. Without
    // this the budget renders raw in the display currency (overview showed
    // "NPR 36,000" for a budget saved as INR). Metadata missing entirely
    // (legacy budgets predating currency tracking) → backfill from the latest
    // settings-history row that carries one.
    const metaBudgetCurrency =
      typeof meta.budget_currency === "string" ? meta.budget_currency.toUpperCase() : null;
    if (!profile.budget_currency && metaBudgetCurrency && /^[A-Z]{3}$/.test(metaBudgetCurrency)) {
      patch.budget_currency = metaBudgetCurrency;
    }
    if (!profile.budget_currency && !patch.budget_currency) {
      try {
        const { data: hist } = await supabase
          .from("user_settings_history")
          .select("budget_currency")
          .eq("user_id", userId)
          .not("budget_currency", "is", null)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (hist?.budget_currency) patch.budget_currency = hist.budget_currency.toUpperCase();
      } catch {
        // history is best-effort — never block profile load
      }
    }
    // Cycle days: same 1..31 clamp the consumers apply — never persist a
    // NaN/fraction/out-of-range metadata value (h09 hardening).
    const clampDay = (d: number): number => Math.min(Math.max(Math.round(d), 1), 31);
    if (!profile.cycle_start_day && typeof meta.cycle_start_day === "number" && Number.isFinite(meta.cycle_start_day)) {
      patch.cycle_start_day = clampDay(meta.cycle_start_day);
    }
    if (profile.cycle_end_day == null && typeof meta.cycle_end_day === "number" && Number.isFinite(meta.cycle_end_day)) {
      patch.cycle_end_day = clampDay(meta.cycle_end_day);
    }
    if (meta.preferred_currency && /^[A-Z]{3}$/.test(meta.preferred_currency) && profile.preferred_currency === "NPR" && meta.preferred_currency !== "NPR") {
      patch.preferred_currency = meta.preferred_currency;
    }
    if (Object.keys(patch).length > 0) {
      const { data: updated } = await supabase
        .from("users")
        .update(patch)
        .eq("id", userId)
        .select("*")
        .single();
      if (updated) return updated as Profile;
    }
    return profile;
  }

  const onboardingCurrency = localStorage.getItem("spendflow_onboarding_currency");
  // Audit P3-3: the localStorage value is user-editable — apply the same
  // 3-letter shape check the auth-metadata path enforces.
  const safeCurrency =
    onboardingCurrency && /^[A-Z]{3}$/.test(onboardingCurrency) ? onboardingCurrency : "NPR";
  const insert: ProfileInsert = {
    id: userId,
    email,
    display_name: displayName,
    preferred_currency: safeCurrency,
  };
  // First OAuth sign-in: the callback mirrored Google's photo into the avatars
  // bucket before this row existed — carry the (allowlist-checked) URL over.
  const metaAvatar = (authMeta as { avatar_url?: unknown } | null)?.avatar_url;
  if (typeof metaAvatar === "string" && isAllowedAvatarUrl(metaAvatar)) {
    insert.avatar_url = metaAvatar;
  }
  const { data: created, error } = await supabase
    .from("users")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw error;

  localStorage.removeItem("spendflow_onboarding_currency");
  await seedDefaultCategories(supabase, userId, false);
  return created as Profile;
}

export async function seedDefaultCategories(
  supabase: SupabaseClient<Database>,
  userId: string,
  onlyIfEmpty: boolean,
): Promise<void> {
  if (onlyIfEmpty) {
    const { count } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) > 0) return;
  }
  await supabase.from("categories").insert(
    DEFAULT_CATEGORIES.map((c) => ({
      user_id: userId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
      is_custom: false,
    })),
  );
}

export async function updateProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  update: Database["public"]["Tables"]["users"]["Update"],
): Promise<Profile> {
  if (update.avatar_url !== undefined && update.avatar_url !== null) {
    if (!isAllowedAvatarUrl(update.avatar_url)) {
      throw new Error("Avatar URL must point at the SpendFlow avatars bucket.");
    }
  }
  if (update.display_name != null) {
    update = { ...update, display_name: String(update.display_name).trim().slice(0, 60) || null };
  }
  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

/** Password change re-verifies the current password first (mobile parity). */
export async function changePassword(
  supabase: SupabaseClient<Database>,
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user.email;
  if (!email) return { error: "Not signed in" };
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) return { error: "Current password is incorrect" };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}
