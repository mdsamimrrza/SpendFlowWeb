"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Download,
  Eye,
  EyeOff,
  Info,
  Landmark,
  Languages,
  LayoutGrid,
  Monitor,
  Moon,
  Pencil,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Tags,
  Target,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/store/ToastContext";
import { useAuth } from "@/store/AuthContext";
import { useTheme } from "@/store/ThemeContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { ConfirmDialog } from "@/components/ui/Modal";
import { SectionTitle } from "@/components/ui/Card";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { isAllowedAvatarUrl } from "@/services/auth";
import { CURRENCIES, CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";
import { WIZARD_COUNTRIES } from "@/constants/countries";
import type { LanguageCode } from "@/utils/format";

/** Currency → country display name (from the onboarding wizard registry). */
const COUNTRY_BY_CURRENCY = new Map<string, string>(
  WIZARD_COUNTRIES.map((c) => [c.currency, c.name]),
);

/** Section tile tone chips — token colors only. */
const TILE_TONES = {
  primary: "bg-primary/10 text-primary",
  brass: "bg-brass-tint text-brass",
  info: "bg-info/10 text-info",
  income: "bg-income/10 text-income",
  danger: "bg-rust-tint text-danger",
} as const;

/**
 * Settings — rebuilt on the Analytics design language: kicker header, an
 * identity hero card, then three SectionTitle groups (Preferences, Sections,
 * Security & session). On laptops the preference and security cards flow as
 * a 58/42 magazine pair (lg:order); phones keep the DOM order stacked.
 */
export default function SettingsPage() {
  const { profile, saveProfile, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { isDark } = useTheme();
  const { isPrivacyMode } = usePrivacy();
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

  const currency = profile?.preferred_currency ?? "NPR";

  return (
    <main className="mx-auto w-full max-w-[1080px]">
      {/* ── Header ── */}
      <header className="mb-5">
        <p className="caps !text-text-muted">{t("navAccount")}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
            {t("settings")}
          </h1>
          <span className="stamp shrink-0 pb-1">SpendFlow · v0.1.0</span>
        </div>
      </header>

      {/* ── Identity hero ── */}
      <section aria-label={t("settingsAccountHolder")} className="panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:flex-nowrap sm:p-5">
        {profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-soft" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-white shadow-soft">
            {(profile?.display_name ?? profile?.email)?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <IdentityName />
          <p className="truncate text-sm text-text-muted">{profile?.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-income/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-income">
              <ShieldCheck size={12} aria-hidden /> {t("settingsVerified")}
            </span>
            <span className="rounded-full border border-border bg-input px-2.5 py-1 text-[10px] text-text-muted">
              {t("settingsMemberSince")}{" "}
              {profile?.created_at
                ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(
                    new Date(profile.created_at),
                  )
                : "—"}
            </span>
          </div>
        </div>
        <Link
          href="/profile"
          className="flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-white transition hover:bg-primary-strong active:scale-[0.99] sm:w-auto"
        >
          <UserRound size={14} aria-hidden /> {t("rowProfileSecurity")}
        </Link>
      </section>

      <div className="mt-7 space-y-7">
        {/* ═══ PREFERENCES ═══ */}
        <section aria-label={t("settingsPreferences")} className="space-y-4">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-primary-strong" aria-hidden />
              {t("settingsPreferences")}
            </span>
          </SectionTitle>
          {/* Magazine pairs on laptop: theme | language, currency | privacy. */}
          <div className="flex flex-wrap gap-4">
            <SettingsCard
              className="lg:order-1 lg:w-[calc(58.333%-0.5rem)]"
              icon={isDark ? <Moon size={18} /> : <Sun size={18} />}
              title={t("theme")}
              sub={t("settingsAppliedInstantly")}
            >
              <ThemeCards />
            </SettingsCard>

            <SettingsCard
              className="lg:order-2 lg:w-[calc(41.667%-0.5rem)]"
              icon={<Languages size={18} />}
              title={t("language")}
              sub="English · हिन्दी · नेपाली"
            >
              <LanguageCards value={language} onChange={(v) => setLanguage(v as LanguageCode)} />
            </SettingsCard>

            <SettingsCard
              className="lg:order-3 lg:w-[calc(58.333%-0.5rem)]"
              icon={<CurrencyFlag currency={currency} size={18} />}
              title={t("currency")}
              sub={COUNTRY_BY_CURRENCY.get(currency) ?? CURRENCY_DETAILS[currency as CurrencyCode]?.label}
            >
              <CurrencyPicker
                value={currency}
                onChange={(code) => void onCurrency(code)}
                ariaLabel={t("currency")}
              />
            </SettingsCard>

            <SettingsCard
              className="lg:order-4 lg:w-[calc(41.667%-0.5rem)]"
              icon={isPrivacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
              title={t("privacyMode")}
              sub={t("setPrivacyHint")}
              action={<PrivacyToggle />}
            />
          </div>
        </section>

        {/* ═══ SECTIONS ═══ */}
        <section aria-label={t("settingsSections")} className="space-y-4">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <LayoutGrid size={14} className="text-primary-strong" aria-hidden />
              {t("settingsSections")}
            </span>
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            <SectionTile href="/profit-loss" Icon={Target} tone="primary" label={t("rowBudgetReports")} desc={t("rowBudgetReportsDesc")} />
            <SectionTile href="/categories" Icon={Tags} tone="brass" label={t("rowCategoriesBudgets")} desc={t("rowCategoriesBudgetsDesc")} />
            <SectionTile href="/accounts" Icon={Landmark} tone="info" label={t("rowAccounts")} desc={t("rowAccountsDesc")} />
            <SectionTile href="/bullion" Icon={Coins} tone="brass" label={t("rowBullion")} desc={t("rowBullionDesc")} />
            <SectionTile href="/transfer" Icon={ArrowLeftRight} tone="income" label={t("rowTransfers")} desc={t("rowTransfersDesc")} />
            <SectionTile href="/export" Icon={Download} tone="primary" label={t("rowExport")} desc={t("rowExportDesc")} />
            <SectionTile href="/bin" Icon={Trash2} tone="danger" label={t("settings_bin")} desc={t("rowBinDesc")} />
          </div>
        </section>

        {/* ═══ SECURITY & SESSION ═══ */}
        <section aria-label={t("settingsSecurity")} className="space-y-4">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={14} className="text-primary-strong" aria-hidden />
              {t("settingsSecurity")}
            </span>
          </SectionTitle>
          <div className="flex flex-wrap gap-4">
            {/* Notifications — milestone thresholds; the Alert bell is the web
                parity surface for the APK Settings→Notifications modal. */}
            <SettingsCard
              className="lg:order-1 lg:w-[calc(58.333%-0.5rem)]"
              icon={<Bell size={18} />}
              title={t("rowNotifications")}
              sub={`${t("budget")} · ${t("category")}`}
            >
              <span className="flex flex-wrap gap-1.5" aria-hidden>
                {["25", "50", "75", "90", "100"].map((v, i) => (
                  <span
                    key={v}
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      i === 4
                        ? "bg-rust-tint text-danger"
                        : i === 3
                          ? "bg-brass-tint text-brass"
                          : "bg-surface-elevated text-text-muted"
                    }`}
                  >
                    {v}%
                  </span>
                ))}
              </span>
            </SettingsCard>

            <SettingsCard
              className="lg:order-2 lg:w-[calc(41.667%-0.5rem)]"
              icon={<ShieldCheck size={18} />}
              title={t("secSignOutAll")}
              sub={t("secSignOutAllDesc")}
              action={
                <Link
                  href="/profile"
                  aria-label={t("open")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-muted transition hover:border-primary hover:text-primary"
                >
                  <ChevronRight size={15} />
                </Link>
              }
            >
              <button
                onClick={() => setConfirmSignOut(true)}
                className="h-11 w-full rounded-xl border border-danger/50 text-xs font-bold uppercase tracking-[0.08em] text-danger transition-colors hover:bg-rust-tint active:scale-[0.99]"
              >
                {t("signOut")} · {t("settingsThisBrowser")}
              </button>
            </SettingsCard>
          </div>
        </section>
      </div>

      {/* Footer stamp */}
      <p className="stamp mt-6 flex items-center justify-center gap-1.5">
        <Info size={11} aria-hidden /> SpendFlow Web · Ledger edition · v0.1.0
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

/* ── pieces ── */

/** Icon-chip card header (Analytics language) + optional body. */
function SettingsCard({
  icon,
  title,
  sub,
  action,
  className = "",
  children,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`panel w-full min-w-0 p-4 sm:p-5 lg:self-start ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-strong" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold leading-tight text-text">{title}</p>
            {sub && <p className="mt-0.5 truncate text-[11px] text-text-muted">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** Section tile: tone-tinted icon, label + one-line description. */
function SectionTile({
  href,
  Icon,
  tone,
  label,
  desc,
}: {
  href: string;
  Icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[44px] min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition-all hover:border-primary hover:shadow-soft focus-visible:border-primary focus-visible:outline-none active:scale-[0.99]"
    >
      <span className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TILE_TONES[tone]}`}>
          <Icon size={16} />
        </span>
        <ChevronRight
          size={14}
          aria-hidden
          className="text-faint transition-all group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </span>
      <span className="min-w-0">
        {/* Wraps to two lines on phones — truncation clipped "Wallets" off
            the Bank Accounts tile. */}
        <span className="block text-[13px] font-bold leading-snug text-text">{label}</span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-text-muted">{desc}</span>
      </span>
    </Link>
  );
}

/** Theme picker as live-preview tiles: mini mock UI drawn with token colors. */
function ThemeCards() {
  const { preference, setPreference } = useTheme();
  const { t } = useLanguage();
  const opts = [
    { value: "light", label: t("light"), Icon: Sun },
    { value: "dark", label: t("dark"), Icon: Moon },
    { value: "system", label: t("system"), Icon: Monitor },
  ] as const;
  return (
    <div role="radiogroup" aria-label={t("theme")} className="grid grid-cols-3 gap-2">
      {opts.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            className={`flex flex-col items-stretch gap-2 rounded-xl border-2 p-2 text-left transition active:scale-[0.99] ${
              active ? "border-primary bg-primary/5" : "border-border hover:border-text-muted"
            }`}
          >
            {/* Mini page preview — structure differs per option; selected gets a brand dot. */}
            <span
              className={`relative flex h-14 flex-col gap-1 overflow-hidden rounded-lg border p-1.5 ${
                value === "dark"
                  ? "border-zinc-700 bg-zinc-900"
                  : value === "system"
                    ? "border-border bg-gradient-to-br from-surface to-zinc-800"
                    : "border-border bg-white"
              }`}
              aria-hidden
            >
              <span className={`h-1.5 w-8 rounded-full ${value === "dark" ? "bg-zinc-600" : "bg-zinc-300"}`} />
              <span className={`h-1.5 w-12 rounded-full ${value === "dark" ? "bg-zinc-700" : "bg-zinc-200"}`} />
              <span
                className={`absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full ${
                  active ? "bg-primary" : value === "dark" ? "bg-zinc-600" : "bg-zinc-300"
                }`}
              />
            </span>
            <span
              className={`flex items-center gap-1.5 text-[11px] font-bold ${
                active ? "text-primary" : "text-text-muted"
              }`}
            >
              <Icon size={12} aria-hidden />
              {label}
              {active && <Check size={11} className="ml-auto text-primary" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Language tiles with native-script names (proper nouns — never translated). */
function LanguageCards({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  const opts = [
    { value: "en", native: "English" },
    { value: "hi", native: "हिन्दी" },
    { value: "ne", native: "नेपाली" },
  ];
  return (
    <div role="radiogroup" aria-label={t("language")} className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[44px] flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 transition active:scale-[0.99] ${
              active ? "border-primary bg-primary/5" : "border-border hover:border-text-muted"
            }`}
          >
            <span className={`text-sm font-bold ${active ? "text-primary" : "text-text"}`}>{o.native}</span>
            <span className="text-[9px] uppercase tracking-wide text-faint">{o.value}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Currency dropdown — flag + code + name with a country subtitle.
 *  Custom listbox rather than a native <select>: options can't render the
 *  SVG flag chips, and Windows shows emoji flags as regional letters. */
function CurrencyPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  // Roving focus into the listbox on open (combobox pattern).
  useEffect(() => {
    if (open) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>("[role='option'][aria-selected='true']")
        ?.focus();
    }
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const opts = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") ?? [],
    );
    if (opts.length === 0) return;
    const idx = opts.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown" ? Math.min(idx + 1, opts.length - 1) : Math.max(idx - 1, 0);
    opts[idx === -1 ? 0 : next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-border bg-input px-3 text-sm text-text transition-colors hover:border-primary focus:border-primary focus:outline-none"
      >
        <CurrencyFlag currency={value} size={16} />
        <span className="shrink-0 font-bold">{value}</span>
        <span className="truncate text-text-muted">{CURRENCY_DETAILS[value as CurrencyCode]?.label}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`ml-auto shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-pop"
        >
          {CURRENCIES.map((c) => {
            const active = c === value;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                onClick={() => pick(c)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  active ? "bg-primary-light text-text" : "bg-surface text-text hover:bg-surface-elevated"
                }`}
              >
                <CurrencyFlag currency={c} size={16} />
                <span className="w-9 shrink-0 font-bold">{c}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{CURRENCY_DETAILS[c].label}</span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {COUNTRY_BY_CURRENCY.get(c)}
                  </span>
                </span>
                {active && <Check size={13} aria-hidden className="shrink-0 text-primary-strong" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PrivacyToggle() {
  const { isPrivacyMode, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={isPrivacyMode}
      aria-label="Privacy mode"
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        isPrivacyMode ? "border-primary bg-primary" : "border-border bg-surface-elevated"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-all ${
          isPrivacyMode ? "left-[24px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** Inline name editor (mobile profile parity): pencil → input → save/cancel. */
function IdentityName() {
  const { profile, saveProfile } = useAuth();
  const { showToast } = useToast();
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
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
        className="h-9 w-full max-w-56 rounded-lg border border-primary bg-input px-2.5 text-sm font-semibold text-text focus:outline-none"
      />
      <button
        onClick={save}
        disabled={saving}
        className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
      >
        <Check size={12} /> Save
      </button>
      <button
        onClick={() => setEditing(false)}
        className="h-8 rounded-lg border border-border px-3 text-[11px] font-bold uppercase tracking-wide text-text-muted"
      >
        Cancel
      </button>
    </div>
  );
}
