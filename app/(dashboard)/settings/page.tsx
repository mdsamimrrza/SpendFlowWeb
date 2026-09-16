"use client";

/**
 * Settings — 1:1 web mirror of mobile app/(tabs)/settings.tsx: kicker +
 * title header with privacy-eye & theme round buttons, the primary-bordered
 * profile hero card with live-dot avatar, ONE grouped menu card (currency →
 * reports → categories → accounts → bullion → bin → notifications
 * → theme → language → export) with 38px tone chips and hairline dividers,
 * the rust-accent full sign-out pill, and the same fade modals.
 * Mobile-first: the column is the design at 390px; larger screens only
 * widen the centered column. Tints are tokens (globals.css --sf-set-*).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Check,
  ChevronRight,
  Coins,
  DollarSign,
  Eye,
  EyeOff,
  Globe,
  Landmark,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useTheme } from "@/store/ThemeContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { CURRENCIES, CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";
import { WIZARD_COUNTRIES } from "@/constants/countries";
import { listCategories } from "@/services/categories";
import { resetAlertHistory } from "@/services/alerts";
import { signOutAllDevices, isAllowedAvatarUrl } from "@/services/auth";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Country name per currency (mobile chips subtitle parity). */
const COUNTRY_BY_CURRENCY = new Map<string, string>(
  WIZARD_COUNTRIES.map((c) => [c.currency, c.name]),
);

/** Language → flag country (mobile renders emoji flags; Windows can't). */
const LANGUAGE_FLAG: Record<string, string> = { en: "us", hi: "in", ne: "np" };

function Flag({ country, size = 20 }: { country: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local SVG
    <img
      src={`/flags/${country}.svg`}
      alt=""
      aria-hidden
      width={Math.round((size * 4) / 3)}
      height={size}
      className="inline-block shrink-0 rounded-[2px] object-contain ring-1 ring-border/60"
    />
  );
}

export default function SettingsPage() {
  const { profile, user, saveProfile, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { isDark, preference, setPreference } = useTheme();
  const { isPrivacyMode, toggle } = usePrivacy();
  const { showToast } = useToast();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [signOutModalOpen, setSignOutModalOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [categoryCount, setCategoryCount] = useState(0);

  // Mobile: displayName falls back to the email local-part, then the
  // seeded sample account; email falls back to the sample address.
  const preferredCurrency = profile?.preferred_currency ?? "NPR";
  const displayName =
    profile?.display_name || profile?.email?.split("@")[0] || "Samim Reza";
  const initials = displayName.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!user?.id) return;
    listCategories(supabase, user.id)
      .then((cats) => setCategoryCount(cats.length))
      .catch(() => setCategoryCount(0));
  }, [user?.id]);

  const onCurrency = async (code: CurrencyCode) => {
    setCurrencyModalOpen(false);
    try {
      // Currency change NEVER rewrites the stored budget (mobile parity).
      await saveProfile({ preferred_currency: code });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t("error"),
        "error",
      );
    }
  };

  const doSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setSignOutModalOpen(false);
      router.push("/sign-in");
      router.refresh();
    } catch {
      showToast(t("error"), "error");
    } finally {
      setSigningOut(false);
    }
  };

  const revokeEverywhere = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutAllDevices(supabase);
      setSignOutModalOpen(false);
      router.push("/sign-in");
      router.refresh();
    } catch {
      showToast(t("error"), "error");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[480px] space-y-4 md:max-w-[560px]">
      {/* ── 1. HEADER (PREFERENCES & LIMITS / SETTINGS) ── */}
      <div className="mt-1 flex items-center justify-between gap-3 pt-1">
        <div className="space-y-0.5">
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-text-muted">
            {t("settingsKicker")}
          </p>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.5px] text-text">
            {t("settings")}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Privacy eye — mobile PrivacyEyeButton (40px circle). */}
          <button
            onClick={toggle}
            aria-label={isPrivacyMode ? "Show balances" : "Hide balances"}
            aria-pressed={isPrivacyMode}
            className={`grid h-10 w-10 place-items-center rounded-full bg-surface transition active:opacity-70 ${
              isPrivacyMode ? "border border-primary" : "border border-border"
            }`}
          >
            {isPrivacyMode ? (
              <EyeOff size={24} className="text-primary" aria-hidden />
            ) : (
              <Eye size={24} className="text-text-muted" aria-hidden />
            )}
          </button>
          {/* Theme flip — mobile ThemeToggle (40px circle, sun on dark). */}
          <button
            onClick={() => setPreference(isDark ? "light" : "dark")}
            aria-label="Toggle light/dark theme"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface transition active:opacity-70"
          >
            {isDark ? (
              <Sun size={20} className="text-hue-amber" aria-hidden />
            ) : (
              <Moon size={20} className="text-text" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* ── 2. USER PROFILE HERO CARD ── */}
      <section className="flex items-center justify-between gap-3 rounded-[20px] border-[1.5px] border-primary bg-surface p-4 shadow-[0_4px_10px_var(--sf-set-hero-glow)]">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="relative shrink-0">
            <div className="grid h-[58px] w-[58px] place-items-center overflow-hidden rounded-full bg-surface-elevated">
              {isAllowedAvatarUrl(profile?.avatar_url ?? "") ? (
                // eslint-disable-next-line @next/next/no-img-element -- external avatar
                <img src={profile?.avatar_url ?? ""} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-text">{initials}</span>
              )}
            </div>
            {/* Online status dot */}
            <span className="absolute bottom-0 right-0 h-[15px] w-[15px] rounded-full border-2 border-surface bg-success" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-extrabold leading-6 tracking-[-0.3px] text-text">
              {displayName}
            </p>
            <p className="truncate text-xs leading-4 text-text-muted">
              {profile?.email || t("settingsAccountFallback")}
            </p>
            <div className="mt-[3px] flex items-center gap-[5px]">
              <ShieldCheck size={13} className="text-success" aria-hidden />
              <span className="text-[11px] font-bold text-success">
                {t("settingsVerifiedCloud")}
              </span>
            </div>
          </div>
        </div>
        <Link
          href="/profile"
          className="shrink-0 rounded-full border border-border bg-surface-elevated px-3.5 py-[7px] text-xs font-bold text-text transition active:opacity-75"
        >
          {t("settingsEdit")}
        </Link>
      </section>

      {/* ── 3. UNIFIED GROUPED SETTINGS MENU ── */}
      <nav className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_2px_8px_var(--sf-set-card-shadow)]">
        <MenuRow
          icon={DollarSign}
          chip="bg-[var(--sf-set-chip-teal)]"
          label={t("currency")}
          onOpen={() => setCurrencyModalOpen(true)}
          right={
            <>
              <CurrencyFlag currency={preferredCurrency} size={18} />
              <span className="text-sm font-medium text-text-muted">
                {CURRENCY_DETAILS[preferredCurrency as CurrencyCode]?.label ?? preferredCurrency}{" "}
                ({CURRENCY_DETAILS[preferredCurrency as CurrencyCode]?.symbol})
              </span>
            </>
          }
        />
        <MenuDivider />
        <MenuRow
          icon={TrendingUp}
          chip="bg-[var(--sf-set-chip-teal)]"
          label={t("rowBudgetReports")}
          href="/profit-loss"
        />
        <MenuDivider />
        <MenuRow
          icon={Tag}
          chip="bg-[var(--sf-set-chip-green)]"
          label={t("rowCategoriesBudgets")}
          href="/categories"
          right={
            <span className="text-sm font-medium text-text-muted">{categoryCount}</span>
          }
        />
        <MenuDivider />
        <MenuRow
          icon={Landmark}
          chip="bg-[var(--sf-set-chip-blue)]"
          iconColor="text-[var(--sf-set-icon-blue)]"
          label={t("rowAccounts")}
          href="/accounts"
        />
        <MenuDivider />
        <MenuRow
          icon={Coins}
          chip="border border-[var(--sf-set-chip-gold-line)] bg-[var(--sf-set-chip-gold)]"
          iconColor="text-hue-amber"
          label={t("rowBullion")}
          href="/bullion"
          right={
            <span className="flex items-center gap-1 rounded-full bg-[var(--sf-set-live-bg)] px-[7px] py-[2px]">
              <span className="h-[5px] w-[5px] rounded-full bg-[var(--sf-hue-emerald)]" />
              <span className="text-[10px] font-extrabold text-[var(--sf-hue-emerald-600)]">
                Live
              </span>
            </span>
          }
        />
        <MenuDivider />
        <MenuRow
          icon={Trash2}
          chip="bg-[var(--sf-set-chip-slate)]"
          iconColor="text-[var(--sf-set-icon-slate)]"
          label={t("settings_bin")}
          href="/bin"
        />
        <MenuDivider />
        <MenuRow
          icon={Bell}
          chip="bg-[var(--sf-set-chip-teal)]"
          label={t("rowNotifications")}
          onOpen={() => setNotificationsModalOpen(true)}
          right={<span className="text-[13px] font-bold text-primary">{t("settingsActive")}</span>}
        />
        <MenuDivider />
        <MenuRow
          icon={isDark ? Moon : Sun}
          chip="bg-[var(--sf-set-chip-teal)]"
          label={t("theme")}
          onOpen={() => setAppearanceModalOpen(true)}
          right={
            <span className="text-sm font-medium text-text-muted">
              {preference === "system" ? t("system") : preference === "dark" ? t("dark") : t("light")}
            </span>
          }
        />
        <MenuDivider />
        <MenuRow
          icon={Globe}
          chip="bg-[var(--sf-set-chip-teal)]"
          label={t("language")}
          onOpen={() => setLanguageModalOpen(true)}
          right={
            <span className="flex items-center gap-1.5 text-sm font-medium text-text-muted">
              <Flag country={LANGUAGE_FLAG[language] ?? "us"} size={16} />
              {language === "en" ? "English" : language === "hi" ? "हिन्दी" : "नेपाली"}
            </span>
          }
        />
        <MenuDivider />
        <MenuRow
          icon={Upload}
          chip="bg-[var(--sf-set-chip-teal)]"
          label={t("settingsExportData")}
          href="/export"
          right={<span className="text-sm font-medium text-text-muted">{t("settingsCsvPdf")}</span>}
        />
      </nav>

      {/* ── 4. SIGN OUT (RUST ACCENT) ── */}
      <button
        onClick={() => setSignOutModalOpen(true)}
        className="mt-1 w-full rounded-full border-[1.5px] border-[var(--sf-set-signout-line)] bg-[var(--sf-set-signout-bg)] py-[14px] text-[15px] font-bold text-danger transition active:opacity-75"
      >
        {t("settingsSignOut")}
      </button>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* ── Currency selection ── */}
      <SheetModal
        open={currencyModalOpen}
        onClose={() => setCurrencyModalOpen(false)}
        icon={DollarSign}
        title={t("settingsSelectCurrency")}
        sub={t("settingsCurrencySub")}
      >
        <div className="mt-4">
          {/* Current selection badge */}
          <div className="flex items-center justify-between rounded-[10px] border border-primary bg-primary-light p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <CurrencyFlag currency={preferredCurrency} size={20} />
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold text-primary">
                  {preferredCurrency} · {CURRENCY_DETAILS[preferredCurrency as CurrencyCode]?.symbol}
                </p>
                <p className="truncate text-[10px] text-text-muted">
                  {CURRENCY_DETAILS[preferredCurrency as CurrencyCode]?.label}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-[9px] font-bold text-primary">{t("settingsCurrent")}</span>
          </div>
          {/* Currency-consistency (2026-09-16): explain the display basis up front. */}
          <p className="mt-2 text-[10.5px] leading-4 text-faint">{t("settingsCurrencyNote")}</p>

          {/* 3-column chip grid (mobile flexBasis 31% / maxWidth 36%) */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CURRENCIES.map((code) => {
              const selected = preferredCurrency === code;
              const country = COUNTRY_BY_CURRENCY.get(code);
              return (
                <button
                  key={code}
                  onClick={() => void onCurrency(code)}
                  className={`flex w-[calc(33.333%-4px)] grow-0 basis-[31%] max-w-[36%] flex-col items-center justify-center gap-[2px] rounded-[14px] border-[1.5px] px-2 py-2.5 transition active:opacity-75 ${
                    selected
                      ? "border-primary bg-[var(--sf-set-cur-selected)]"
                      : "border-border bg-surface-elevated"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <CurrencyFlag currency={code} size={15} />
                    <span
                      className={`text-[11.5px] ${
                        selected ? "font-extrabold text-primary" : "font-semibold text-text"
                      }`}
                    >
                      {code}
                    </span>
                    {selected && <Check size={10} className="font-black text-primary" aria-hidden />}
                  </span>
                  {country && (
                    <span className="w-full truncate text-center text-[9px] text-text-muted">
                      {country}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </SheetModal>

      {/* ── Theme (Light / Dark / System) ── */}
      <SheetModal
        open={appearanceModalOpen}
        onClose={() => setAppearanceModalOpen(false)}
        icon={Sun}
        title={t("theme")}
        sub={t("settingsChooseAppearance")}
      >
        <div className="mt-4 flex gap-2">
          {(
            [
              { key: "light", label: t("light"), Icon: Sun },
              { key: "dark", label: t("dark"), Icon: Moon },
              { key: "system", label: t("system"), Icon: Palette },
            ] as const
          ).map(({ key, label, Icon }) => {
            const selected = preference === key;
            return (
              <button
                key={key}
                onClick={() => setPreference(key)}
                className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] py-3.5 transition active:opacity-75 ${
                  selected
                    ? "border-primary bg-[var(--sf-set-option-selected)]"
                    : "border-border bg-surface-elevated"
                }`}
              >
                <Icon size={20} className={selected ? "text-primary" : "text-text-muted"} aria-hidden />
                <span
                  className={`text-[13px] ${
                    selected ? "font-extrabold text-primary" : "font-semibold text-text"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </SheetModal>

      {/* ── Language ── */}
      <SheetModal
        open={languageModalOpen}
        onClose={() => setLanguageModalOpen(false)}
        icon={Globe}
        title={t("settingsSelectLanguage")}
        sub={t("settingsLanguageSub")}
      >
        <div className="mt-4 space-y-2">
          {(
            [
              { code: "en", name: "English", native: "English (US)" },
              { code: "hi", name: "Hindi", native: "हिन्दी" },
              { code: "ne", name: "Nepali", native: "नेपाली" },
            ] as const
          ).map((l) => {
            const active = language === l.code;
            return (
              <button
                key={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  setLanguageModalOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-[10px] border-[1.5px] p-3 text-left transition active:opacity-75 ${
                  active
                    ? "border-primary bg-[var(--sf-set-option-selected)]"
                    : "border-border bg-surface-elevated"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Flag country={LANGUAGE_FLAG[l.code]} size={22} />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-extrabold ${
                        active ? "text-primary" : "text-text"
                      }`}
                    >
                      {l.name}
                    </span>
                    <span className="block text-[11px] text-text-muted">{l.native}</span>
                  </span>
                </span>
                {active && (
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-primary">
                    <Check size={13} className="text-white" aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SheetModal>

      {/* ── Budget Notifications ── */}
      <SheetModal
        open={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
        icon={Bell}
        title={t("settingsBudgetNotifications")}
        sub={t("settingsMilestoneSub")}
      >
        <div className="mt-4 space-y-2.5">
          <div className="space-y-2 rounded-[10px] border border-border bg-surface-elevated p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-text">
              <Target size={13} className="shrink-0 text-primary" aria-hidden />
              {t("settingsThresholdsTitle")}
            </p>
            <ThresholdLine dot="bg-[var(--sf-hue-emerald)]" bold="25% & 50%" label={t("settingsThresholdPacing")} />
            <ThresholdLine dot="bg-[var(--sf-hue-amber)]" bold="75% & 90%" label={t("settingsThresholdCaution")} />
            <ThresholdLine dot="bg-[var(--sf-hue-red)]" bold="100%+" label={t("settingsThresholdCeiling")} />
          </div>
          <button
            onClick={() => void onResetAlerts()}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface-elevated py-3 text-[13px] font-bold text-primary transition active:opacity-75"
          >
            <RefreshCw size={14} aria-hidden />
            {t("settingsResetAlerts")}
          </button>
        </div>
      </SheetModal>

      {/* ── Sign out confirmation ── */}
      <SheetModal
        open={signOutModalOpen}
        onClose={() => !signingOut && setSignOutModalOpen(false)}
        icon={LogOut}
        title={t("settingsSignOutTitle")}
        overlay="bg-black/70"
        card="rounded-[24px] p-[22px]"
        bare
      >
        <div className="flex flex-col items-center gap-3 pt-1.5">
          <span className="grid h-[54px] w-[54px] place-items-center rounded-full border-[1.5px] border-[var(--sf-set-danger-line)] bg-[var(--sf-set-danger-bg)]">
            <LogOut size={26} className="text-danger" aria-hidden />
          </span>
          <h2 className="text-center text-[19px] font-black text-text">{t("settingsSignOutTitle")}</h2>
          <p className="text-center text-[13px] leading-[18px] text-text-muted">
            {t("settingsSignOutBodyWeb")}
          </p>
        </div>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={() => setSignOutModalOpen(false)}
            disabled={signingOut}
            className="flex-1 rounded-[10px] border border-border bg-surface-elevated py-[13px] text-sm font-bold text-text transition active:opacity-75 disabled:opacity-60"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => void doSignOut()}
            disabled={signingOut}
            className="flex-[1.2] rounded-[10px] bg-danger py-[13px] text-sm font-extrabold text-white transition active:opacity-90 disabled:opacity-70"
          >
            {t("signOut")}
          </button>
        </div>
        <button
          onClick={() => void revokeEverywhere()}
          disabled={signingOut}
          className="mx-auto mt-3 block rounded px-3 py-1.5 text-[12.5px] font-semibold text-text-muted underline transition active:opacity-70 disabled:opacity-50"
        >
          {t("settingsRevokeSession")}
        </button>
      </SheetModal>
    </main>
  );

  async function onResetAlerts() {
    if (!user?.id) {
      showToast(t("error"), "error");
      return;
    }
    await resetAlertHistory(supabase, user.id);
    setNotificationsModalOpen(false);
    showToast(t("settingsAlertsResetToast"));
  }
}

/* ── pieces ── */

/** One grouped-menu row: tone chip + label left, status + chevron right. */
function MenuRow({
  icon: Icon,
  chip,
  iconColor = "text-primary",
  label,
  right,
  href,
  onOpen,
}: {
  icon: LucideIcon;
  chip: string;
  iconColor?: string;
  label: string;
  right?: ReactNode;
  href?: string;
  onOpen?: () => void;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-3.5">
        <span
          className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] ${chip}`}
          aria-hidden
        >
          <Icon size={19} className={iconColor} />
        </span>
        <span className="truncate text-[15px] font-semibold text-text">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {right}
        <ChevronRight size={16} className="text-text-muted" aria-hidden />
      </span>
    </>
  );
  const cls =
    "flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-[14px] text-left transition-colors active:bg-[var(--sf-set-press)]";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onOpen} className={cls}>
      {inner}
    </button>
  );
}

const MenuDivider = () => <div aria-hidden className="mx-4 h-px bg-border opacity-60" />;

/** Milestone line in the notifications modal (mobile colored-dot parity). */
function ThresholdLine({ dot, bold, label }: { dot: string; bold: string; label: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-text-muted">
      <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span>
        <b className="font-bold text-text">{bold}</b> - {label}
      </span>
    </p>
  );
}

/**
 * Mobile settings modal shell: dim overlay → centered 360px paper card,
 * header row with teal icon chip, 16/800 title, 11px caption, 28px X button.
 */
function SheetModal({
  open,
  onClose,
  icon: Icon,
  title,
  sub,
  children,
  overlay = "bg-black/60",
  card = "rounded-[20px] p-5",
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  sub?: string;
  children: ReactNode;
  overlay?: string;
  card?: string;
  /** true: skip the standard header (sign-out confirm has its own). */
  bare?: boolean;
}) {
  const { t } = useLanguage();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-6 ${overlay}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sf-pop max-h-[85vh] w-full max-w-[360px] overflow-y-auto border border-border bg-surface shadow-pop ${card}`}
      >
        {!bare && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sf-set-chip-teal)]"
                aria-hidden
              >
                <Icon size={18} className="text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-extrabold leading-5 text-text">{title}</p>
                {sub && <p className="mt-0.5 truncate text-[11px] text-text-muted">{sub}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-elevated text-text transition active:opacity-75"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        )}
        {bare ? children : <div>{children}</div>}
      </div>
    </div>,
    document.body,
  );
}
