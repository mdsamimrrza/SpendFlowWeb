"use client";

/**
 * Settings - V2 redesign (2026-10-10): identity hero + preferences grouped on
 * the left, workspace/data menu sections on the right at lg (single column on
 * phones). Same behavior as the mobile mirror: the currency, theme, language,
 * notifications and sign-out modals keep their flows; menu rows route to the
 * same destinations. The privacy eye and theme flip live in the shell topbar.
 * Tokens only; tints from globals.css --sf-set-* / tailwind semantic colors.
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
import { useToast } from "@/store/ToastContext";
import { Panel } from "@/components/ui/Card";
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
const LANGUAGE_FLAG: Record<string, string> = { en: "gb", hi: "in", ne: "np" };

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

  const preferredCurrency = profile?.preferred_currency ?? "NPR";
  const displayName = profile?.display_name || profile?.email?.split("@")[0] || "User";
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
    <main className="-mt-3 mx-auto w-full max-w-[480px] md:max-w-[560px] lg:max-w-[1060px]">
      {/* Header - privacy eye & theme flip live in the shell topbar */}
      <header className="mb-5 mt-1">
        <h1 className="text-[26px] font-bold tracking-tight text-text">
          {t("settings")}
        </h1>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ── Left rail: identity hero + preferences (modals) ── */}
        <div className="space-y-4">
          {/* Profile hero */}
          <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-soft">
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
                <p className="truncate text-[17px] font-bold leading-6 tracking-[-0.01em] text-text">
                  {displayName}
                </p>
                <p className="truncate text-xs leading-4 text-text-muted">
                  {profile?.email || t("settingsAccountFallback")}
                </p>
                <div className="mt-[3px] flex items-center gap-[5px]">
                  <ShieldCheck size={13} className="text-success" aria-hidden />
                  <span className="text-[11px] font-semibold text-success">
                    {t("settingsVerifiedCloud")}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/profile"
              className="shrink-0 rounded-lg border border-border bg-surface px-3 py-[7px] text-xs font-semibold text-text-muted transition-colors hover:border-faint hover:text-text"
            >
              {t("settingsEdit")}
            </Link>
          </section>

          {/* Preferences - the four modal rows */}
          <Panel label={t("settingsPrefs")}>
            <MenuRow
              icon={DollarSign}
              chip="bg-[var(--sf-primary-light)]"
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
              icon={isDark ? Moon : Sun}
              chip="bg-[var(--sf-primary-light)]"
              label={t("theme")}
              onOpen={() => setAppearanceModalOpen(true)}
              right={
                <span className="text-sm font-medium text-text-muted">
                  {preference === "dark" ? t("dark") : t("light")}
                </span>
              }
            />
            <MenuDivider />
            <MenuRow
              icon={Globe}
              chip="bg-[var(--sf-primary-light)]"
              label={t("language")}
              onOpen={() => setLanguageModalOpen(true)}
              right={
                <span className="flex items-center gap-1.5 text-sm font-medium text-text-muted">
                  <Flag country={LANGUAGE_FLAG[language] ?? "gb"} size={16} />
                  {language === "en" ? "English" : language === "hi" ? "हिन्दी" : "नेपाली"}
                </span>
              }
            />
            <MenuDivider />
            <MenuRow
              icon={Bell}
              chip="bg-[var(--sf-primary-light)]"
              label={t("rowNotifications")}
              onOpen={() => setNotificationsModalOpen(true)}
              right={<span className="text-[13px] font-semibold text-primary">{t("settingsActive")}</span>}
            />
          </Panel>
        </div>

        {/* ── Right: workspace + data sections, then sign-out ── */}
        <div className="space-y-4">
          <Panel label={t("navLedger")}>
            <MenuRow
              icon={TrendingUp}
              chip="bg-[var(--sf-primary-light)]"
              label={t("rowBudgetReports")}
              href="/profit-loss"
            />
            <MenuDivider />
            <MenuRow
              icon={Tag}
              chip="bg-[var(--sf-tint-success)]"
              label={t("rowCategoriesBudgets")}
              href="/categories"
              right={
                <span className="text-sm font-medium text-text-muted">{categoryCount}</span>
              }
            />
            <MenuDivider />
            <MenuRow
              icon={Landmark}
              chip="bg-[var(--sf-tint-sky)]"
              iconColor="text-[var(--sf-set-icon-blue)]"
              label={t("rowAccounts")}
              href="/accounts"
            />
            <MenuDivider />
            <MenuRow
              icon={Coins}
              chip="bg-[var(--sf-tint-amber)]"
              iconColor="text-hue-amber"
              label={t("rowBullion")}
              href="/bullion"
            />
          </Panel>

          <Panel label={t("exportImportTitle")}>
            <MenuRow
              icon={Upload}
              chip="bg-[var(--sf-primary-light)]"
              label={t("settingsExportData")}
              href="/export"
              right={<span className="text-sm font-medium text-text-muted">{t("settingsCsvPdf")}</span>}
            />
            <MenuDivider />
            <MenuRow
              icon={Trash2}
              chip="bg-surface-elevated"
              iconColor="text-text-muted"
              label={t("settings_bin")}
              href="/bin"
            />
          </Panel>

          {/* Sign out */}
          <div className="flex lg:justify-end">
            <button
              onClick={() => setSignOutModalOpen(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-6 text-sm font-semibold text-danger transition-colors hover:border-danger/40 hover:bg-rust-tint lg:w-auto"
            >
              <LogOut size={16} aria-hidden />
              {t("settingsSignOut")}
            </button>
          </div>
        </div>
      </div>

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
          <div className="flex items-center justify-between rounded-lg border border-primary bg-[var(--sf-primary-light)] p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <CurrencyFlag currency={preferredCurrency} size={20} />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-primary-strong">
                  {preferredCurrency} · {CURRENCY_DETAILS[preferredCurrency as CurrencyCode]?.symbol}
                </p>
                <p className="truncate text-[10.5px] text-text-muted">
                  {CURRENCY_DETAILS[preferredCurrency as CurrencyCode]?.label}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-[10px] font-semibold text-primary">{t("settingsCurrent")}</span>
          </div>
          {/* Currency-consistency (2026-09-16): explain the display basis up front. */}
          <p className="mt-2 text-[11px] leading-4 text-faint">{t("settingsCurrencyNote")}</p>

          {/* Currency chips */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CURRENCIES.map((code) => {
              const selected = preferredCurrency === code;
              const country = COUNTRY_BY_CURRENCY.get(code);
              return (
                <button
                  key={code}
                  onClick={() => void onCurrency(code)}
                  className={`flex w-[calc(33.333%-4px)] grow-0 basis-[31%] max-w-[36%] flex-col items-center justify-center gap-[2px] rounded-lg border px-2 py-2.5 transition-colors ${
                    selected
                      ? "border-primary bg-[var(--sf-set-cur-selected)]"
                      : "border-border bg-surface-elevated hover:border-faint"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <CurrencyFlag currency={code} size={15} />
                    <span
                      className={`text-[11.5px] ${
                        selected ? "font-bold text-primary-strong" : "font-semibold text-text"
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
            ] as const
          ).map(({ key, label, Icon }) => {
            const selected = preference === key;
            return (
              <button
                key={key}
                onClick={() => setPreference(key)}
                className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border py-3.5 transition-colors ${
                  selected
                    ? "border-primary bg-[var(--sf-primary-light)]"
                    : "border-border bg-surface-elevated hover:border-faint"
                }`}
              >
                <Icon size={20} className={selected ? "text-primary" : "text-text-muted"} aria-hidden />
                <span
                  className={`text-[13px] ${
                    selected ? "font-bold text-primary-strong" : "font-semibold text-text"
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
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-primary bg-[var(--sf-primary-light)]"
                    : "border-border bg-surface-elevated hover:border-faint"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Flag country={LANGUAGE_FLAG[l.code]} size={22} />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-bold ${
                        active ? "text-primary-strong" : "text-text"
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
          <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-3.5">
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-[var(--sf-primary-light)]"
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
        bare
      >
        <div className="flex flex-col items-center gap-3 pt-1.5">
          <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-rust-tint">
            <LogOut size={24} className="text-danger" aria-hidden />
          </span>
          <h2 className="text-center text-lg font-bold text-text">{t("settingsSignOutTitle")}</h2>
          <p className="text-center text-[13px] leading-[18px] text-text-muted">
            {t("settingsSignOutBodyWeb")}
          </p>
        </div>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={() => setSignOutModalOpen(false)}
            disabled={signingOut}
            className="flex-1 rounded-lg border border-border bg-surface py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => void doSignOut()}
            disabled={signingOut}
            className="flex-[1.2] rounded-lg bg-danger py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-70"
          >
            {t("signOut")}
          </button>
        </div>
        <button
          onClick={() => void revokeEverywhere()}
          disabled={signingOut}
          className="mx-auto mt-3 block rounded px-3 py-1.5 text-[12.5px] font-medium text-text-muted underline transition-colors hover:text-text disabled:opacity-50"
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
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${chip}`}
          aria-hidden
        >
          <Icon size={17} className={iconColor} />
        </span>
        <span className="truncate text-[14.5px] font-medium text-text">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {right}
        <ChevronRight size={15} className="text-faint" aria-hidden />
      </span>
    </>
  );
  const cls =
    "flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors last:rounded-b-xl hover:bg-surface-elevated";
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

const MenuDivider = () => <div aria-hidden className="mx-4 h-px bg-border" />;

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
 * Settings modal shell: dim overlay → centered 380px card, header row with
 * icon chip, title, caption, X button. Escape closes.
 */
function SheetModal({
  open,
  onClose,
  icon: Icon,
  title,
  sub,
  children,
  overlay = "bg-black/60",
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  sub?: string;
  children: ReactNode;
  overlay?: string;
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
        className="sf-pop max-h-[85vh] w-full max-w-[380px] overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-pop"
      >
        {!bare && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--sf-primary-light)]"
                aria-hidden
              >
                <Icon size={18} className="text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-5 text-text">{title}</p>
                {sub && <p className="mt-0.5 truncate text-[11.5px] text-text-muted">{sub}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-elevated text-text-muted transition-colors hover:text-text"
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
