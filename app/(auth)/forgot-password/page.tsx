"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import {
  AuthBanner,
  AuthCard,
  AuthField,
  AuthSubmit,
} from "@/components/auth/AuthPrimitives";
import { Reveal } from "@/components/ui/Reveal";
import { useLanguage } from "@/store/LanguageContext";
import { resetPassword } from "@/services/auth";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/**
 * Password recovery — its own screen now (was a cramped modal on sign-in).
 * Broker semantics preserved: no_account answers intentionally, and a 60s
 * resend cooldown mirrors the server-side gate so the UI never invites a
 * doomed retry.
 */
export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"form" | "sent">("form");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const onSubmit = async () => {
    if (cooldown > 0) {
      setError(t("resetCooldown"));
      return;
    }
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t("validEmail"));
      return;
    }
    setSending(true);
    setError(null);
    const outcome = await resetPassword(supabase, trimmed);
    setSending(false);
    if (outcome === "no_account") {
      // Existence answer is intentional (2026-09-15, owner request) — the
      // broker rate-limits not-found attempts identically to real sends.
      setError(t("noAccountFound"));
      return;
    }
    if (outcome === "cooldown") {
      setCooldown(60);
      setError(t("resetCooldown"));
      return;
    }
    if (outcome !== "sent") {
      setError(outcome === "invalid" ? t("validEmail") : t("mailSendFailed"));
      return;
    }
    setStep("sent");
    setCooldown(60);
  };

  return (
    <Reveal className="w-full max-w-[400px]">
      {step === "form" ? (
        <AuthCard
          overline={t("authOverlineRecovery")}
          title={t("forgotTitle")}
          subtitle={t("forgotDesc")}
        >
          <AuthField
            name="forgot-email"
            label={t("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            icon="mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sending) void onSubmit();
            }}
            error={error}
          />
          <div className="mt-5">
            <AuthSubmit loading={sending} type="button" onClick={onSubmit}>
              {t("sendResetLink")}
            </AuthSubmit>
          </div>

          <Link
            href="/sign-in"
            className="mt-5 flex min-h-[44px] items-center justify-center gap-1.5 text-xs font-bold text-primary-strong underline-offset-4 hover:underline"
          >
            <ArrowLeft size={13} /> {t("backToSignIn")}
          </Link>
        </AuthCard>
      ) : (
        <AuthCard
          overline={t("authOverlineRecovery")}
          title={t("resetSentTitle")}
          subtitle={t("resetSentIf")}
        >
          <div className="flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center border border-primary/25 bg-primary-light text-primary-strong">
              <MailCheck size={22} aria-hidden />
            </span>
            <div className="mt-4 w-full break-all border border-border bg-input px-3 py-2 text-sm font-bold text-text">
              {email.trim()}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-faint">{t("resetSentNote")}</p>
          </div>

          {error && (
            <div className="mt-4">
              <AuthBanner kind="error" text={error} />
            </div>
          )}

          <div className="mt-5 space-y-2.5">
            <AuthSubmit
              type="button"
              loading={sending}
              disabled={cooldown > 0}
              onClick={onSubmit}
            >
              {cooldown > 0 ? `${t("sendAgain")} (${cooldown}s)` : t("sendAgain")}
            </AuthSubmit>
            <Link
              href="/sign-in"
              className="sf-lift flex h-11 w-full items-center justify-center gap-1.5 border border-border bg-surface px-5 text-xs font-bold uppercase tracking-[0.08em] text-text hover:border-text-muted"
            >
              <KeyRound size={13} className="text-primary" /> {t("backToSignIn")}
            </Link>
          </div>
        </AuthCard>
      )}
    </Reveal>
  );
}
