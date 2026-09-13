"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, ShieldCheck } from "lucide-react";
import { useToast } from "@/store/ToastContext";
import { useAuth } from "@/store/AuthContext";
import { useTheme } from "@/store/ThemeContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { CURRENCIES, CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";
import type { LanguageCode } from "@/utils/format";

/**
 * Settings — register of preferences, ledger style: identity statement card
 * with inline name editing, ruled preference rows with live values, the
 * registers hub, and session/danger actions.
 */
export default function SettingsPage() {
  const { profile, saveProfile, signOut } = useAuth();
  const { t } = useLanguage();
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const onCurrency = async (code: string) => {
    // Display-currency change NEVER rewrites the stored budget.
    await saveProfile({ preferred_currency: code });
  };

  const onSignOut = async () => {
    setConfirmSignOut(false);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <main className="mx-auto w-full max-w-[1000px]">
      <header className="mb-5">
        <p className="caps !text-primary-strong">Account</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("settings")}</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>

      {/* ── Identity statement ── */}
      <section className="panel mb-4">
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">Account holder</span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-success">
            <ShieldCheck size={13} /> Verified
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="flex h-14 w-14 items-center justify-center border-2 border-primary bg-primary-light text-xl font-bold text-primary-strong">
            {(profile?.display_name ?? profile?.email)?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <IdentityName />
            <p className="truncate text-sm text-text-muted">{profile?.email}</p>
            <p className="stamp mt-1">
              Member since{" "}
              {profile?.created_at
                ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(
                    new Date(profile.created_at),
                  )
                : "—"}
              {profile?.id ? ` · ref ${profile.id.slice(0, 8).toUpperCase()}` : ""}
            </p>
          </div>
        </div>
      </section>

      {/* ── Registers hub ── */}
      <section className="panel mb-4">
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">Registers</span>
          <span className="caps-faint">8 sections</span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { href: "/accounts", label: "Accounts" },
            { href: "/transfer", label: "Transfers" },
            { href: "/transfer/history", label: "Transfer log" },
            { href: "/categories", label: "Categories" },
            { href: "/profit-loss", label: "Profit & Loss" },
            { href: "/bullion", label: "Gold & silver" },
            { href: "/export", label: "Export" },
            { href: "/profile", label: "Profile & security" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group bg-surface px-4 py-3.5 transition-colors hover:bg-surface-elevated"
            >
              <p className="text-sm font-semibold text-text-muted transition-colors group-hover:text-primary">
                {l.label}
              </p>
              <p className="stamp mt-0.5 opacity-0 transition-opacity group-hover:opacity-100">Open →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Preferences register ── */}
      <section className="panel mb-4">
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">Preferences</span>
          <span className="caps-faint">Applied instantly</span>
        </div>

        {/* Currency row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text">{t("currency")}</p>
            <p className="text-[11px] text-faint">
              Display only — the stored budget keeps its own budget currency.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              aria-label={t("currency")}
              value={profile?.preferred_currency ?? "NPR"}
              onChange={(e) => void onCurrency(e.target.value)}
              className="w-44"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_DETAILS[c].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Language row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text">{t("language")}</p>
            <p className="text-[11px] text-faint">Interface and number/date locale.</p>
          </div>
          <div className="flex border border-border">
            {(["en", "hi", "ne"] as LanguageCode[]).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`flex h-9 items-center gap-1.5 px-4 text-xs font-bold uppercase tracking-[0.08em] transition ${
                  language === l
                    ? "bg-primary text-white"
                    : "bg-input text-text-muted hover:text-text"
                }`}
              >
                {language === l && <Check size={12} />}
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Theme row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text">{t("theme")}</p>
            <p className="text-[11px] text-faint">Parchment by day, slate by night.</p>
          </div>
          <ThemePickerInline />
        </div>

        {/* Privacy row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text">{t("privacyMode")}</p>
            <p className="text-[11px] text-faint">
              Mask every amount on screen — toggled from the eye icon too.
            </p>
          </div>
          <PrivacyToggleInline />
        </div>
      </section>

      {/* ── Session ── */}
      <section className="panel mb-4">
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">Session</span>
          <span className="caps-faint">This browser</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text">{t("signOut")}</p>
            <p className="text-[11px] text-faint">
              Data stays synced — sign back in anytime. For email, password and every-device
              revocation, see{" "}
              <Link href="/profile" className="font-bold text-primary hover:underline">
                Profile &amp; security
              </Link>
              .
            </p>
          </div>
          <button
            onClick={() => setConfirmSignOut(true)}
            className="h-10 border border-danger px-5 text-xs font-bold uppercase tracking-[0.08em] text-danger transition-colors hover:bg-rust-tint"
          >
            {t("signOut")}
          </button>
        </div>
      </section>

      {/* Footer stamp */}
      <p className="stamp mt-6 text-center">
        SpendFlow Web · Form SF-01 · Ledger edition · v0.1.0
      </p>

      <ConfirmDialog
        open={confirmSignOut}
        title={t("signOut")}
        body="You can sign back in with your password."
        confirmLabel={t("signOut")}
        cancelLabel={t("cancel")}
        onConfirm={onSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </main>
  );
}

/** Inline name editor (mobile profile parity): pencil → input → save/cancel. */
function IdentityName() {
  const { profile, saveProfile } = useAuth();
  const { showToast } = useToastSafe();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setName(profile.display_name ?? "");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({ display_name: name.trim() || null });
      showToast("Name updated", "success");
      setEditing(false);
    } catch {
      showToast("Could not update name", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <p className="flex items-center gap-2 text-base font-bold text-text">
        <span className="truncate">{profile?.display_name ?? "Member"}</span>
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit name"
          className="rounded p-1 text-faint transition-colors hover:text-primary"
        >
          <Pencil size={13} />
        </button>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
        className="h-9 w-56 border border-primary bg-input px-2.5 text-sm font-semibold text-text focus:outline-none"
      />
      <button
        onClick={save}
        disabled={saving}
        className="flex h-8 items-center gap-1 border border-primary bg-primary px-3 text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
      >
        <Check size={12} /> Save
      </button>
      <button
        onClick={() => setEditing(false)}
        className="h-8 border border-border px-3 text-[11px] font-bold uppercase tracking-wide text-text-muted"
      >
        Cancel
      </button>
    </div>
  );
}

function useToastSafe() {
  return useToast();
}

function ThemePickerInline() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex border border-border">
      {(["light", "dark", "system"] as const).map((p) => (
        <button
          key={p}
          onClick={() => setPreference(p)}
          className={`h-9 px-4 text-xs font-bold uppercase tracking-[0.08em] transition ${
            preference === p ? "bg-primary text-white" : "bg-input text-text-muted hover:text-text"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function PrivacyToggleInline() {
  const { isPrivacyMode, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={isPrivacyMode}
      aria-label="Privacy mode"
      className={`relative h-5 w-10 border transition ${
        isPrivacyMode ? "border-primary bg-primary" : "border-border bg-surface-elevated"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 bg-white transition-all ${
          isPrivacyMode ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
