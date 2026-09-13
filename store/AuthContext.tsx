"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { ensureProfile, updateProfile } from "@/services/auth";
import { generateDueRecurringExpenses } from "@/services/recurring";
import { notifyExpensesChanged } from "@/hooks/useExpenses";
import type { Profile, ProfileUpdate } from "@/types/database.types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  saveProfile: (update: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastFetchedAt = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);

  const supabase = getSupabaseBrowserClient();

  const refreshProfile = useCallback(async () => {
    // 30 s freshness throttle + in-flight dedup (mobile AuthContext parity).
    if (Date.now() - lastFetchedAt.current < 30_000 || inflight.current) {
      if (inflight.current) await inflight.current;
      return;
    }
    const run = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setProfile(null);
        return;
      }
      try {
        const next = await ensureProfile(
          supabase,
          user.id,
          user.email ?? "",
          (user.user_metadata?.display_name as string | undefined) ?? null,
          user.user_metadata as Record<string, unknown> | null,
        );
        setProfile(next);
        // Post due recurring entries once per session (mobile parity: the
        // deferred generate-on-login pass), then let listeners refetch.
        void generateDueRecurringExpenses(supabase, user.id)
          .then((created) => {
            if (created > 0) notifyExpensesChanged();
          })
          .catch(() => undefined);
      } catch {
        // Offline / transient — keep previous cached profile.
      } finally {
        lastFetchedAt.current = Date.now();
      }
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session?.user) void refreshProfile();
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = useCallback(
    async (update: ProfileUpdate) => {
      if (!session?.user) return;
      const next = await updateProfile(supabase, session.user.id, update);
      setProfile(next);
      // Mirror profile facts into auth metadata (mobile parity) — used as a
      // fallback when a fresh install reads the profile while offline.
      void supabase.auth
        .updateUser({
          data: {
            display_name: next.display_name,
            preferred_currency: next.preferred_currency,
            cycle_start_day: next.cycle_start_day,
            cycle_end_day: next.cycle_end_day,
            monthly_budget: next.monthly_budget,
            avatar_url: next.avatar_url,
          },
        })
        .catch(() => undefined);
    },
    [supabase, session?.user],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, [supabase]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      saveProfile,
      signOut,
    }),
    [session, profile, loading, refreshProfile, saveProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
