"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CircleAlert,
  Eye,
  EyeOff,
  Info,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { useLanguage } from "@/store/LanguageContext";
import type { LanguageCode } from "@/utils/format";

/* ------------------------------------------------------------------ */
/* Shell pieces                                                        */
/* ------------------------------------------------------------------ */

/** The parchment card every auth screen sits on — flat, hairline, no shadow. */
export function AuthCard({
  overline,
  title,
  subtitle,
  children,
}: {
  overline: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel sf-auth-card shadow-soft w-full max-w-[400px] p-3.5 sm:p-6">
      <p className="caps-faint" style={{ color: "var(--sf-brass)" }}>
        {overline}
      </p>
      <h1 className="font-brand mt-1 text-[22px] font-bold leading-tight tracking-tight text-text sm:text-2xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[13px] leading-snug text-text-muted sm:text-sm">{subtitle}</p>
      )}
      <div className="sf-stagger mt-3.5 sm:mt-5">{children}</div>
    </section>
  );
}

/** Error / info banner — sharp tinted strip with a lucide tone icon. */
export function AuthBanner({ kind, text }: { kind: "error" | "info"; text: string }) {
  const Icon = kind === "error" ? CircleAlert : Info;
  return (
    <div
      role="status"
      className={`sf-banner-in mb-5 flex items-start gap-2.5 border px-4 py-3 text-sm font-medium ${
        kind === "error"
          ? "border-rust/30 bg-rust-tint text-danger"
          : "border-primary/25 bg-primary-light text-primary-strong"
      }`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

/** Hairline divider with a caps label ("OR CONTINUE WITH"). */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Quiet shield line under the form — mirrors the brand panel promise. */
export function AuthSecureNote() {
  const { t } = useLanguage();
  return (
    <p className="mt-3.5 flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-faint">
      <ShieldCheck size={13} className="shrink-0 text-income" aria-hidden />
      {t("brandAuthF3")}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Fields & buttons                                                    */
/* ------------------------------------------------------------------ */

const FIELD_ICONS = { user: User, mail: Mail, lock: Lock } as const;

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  error?: string | null;
  icon?: keyof typeof FIELD_ICONS;
  /** Right-aligned affordance in the label row (e.g. the forgot-password link). */
  labelAction?: ReactNode;
  /** Validation message shown when the password is below 8 chars (sign-up). */
  hint?: string;
}

/**
 * Ledger input at phone scale: caps label row (optional inline action),
 * hairline box, 44px tap target, leading lucide icon, brand focus border.
 * Password variants get a built-in show/hide eye.
 */
export function AuthField({
  label,
  error,
  icon,
  labelAction,
  hint,
  type,
  id,
  name,
  ...rest
}: AuthFieldProps) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && shown ? "text" : type;
  const fieldId = id ?? name ?? label;
  const Icon = icon ? FIELD_ICONS[icon] : null;
  return (
    <div className="w-full">
      <div className="mb-1 flex min-h-6 items-center justify-between">
        <label htmlFor={fieldId} className="caps">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="sf-field relative">
        {Icon && (
          <Icon
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
        )}
        <input
          id={fieldId}
          name={name}
          type={resolvedType}
          aria-invalid={!!error}
          aria-describedby={error || (isPassword && hint) ? `${fieldId}-msg` : undefined}
          className={`h-11 w-full border bg-input text-[16px] text-text placeholder:text-faint focus:border-primary focus:outline-none sm:text-sm ${
            error ? "border-danger" : "border-border"
          } ${Icon ? "pl-10" : "pl-3.5"} ${isPassword ? "pr-11" : "pr-3.5"}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? t("hidePassword") : t("showPassword")}
            aria-pressed={shown}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-text"
          >
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {(error || (isPassword && hint)) && (
        <p
          id={`${fieldId}-msg`}
          className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${
            error ? "text-danger" : "text-faint"
          }`}
        >
          {error && <AlertCircle size={12} aria-hidden />} {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Full-width sharp primary — same masthead button language as the landing. */
export function AuthSubmit({
  loading,
  disabled,
  children,
  onClick,
  type = "submit",
}: {
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="sf-lift sf-grad-primary flex h-11 w-full items-center justify-center gap-2 border border-primary bg-primary px-5 text-xs font-bold uppercase tracking-[0.08em] text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

/** Google button — the official 4-colour G is logo art, not an emoji glyph. */
export function AuthGoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="sf-lift flex h-11 w-full items-center justify-center gap-2.5 border border-border bg-surface px-5 text-xs font-bold uppercase tracking-[0.08em] text-text hover:border-text-muted"
    >
      <GoogleG /> {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-links & chrome                                                */
/* ------------------------------------------------------------------ */

/** "Don't have an account? Create account" — sharp caps link, ≥44px row. */
export function AuthSwitchLink({
  question,
  actionLabel,
  href,
}: {
  question: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <p className="mt-3 flex min-h-[44px] flex-wrap items-center justify-center gap-1.5 text-center text-sm text-text-muted">
      {question}{" "}
      <Link
        href={href}
        className="font-bold text-primary-strong underline-offset-4 transition-colors hover:underline"
      >
        {actionLabel}
      </Link>
    </p>
  );
}

/** EN / HI / NE segment pills (landing masthead parity). */
export function LangPills() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex items-center" role="group" aria-label="Language">
      {(["en", "hi", "ne"] as LanguageCode[]).map((l, i) => (
        <button
          key={l}
          onClick={() => setLanguage(l)}
          aria-pressed={language === l}
          className={`h-9 border px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${
            i > 0 ? "-ml-px" : ""
          } ${
            language === l
              ? "relative z-10 border-primary bg-primary text-white"
              : "border-border bg-transparent text-text-muted hover:border-text-muted"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
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
