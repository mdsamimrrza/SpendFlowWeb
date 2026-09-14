"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  LogOut,
  Plus,
  Repeat,
  Settings as SettingsIcon,
  ScrollText,
  Home,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { isAllowedAvatarUrl } from "@/services/auth";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AlertBell } from "@/components/AlertBell";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { ConfirmDialog } from "@/components/ui/Modal";

const NAV = [
  { href: "/overview", labelKey: "home", Icon: Home, enabled: true },
  { href: "/history", labelKey: "history", Icon: ScrollText, enabled: true },
  { href: "/analytics", labelKey: "analytics", Icon: BarChart3, enabled: true },
  { href: "/recurring", labelKey: "recurring", Icon: Repeat, enabled: true },
  { href: "/settings", labelKey: "settings", Icon: SettingsIcon, enabled: true },
] as const;

/**
 * Neo header — tab-rule design. The ledger's sections sit in a full-height
 * tab row whose active underline lands directly on the header rule (no
 * floating pills); the brand is fenced off by a hairline divider. Quiet
 * actions (alerts, privacy, theme) collapse into one segmented toolbar, and
 * the account becomes a chip with initials, name and caret. Phones get a
 * compact 44px command row and keep the floating dock for wayfinding.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { t } = useLanguage();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/overview" ? pathname === "/overview" : pathname.startsWith(href);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const signOutNow = async () => {
    setConfirmSignOut(false);
    setMenuOpen(false);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const memberInitials = () => {
    const name = profile?.display_name || profile?.email || "SF";
    const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
    return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? ""}`.toUpperCase();
  };

  const memberName = profile?.display_name || profile?.email || null;

  /* Full-height tab that underlines itself onto the header's bottom rule.
     Icons on md–lg, labels from lg up. */
  const navTab = ({ href, labelKey, Icon, enabled }: (typeof NAV)[number]) => {
    const label = t(labelKey);
    const active = enabled && isActive(href);
    const base =
      "flex h-full items-center justify-center gap-2 border-b-2 px-3 text-sm transition-colors lg:px-4";
    if (!enabled) {
      return (
        <span
          key={href}
          title={`${label} — ${t("comingSoon")}`}
          className={`${base} cursor-not-allowed border-transparent text-faint`}
        >
          <Icon size={16} />
          <span className="hidden lg:inline">{label}</span>
        </span>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={`${base} ${
          active
            ? "border-primary font-bold text-primary"
            : "border-transparent font-semibold text-text-muted hover:border-border hover:text-text"
        }`}
      >
        <Icon size={16} />
        <span className="hidden lg:inline">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ===== Header (all sizes) ===== */}
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-1.5 px-4 sm:gap-3 sm:px-6">
          {/* Brand */}
          <Link
            href="/overview"
            className="flex shrink-0 items-center gap-2.5"
            aria-label={t("spendFlow")}
          >
            <SpendFlowSeal size={28} />
            <span className="font-brand text-base font-extrabold tracking-tight text-text sm:text-lg">
              {t("spendFlow")}
            </span>
          </Link>

          {/* Hairline fence between brand and tabs */}
          <div
            aria-hidden
            className="my-3 hidden h-10 w-px shrink-0 self-center bg-border md:block"
          />

          {/* Section tabs — icons on md–lg, labels from lg */}
          <nav
            aria-label={t("navLedger")}
            className="hidden h-full items-stretch self-stretch md:flex"
          >
            {NAV.map(navTab)}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            {/* Quiet-actions segmented toolbar */}
            <div className="flex items-center gap-0.5 rounded-xl border border-border bg-surface-elevated p-1">
              <span className="hidden sm:contents">
                <AlertBell buttonClassName="h-9 w-9 rounded-md hover:bg-primary-light" />
              </span>
              <span className="hidden sm:contents">
                <PrivacyEyeButton className="h-9 w-9" />
              </span>
              <ThemeToggle className="h-11 w-11 sm:h-9 sm:w-9" />
            </div>

            {/* Primary action — icon on phones, labelled from md */}
            <Link
              href="/expense/new"
              aria-label={t("addTransaction")}
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-white shadow-soft transition-all hover:bg-primary-strong active:scale-[0.97] dark:text-background sm:h-10 sm:w-10 md:w-auto md:px-4"
            >
              <Plus size={18} />
              <span className="hidden md:inline">{t("addTransaction")}</span>
            </Link>

            {/* Account chip */}
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={profile ? memberInitials() : t("signOut")}
                className={`flex h-11 items-center gap-2 rounded-xl border pl-1.5 pr-1.5 transition-colors sm:h-10 ${
                  menuOpen
                    ? "border-primary bg-primary-light"
                    : "border-border bg-surface-elevated hover:border-primary/50"
                }`}
              >
                {profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-light text-[11px] font-extrabold text-primary-strong">
                    {memberInitials()}
                  </span>
                )}
                {memberName && (
                  <span className="hidden max-w-[9rem] truncate text-sm font-bold text-text xl:block">
                    {memberName}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  aria-hidden
                  className="hidden shrink-0 text-text-muted xl:block"
                />
              </button>
              {menuOpen && (
                <>
                  <button
                    aria-label="Close menu"
                    tabIndex={-1}
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div
                    role="menu"
                    className="panel absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl p-1.5 shadow-pop"
                  >
                    {profile && (
                      <div className="border-b border-border px-3 pb-2.5 pt-2">
                        <p className="truncate text-sm font-bold text-text">
                          {profile.display_name ?? "Member"}
                        </p>
                        <p className="truncate text-xs text-faint">
                          {profile.email}
                        </p>
                      </div>
                    )}
                    <Link
                      href="/settings"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
                    >
                      <SettingsIcon size={15} className="text-text-muted" />
                      {t("settings")}
                    </Link>
                    <button
                      role="menuitem"
                      onClick={() => setConfirmSignOut(true)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold text-danger transition-colors hover:bg-rust-tint"
                    >
                      <LogOut size={15} />
                      {t("signOut")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ===== Content ===== */}
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-36 pt-6 sm:px-6 md:pb-10">
        {children}
      </main>

      {/* Floating glass dock (phones only; hidden on expense entry pages —
          the sticky save bar occupies that corner there). */}
      {!pathname.startsWith("/expense/") && (
        <nav
          aria-label={t("navLedger")}
          className="glass fixed left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 items-center justify-between gap-1 rounded-full border border-border px-2 py-1.5 shadow-pop md:hidden"
          style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          {NAV.map(({ href, labelKey, Icon, enabled }) => {
            const active = enabled && isActive(href);
            const cls = `flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 text-[9px] font-bold uppercase transition-colors ${
              active
                ? "bg-primary text-white shadow-soft dark:text-background"
                : enabled
                  ? "text-text-muted"
                  : "text-faint"
            }`;
            return enabled ? (
              <Link
                key={href}
                href={href}
                title={t(labelKey)}
                aria-current={active ? "page" : undefined}
                className={cls}
              >
                <Icon size={18} />
                {t(labelKey)}
              </Link>
            ) : (
              <span key={href} className={cls}>
                <Icon size={18} />
                {t(labelKey)}
              </span>
            );
          })}
        </nav>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        title={t("signOut")}
        body="You can sign back in with your password."
        confirmLabel={t("signOut")}
        cancelLabel={t("cancel")}
        onConfirm={signOutNow}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
