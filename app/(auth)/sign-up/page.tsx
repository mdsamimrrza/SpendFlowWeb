"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { signInWithGoogle, signUpWithEmail } from "@/services/auth";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Create-account screen. Mirrors mobile: name + email + 8-char password. */
export default function SignUpPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const supabase = getSupabaseBrowserClient();

  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        fullName: z.string().min(1, t("nameRequired")),
        email: z.string().email(t("validEmail")),
        password: z.string().min(8, t("passwordTooShort")),
      }),
    [t],
  );
  type FieldKey = "fullName" | "email" | "password";
  const [values, setValues] = useState({ fullName: "", email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const setField = useCallback(
    (key: FieldKey) => (e: ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
    },
    [],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ fullName: f.fullName?.[0], email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setErrors({});
    setSubmitting(true);
    setBanner(null);
    const { data, error } = await signUpWithEmail(
      supabase,
      parsed.data.email,
      parsed.data.password,
      parsed.data.fullName,
    );
    setSubmitting(false);
    if (error) {
      const e = error as { message?: string; code?: string };
      const msg = (e.message ?? "").toLowerCase();
      // "already registered" would confirm the email exists — show the same
      // neutral landing message as success instead (audit P3-9).
      if (
        e.code === "user_already_exists" ||
        msg.includes("already registered") ||
        msg.includes("already been registered")
      ) {
        setBanner({ kind: "info", text: t("confirmSent") });
        return;
      }
      // Audit NV-8: default-deny like sign-in. Only actionable password/rate
      // guidance is surfaced; any other IdP message collapses to the generic
      // line so registration can't echo account state.
      const actionable =
        msg.includes("password") || msg.includes("too many") || msg.includes("rate limit");
      setBanner({ kind: "error", text: actionable ? error.message : t("error") });
      return;
    }
    if (data.session) {
      router.push("/overview");
      router.refresh();
    } else {
      setBanner({ kind: "info", text: t("confirmSent") });
    }
  };

  const onGoogle = async () => {
    const { error } = await signInWithGoogle(supabase);
    if (error) setBanner({ kind: "error", text: error.message });
  };

  return (
    <Reveal className="w-full max-w-[400px]">
      <AuthCard
        overline={t("authOverlineJoin")}
        title={t("authCreateTitle")}
        subtitle={t("authCreateSub")}
      >
        {banner && <AuthBanner kind={banner.kind} text={banner.text} />}

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <AuthField
            label={t("fullName")}
            autoComplete="name"
            placeholder="Your full name"
            icon="user"
            name="fullName"
            value={values.fullName}
            onChange={setField("fullName")}
            error={errors.fullName}
          />
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
            autoComplete="new-password"
            icon="lock"
            hint={t("passwordHint")}
            name="password"
            value={values.password}
            onChange={setField("password")}
            error={errors.password}
          />
          <AuthSubmit loading={submitting}>{t("signUp")}</AuthSubmit>
        </form>

        <AuthDivider label={t("orContinueWith")} />
        <AuthGoogleButton onClick={onGoogle} label={t("continueWithGoogle")} />

        <AuthSecureNote />
      </AuthCard>

      <AuthSwitchLink question={t("haveAccount")} actionLabel={t("signIn")} href="/sign-in" />
    </Reveal>
  );
}
