"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const setField = useCallback(
    (key: "email" | "password") => (e: ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
    },
    [],
  );

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

  // Audit P3-9 + NV-8: default-deny. Never surface the IdP's raw credential
  // error — some GoTrue states (banned, OAuth-only, unconfirmed variants)
  // confirm account existence. Transient network/rate-limit failures say
  // nothing about the account, so they get the retryable "went wrong" line;
  // every other error collapses to the one generic credentials message.
  const authErrorText = (err: unknown): string => {
    const e = err as { message?: string; status?: number; code?: string; name?: string };
    const msg = (e.message ?? "").toLowerCase();
    if (
      e.name === "AuthRetryableFetchError" ||
      e.status === 429 ||
      msg.includes("failed to fetch") ||
      msg.includes("network error") ||
      msg.includes("too many requests")
    ) {
      return t("error");
    }
    return t("invalidCredentials");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setErrors({});
    setSubmitting(true);
    setBanner(null);
    const { error } = await signInWithEmail(supabase, parsed.data.email, parsed.data.password);
    setSubmitting(false);
    if (error) {
      setBanner({ kind: "error", text: authErrorText(error) });
      return;
    }
    router.push("/overview");
  };

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
            name="email"
            value={values.email}
            onChange={setField("email")}
            error={errors.email}
          />
          <AuthField
            label={t("password")}
            type="password"
            autoComplete="current-password"
            icon="lock"
            name="password"
            value={values.password}
            onChange={setField("password")}
            error={errors.password}
            labelAction={
              <Link
                href="/forgot-password"
                className="flex min-h-[44px] items-center px-1 text-xs font-bold text-primary-strong underline-offset-4 hover:underline"
              >
                {t("forgotPassword")}
              </Link>
            }
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
