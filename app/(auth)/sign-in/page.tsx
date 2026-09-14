"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BarChart3, PiggyBank, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import {
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/services/auth";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
import type { LanguageCode } from "@/utils/format";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters"),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

/** Split-screen auth: brand panel (desktop) + form column. */
export default function SignInPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // OAuth return + password-reset landing both arrive as query flags from
  // redirects; map them to the banner once. (Without this, a failed Google
  // sign-in silently returned the user to a blank form.) Read from
  // window.location — this is a redirect landing, not navigation state.
  // `?mode=signUp` (landing-page CTA) pre-selects the Create Account form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError === "oauth" || oauthError === "oauth_cancelled") {
      setBanner({
        kind: "error",
        text: oauthError === "oauth_cancelled" ? t("oauthCancelled") : t("oauthFailed"),
      });
    } else if (params.get("reset") === "1") {
      setBanner({
        kind: "info",
        text: "Reset link verified — set your new password below.",
      });
    }
    if (params.get("mode") === "signUp") setMode("signUp");
    // Run only on mount: re-reading on every render would reset a banner the
    // user is reading as soon as the language changes mid-error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: The localhost→127.0.0.1 redirect was removed. It split the browser
  // cookie jar across two origins (localhost ≠ 127.0.0.1) which caused the
  // session cookies set after password sign-in to be invisible to the
  // middleware on the next request, keeping authLoading=true and the dashboard
  // stuck on skeleton forever. OAuth redirect issues should be handled via
  // the Supabase project's Redirect URL allowlist instead.

  const signInForm = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="sf-card max-w-md p-6 text-center">
          <p className="text-sm font-bold text-text">Service temporarily unavailable</p>
          <p className="mt-2 text-xs text-text-muted">
            We&apos;re having trouble connecting right now. Please try again in a few minutes.
          </p>
        </div>
      </main>
    );
  }

  // Audit P3-9: never surface the IdP's raw credential errors (they can confirm
  // account existence) — map known auth failures to generic text and pass
  // through anything the user can act on (validation, rate limit, network).
  const authErrorText = (err: unknown, generic: string): string => {
    const e = err as { message?: string; status?: number; code?: string };
    const msg = (e.message ?? "").toLowerCase();
    if (
      e.code === "invalid_credentials" ||
      e.status === 400 && msg.includes("invalid login") ||
      e.code === "email_not_confirmed" && msg.includes("not confirmed")
    ) {
      return generic;
    }
    return e.message || generic;
  };

  const onSignIn = signInForm.handleSubmit(
    async (values) => {
      setSubmitting(true);
      setBanner(null);
      const { error } = await signInWithEmail(supabase, values.email, values.password);
      setSubmitting(false);
      if (error) {
        setBanner({ kind: "error", text: authErrorText(error, t("invalidCredentials")) });
        return;
      }
      router.push("/overview");
    },
    () => undefined,
  );

  const onSignUp = signUpForm.handleSubmit(async (values) => {
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
      if (e.code === "user_already_exists" || msg.includes("already registered") || msg.includes("already been registered")) {
        setBanner({ kind: "info", text: "Check your inbox to confirm your email, then sign in." });
        return;
      }
      setBanner({ kind: "error", text: e.message || t("error") });
      return;
    }
    if (data.session) {
      router.push("/overview");
      router.refresh();
    } else {
      setBanner({
        kind: "info",
        text: "Check your inbox to confirm your email, then sign in.",
      });
    }
  });

  const onGoogle = async () => {
    const { error } = await signInWithGoogle(supabase);
    if (error) setBanner({ kind: "error", text: error.message });
  };

  const onForgot = async () => {
    if (!forgotEmail) return;
    const { error } = await resetPassword(supabase, forgotEmail);
    setForgotOpen(false);
    showToast(error ? error.message : "Password reset email sent", error ? "error" : "success");
  };

  return (
    <main className="flex min-h-screen">
      {/* ===== Brand panel (desktop only) ===== */}
      <section className="relative hidden w-[46%] max-w-[620px] flex-col justify-between overflow-hidden bg-primary p-10 text-white lg:flex">
        <div className="relative flex items-center gap-3">
          <SpendFlowSeal size={44} />
          <span className="font-brand text-2xl font-bold">SpendFlow</span>
        </div>

        <div className="relative">
          <h2 className="font-brand text-4xl font-bold leading-tight">
            See where your
            <br />
            money flows.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/80">
            Expenses, income, budgets and transfers — synced with the SpendFlow mobile app through
            one secure account.
          </p>
          <ul className="mt-8 divide-y divide-white/15 border-y border-white/15 text-sm">
            <Feature icon={<BarChart3 size={16} />}>Cycle-aware budgets and burn analysis</Feature>
            <Feature icon={<PiggyBank size={16} />}>Multi-currency ledger with exact history</Feature>
            <Feature icon={<ShieldCheck size={16} />}>Your data stays private and secure</Feature>
          </ul>
        </div>

        <p className="relative text-xs text-white/60">English · हिन्दी · नेपाली</p>
      </section>

      {/* ===== Form column ===== */}
      <section className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-10 lg:w-[54%]">
        <div className="sf-ambient" aria-hidden />

        <div className="relative w-full max-w-[420px]">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <SpendFlowSeal size={30} />
              <span className="font-brand text-lg font-bold text-text">SpendFlow</span>
            </div>
            <ThemeToggle />
          </div>
          <div className="mb-6 hidden justify-end lg:flex">
            <div className="flex items-center gap-1.5">
              {(["en", "hi", "ne"] as LanguageCode[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`h-8 border px-3 text-[11px] font-bold uppercase tracking-[0.08em] transition ${
                    language === l
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-transparent text-text-muted"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
              <ThemeToggle />
            </div>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {mode === "signIn" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {mode === "signIn"
              ? "Sign in to your personal ledger."
              : "Start tracking where your money flows."}
          </p>

          {banner && (
            <div
              role="status"
              className={`mt-4 rounded-md px-4 py-3 text-sm font-medium ${
                banner.kind === "error"
                  ? "bg-rust-tint text-danger"
                  : "bg-primary-light text-primary-strong"
              }`}
            >
              {banner.text}
            </div>
          )}

          <div className="mt-6">
            {mode === "signIn" ? (
              <form
                method="POST"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onSignIn(e);
                }}
                className="space-y-4"
                noValidate
              >
                <Input
                  label={t("email")}
                  type="email"
                  autoComplete="email"
                  error={signInForm.formState.errors.email?.message}
                  {...signInForm.register("email")}
                />
                <Input
                  label={t("password")}
                  type="password"
                  autoComplete="current-password"
                  error={signInForm.formState.errors.password?.message}
                  {...signInForm.register("password")}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    {t("forgotPassword")}
                  </button>
                </div>
                <Button type="submit" loading={submitting} className="w-full">
                  {t("signIn")}
                </Button>
              </form>
            ) : (
              <form
                method="POST"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onSignUp(e);
                }}
                className="space-y-4"
                noValidate
              >
                <Input
                  label={t("fullName")}
                  autoComplete="name"
                  error={signUpForm.formState.errors.fullName?.message}
                  {...signUpForm.register("fullName")}
                />
                <Input
                  label={t("email")}
                  type="email"
                  autoComplete="email"
                  error={signUpForm.formState.errors.email?.message}
                  {...signUpForm.register("email")}
                />
                <Input
                  label={t("password")}
                  type="password"
                  autoComplete="new-password"
                  error={signUpForm.formState.errors.password?.message}
                  {...signUpForm.register("password")}
                />
                <Button type="submit" loading={submitting} className="w-full">
                  {t("signUp")}
                </Button>
              </form>
            )}

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-bold tracking-wide text-faint">
                {t("orContinueWith")}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="secondary" className="w-full" onClick={onGoogle}>
              <GoogleG /> {t("continueWithGoogle")}
            </Button>

            <p className="mt-6 text-center text-sm text-text-muted">
              {mode === "signIn" ? t("noAccount") : t("haveAccount")}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signIn" ? "signUp" : "signIn");
                  setBanner(null);
                  signInForm.reset();
                  signUpForm.reset();
                }}
                className="font-bold text-primary hover:underline"
              >
                {mode === "signIn" ? t("signUp") : t("signIn")}
              </button>
            </p>
          </div>
        </div>
      </section>

      <Modal open={forgotOpen} title={t("forgotPassword")} onClose={() => setForgotOpen(false)}>
        <div className="space-y-4">
          <Input
            label={t("email")}
            type="email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
          />
          <Button className="w-full" onClick={onForgot}>
            Send reset link
          </Button>
        </div>
      </Modal>
    </main>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-7 w-7 items-center justify-center border border-white/30">{icon}</span>
      <span className="text-white/90">{children}</span>
    </li>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.8c4.4-4.1 7.2-10.1 7.2-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.4-2 15.3-5.6l-7.4-5.8c-2 1.4-4.7 2.2-7.9 2.2-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
