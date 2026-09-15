"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(
    async (values) => {
      setSubmitting(true);
      setBanner(null);
      const { data, error } = await signUpWithEmail(
        supabase,
        values.email,
        values.password,
        values.fullName,
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
        setBanner({ kind: "error", text: e.message || t("error") });
        return;
      }
      if (data.session) {
        router.push("/overview");
        router.refresh();
      } else {
        setBanner({ kind: "info", text: t("confirmSent") });
      }
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
            error={form.formState.errors.fullName?.message}
            {...form.register("fullName")}
          />
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
            autoComplete="new-password"
            icon="lock"
            hint={t("passwordHint")}
            error={form.formState.errors.password?.message}
            {...form.register("password")}
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
