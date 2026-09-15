"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AuthBanner,
  AuthCard,
  AuthDivider,
  AuthField,
  AuthGoogleButton,
  AuthSecureNote,
  AuthSubmit,
  AuthSwitchLink,
} from "@/components/auth/AuthPrimitives";
import { Reveal } from "@/components/ui/Reveal";
import { useLanguage } from "@/store/LanguageContext";
import { signInWithEmail, signInWithGoogle } from "@/services/auth";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Sign-in screen. Registration lives on /sign-up; recovery on /forgot-password. */
export default function SignInPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const supabase = getSupabaseBrowserClient();

  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("validEmail")),
        password: z.string().min(1, t("authPasswordRequired")),
      }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  // OAuth failures return here as ?error flags from the callback route; map
  // them to the banner once. `?mode=signUp` is a stale-link path — the signup
  // form moved to its own route, so forward old links instead of ignoring them.
  // Read from window.location — this is a redirect landing, not nav state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError === "oauth" || oauthError === "oauth_cancelled") {
      setBanner({
        kind: "error",
        text: oauthError === "oauth_cancelled" ? t("oauthCancelled") : t("oauthFailed"),
      });
    }
    if (params.get("mode") === "signUp") router.replace("/sign-up");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: The localhost→127.0.0.1 redirect was removed. It split the browser
  // cookie jar across two origins (localhost ≠ 127.0.0.1) which caused the
  // session cookies set after password sign-in to be invisible to the
  // middleware on the next request, keeping authLoading=true and the dashboard
  // stuck on skeleton forever. OAuth redirect issues should be handled via
  // the Supabase project's Redirect URL allowlist instead.

  // Audit P3-9: never surface the IdP's raw credential errors (they can confirm
  // account existence) — map known auth failures to generic text and pass
  // through anything the user can act on (validation, rate limit, network).
  const authErrorText = (err: unknown): string => {
    const e = err as { message?: string; status?: number; code?: string };
    const msg = (e.message ?? "").toLowerCase();
    if (
      e.code === "invalid_credentials" ||
      (e.status === 400 && msg.includes("invalid login")) ||
      (e.code === "email_not_confirmed" && msg.includes("not confirmed"))
    ) {
      return t("invalidCredentials");
    }
    return e.message || t("invalidCredentials");
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      setSubmitting(true);
      setBanner(null);
      const { error } = await signInWithEmail(supabase, values.email, values.password);
      setSubmitting(false);
      if (error) {
        setBanner({ kind: "error", text: authErrorText(error) });
        return;
      }
      router.push("/overview");
    },
    () => undefined,
  );

  const onGoogle = async () => {
    const { error } = await signInWithGoogle(supabase);
    if (error) setBanner({ kind: "error", text: error.message });
  };

  return (
    <Reveal className="w-full max-w-[400px]">
      <AuthCard
        overline={t("signIn")}
        title={t("authWelcomeBack")}
        subtitle={t("authWelcomeBackSub")}
      >
        {banner && <AuthBanner kind={banner.kind} text={banner.text} />}

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <AuthField
            label={t("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            icon="mail"
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <AuthField
            label={t("password")}
            type="password"
            autoComplete="current-password"
            icon="lock"
            error={form.formState.errors.password?.message}
            labelAction={
              <Link
                href="/forgot-password"
                className="flex min-h-[44px] items-center px-1 text-xs font-bold text-primary-strong underline-offset-4 hover:underline"
              >
                {t("forgotPassword")}
              </Link>
            }
            {...form.register("password")}
          />
          <AuthSubmit loading={submitting}>{t("signIn")}</AuthSubmit>
        </form>

        <AuthDivider label={t("orContinueWith")} />
        <AuthGoogleButton onClick={onGoogle} label={t("continueWithGoogle")} />

        <AuthSecureNote />
      </AuthCard>

      <AuthSwitchLink question={t("noAccount")} actionLabel={t("signUp")} href="/sign-up" />
    </Reveal>
  );
}
