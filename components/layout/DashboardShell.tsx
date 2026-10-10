"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  Coins,
  Download,
  Home,
  LogOut,
  Plus,
  PieChart,
  Repeat,
  ScrollText,
  Settings as SettingsIcon,
  Tags,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { isAllowedAvatarUrl } from "@/services/auth";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AlertBell } from "@/components/AlertBell";
import { ConfirmDialog } from "@/components/ui/Modal";

/* Primary ledger sections — also the phone dock. */
const NAV: { href: string; labelKey: TranslationKey; Icon: typeof Home; enabled: boolean }[] = [
  { href: "/overview", labelKey: "home", Icon: Home, enabled: true },
  { href: "/history", labelKey: "history", Icon: ScrollText, enabled: true },
  { href: "/analytics", labelKey: "analytics", Icon: BarChart3, enabled: true },
  { href: "/recurring", labelKey: "recurring", Icon: Repeat, enabled: true },
  { href: "/settings", labelKey: "settings", Icon: SettingsIcon, enabled: true },
];

/* Sidebar-only destinations (V2 navigation surface). */
const SIDEBAR: { href: string; labelKey: TranslationKey; Icon: typeof Home }[] = [
  { href: "/accounts", labelKey: "accounts", Icon: Wallet },
  { href: "/transfer", labelKey: "transferTitle", Icon: ArrowLeftRight },
  { href: "/profit-loss", labelKey: "pl_title", Icon: PieChart },
  { href: "/categories", labelKey: "navCategories", Icon: Tags },
  { href: "/bullion", labelKey: "bullionTitle", Icon: Coins },
  { href: "/export", labelKey: "exportImportTitle", Icon: Download },
  { href: "/bin", labelKey: "settings_bin", Icon: Trash2 },
];

/**
 * V2 shell (2026-10-10 redesign): a fixed sidebar carries the full
 * navigation from lg up; the sticky topbar holds only the quiet actions,
 * the primary action and the account menu. Phones keep a compact brand row
 * and a flat, full-width bottom tab bar.
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

  const sideItem = ({ href, labelKey, Icon }: { href: string; labelKey: TranslationKey; Icon: typeof Home }) => {
    const label = t(labelKey);
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors ${
          active
            ? "bg-[var(--sf-primary-light)] font-semibold text-primary-strong"
            : "font-medium text-text-muted hover:bg-surface-elevated hover:text-text"
        }`}
      >
        <Icon size={16} className={active ? "text-primary" : "text-faint"} aria-hidden />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      {/* ===== Sidebar (lg+) ===== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <Link href="/overview" className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/brand-light.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-lg ring-1 ring-border dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/brand-dark.png"
            alt=""
            width={28}
            height={28}
            className="hidden h-7 w-7 rounded-lg ring-1 ring-border dark:block"
          />
          <span className="text-[15px] font-bold tracking-tight text-text">{t("spendFlow")}</span>
        </Link>
        <nav aria-label={t("navLedger")} className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.filter((n) => n.enabled).map(sideItem)}
          <div className="pt-4">{SIDEBAR.map(sideItem)}</div>
        </nav>
        <div className="border-t border-border p-3">
          <button
            onClick={() => setConfirmSignOut(true)}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-danger"
          >
            <LogOut size={16} className="text-faint" aria-hidden />
            {t("signOut")}
          </button>
        </div>
      </aside>

      {/* ===== Topbar ===== */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface lg:ml-60">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
          {/* Brand (phones + tablets below lg — the sidebar carries it above) */}
          <Link href="/overview" className="flex shrink-0 items-center gap-2 lg:hidden" aria-label={t("spendFlow")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/brand-light.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg ring-1 ring-border dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/brand-dark.png"
              alt=""
              width={28}
              height={28}
              className="hidden h-7 w-7 rounded-lg ring-1 ring-border dark:block"
            />
            <span className="text-[15px] font-bold tracking-tight text-text">{t("spendFlow")}</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <AlertBell buttonClassName="h-9 w-9 rounded-lg hover:bg-surface-elevated" />
            <PrivacyEyeButton className="h-9 w-9" />
            <ThemeToggle className="h-9 w-9" />

            <Link
              href="/expense/new"
              aria-label={t("addTransaction")}
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-strong active:scale-[0.98] sm:w-auto sm:px-3.5"
            >
              <Plus size={16} />
              <span className="hidden md:inline">{t("addTransaction")}</span>
            </Link>

            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={profile ? memberInitials() : t("signOut")}
                className={`flex h-9 items-center gap-2 rounded-lg border pl-1 pr-1 transition-colors sm:pr-2 ${
                  menuOpen
                    ? "border-primary bg-[var(--sf-primary-light)]"
                    : "border-border bg-surface hover:border-faint"
                }`}
              >
                {profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--sf-primary-light)] text-[10.5px] font-bold text-primary-strong">
                    {memberInitials()}
                  </span>
                )}
                {memberName && (
                  <span className="hidden max-w-[9rem] truncate text-[13px] font-medium text-text xl:block">
                    {memberName}
                  </span>
                )}
                <ChevronDown size={14} aria-hidden className="hidden shrink-0 text-faint xl:block" />
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
                    className="panel absolute right-0 top-[calc(100%+8px)] z-50 w-60 p-1.5 shadow-pop"
                  >
                    {profile && (
                      <div className="border-b border-border px-3 pb-2.5 pt-2">
                        <p className="truncate text-sm font-semibold text-text">
                          {profile.display_name ?? "Member"}
                        </p>
                        <p className="truncate text-xs text-faint">{profile.email}</p>
                      </div>
                    )}
                    <Link
                      href="/profile"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                    >
                      <SettingsIcon size={15} className="text-text-muted" />
                      {t("settings")}
                    </Link>
                    <button
                      role="menuitem"
                      onClick={() => setConfirmSignOut(true)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-rust-tint"
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
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:ml-60 lg:w-[calc(100%-15rem)] lg:pb-10 lg:max-w-none xl:px-8">
        {children}
      </main>

      {/* ===== Bottom tab bar (phones only) ===== */}
      {!pathname.startsWith("/expense/") && (
        <nav
          aria-label={t("navLedger")}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-tab md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-lg items-stretch">
            {NAV.map(({ href, labelKey, Icon, enabled }) => {
              const active = enabled && isActive(href);
              const cls = `flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium leading-none transition-colors ${
                active ? "text-primary" : enabled ? "text-text-muted" : "text-faint"
              }`;
              const inner = (
                <>
                  <Icon size={19} aria-hidden />
                  {t(labelKey)}
                </>
              );
              return enabled ? (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cls}
                >
                  {inner}
                </Link>
              ) : (
                <span key={href} className={cls}>
                  {inner}
                </span>
              );
            })}
          </div>
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
