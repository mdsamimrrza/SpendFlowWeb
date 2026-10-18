"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Coins,
  Download,
  Eye,
  EyeOff,
  Home,
  LogOut,
  Menu,
  Moon,
  PieChart,
  Plus,
  Repeat,
  ScrollText,
  Settings as SettingsIcon,
  Sun,
  SunMoon,
  Tags,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useTheme } from "@/store/ThemeContext";
import { isAllowedAvatarUrl } from "@/services/auth";
import { ConfirmDialog } from "@/components/ui/Modal";
import { AlertBell } from "@/components/AlertBell";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * V5 "Sage Ledger" shell (2026-10-13 redesign): a floating sage icon rail
 * carries navigation from lg up – it expands on hover to reveal item names
 * (the long tail renders inline; collapsed it keeps its fly-out menu) –
 * under a slim cream command bar. Below lg a hamburger in the brand bar
 * opens the same sidebar as a labeled sage drawer (privacy + theme toggles
 * ride at its foot), and a floating dock's raised center button adds a
 * transaction.
 */

type NavItem = { href: string; labelKey: TranslationKey; Icon: typeof Home };

const RAIL_PRIMARY: NavItem[] = [
  { href: "/overview", labelKey: "home", Icon: Home },
  { href: "/history", labelKey: "history", Icon: ScrollText },
  { href: "/analytics", labelKey: "analytics", Icon: BarChart3 },
  { href: "/accounts", labelKey: "accounts", Icon: Wallet },
  { href: "/transfer", labelKey: "transferTitle", Icon: ArrowLeftRight },
  { href: "/recurring", labelKey: "recurring", Icon: Repeat },
];

const RAIL_MENU: NavItem[] = [
  { href: "/profit-loss", labelKey: "pl_title", Icon: PieChart },
  { href: "/categories", labelKey: "navCategories", Icon: Tags },
  { href: "/bullion", labelKey: "bullionTitle", Icon: Coins },
  { href: "/export", labelKey: "exportImportTitle", Icon: Download },
  { href: "/bin", labelKey: "settings_bin", Icon: Trash2 },
];

const DOCK: NavItem[] = [
  { href: "/overview", labelKey: "home", Icon: Home },
  { href: "/history", labelKey: "history", Icon: ScrollText },
  { href: "/analytics", labelKey: "analytics", Icon: BarChart3 },
];

/** The hamburger drawer's list: everything the lg+ rail can reach. */
const NAV_DRAWER: NavItem[] = [...RAIL_PRIMARY, ...RAIL_MENU];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { t } = useLanguage();
  const { isPrivacyMode, toggle: togglePrivacy } = usePrivacy();
  const { preference, setPreference } = useTheme();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // avatar menu
  const [drawerOpen, setDrawerOpen] = useState(false); // hamburger nav drawer
  const avatarRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    href === "/overview" ? pathname === "/overview" : pathname.startsWith(href);

  // Close every floating surface on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes; outside pointer closes the popovers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setDrawerOpen(false);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (
        menuOpen &&
        avatarRef.current &&
        !avatarRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
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
    const parts = name
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean);
    return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? ""}`.toUpperCase();
  };

  const memberName = profile?.display_name || profile?.email || null;

  const themeNext = preference === "light" ? "dark" : preference === "dark" ? "system" : "light";

  const avatar = (
    <div className="relative shrink-0" ref={avatarRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={profile ? memberInitials() : t("signOut")}
        className={`flex h-9 items-center rounded-full transition-colors ${
          menuOpen ? "ring-2 ring-[var(--sf-primary)]" : ""
        }`}
      >
        {profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-8 w-8 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--sf-primary-light)] text-[10.5px] font-bold text-primary-strong">
            {memberInitials()}
          </span>
        )}
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="sf-pop panel absolute right-0 top-[calc(100%+8px)] z-50 w-60 p-1.5 shadow-pop"
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
            {t("rowProfileSecurity")}
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              togglePrivacy();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
          >
            {isPrivacyMode ? (
              <EyeOff size={15} className="text-text-muted" aria-hidden />
            ) : (
              <Eye size={15} className="text-text-muted" aria-hidden />
            )}
            {isPrivacyMode ? t("dockShowAmounts") : t("dockHideAmounts")}
          </button>
          <button
            role="menuitem"
            onClick={() => setConfirmSignOut(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-rust-tint"
          >
            <LogOut size={15} />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      {/* ===== Sage icon rail (lg+) – below the header, expands on hover ===== */}
      <aside className="group/rail fixed bottom-3 left-3 top-[68px] z-40 hidden w-[68px] flex-col items-center overflow-hidden rounded-[24px] bg-[var(--sf-rail)] py-3 shadow-soft transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:w-[236px] lg:flex">
        <nav aria-label={t("spendFlow")} className="scroll-x flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
          {RAIL_PRIMARY.map(({ href, labelKey, Icon }) => (
            <RailRow
              key={href}
              href={href}
              label={t(labelKey)}
              Icon={Icon}
              active={isActive(href)}
            />
          ))}

          {/* Group divider (Supabase-style sections) */}
          <div
            aria-hidden
            className="my-1 h-px w-8 shrink-0 bg-white/20 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:w-full"
          />

          {RAIL_MENU.map(({ href, labelKey, Icon }) => (
            <RailRow
              key={href}
              href={href}
              label={t(labelKey)}
              Icon={Icon}
              active={isActive(href)}
            />
          ))}
        </nav>

        <div className="mt-auto flex w-full flex-col items-center gap-1">
          <RailRow
            href="/settings"
            label={t("settings")}
            Icon={SettingsIcon}
            active={isActive("/settings")}
          />
          <div className="flex h-10 w-10 shrink-0 items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:w-full group-hover/rail:justify-start group-hover/rail:gap-3 group-hover/rail:px-3">
            {avatar}
            <span
              aria-hidden
              className="-translate-x-1 invisible min-w-0 max-w-0 flex-1 overflow-hidden whitespace-nowrap opacity-0 text-[13px] font-medium text-[var(--sf-rail-ink)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:visible group-hover/rail:max-w-[170px] group-hover/rail:translate-x-0 group-hover/rail:opacity-100"
            >
              {memberName}
            </span>
          </div>
        </div>
      </aside>

      {/* ===== Command bar – full width, logo at left (Supabase-style) ===== */}
      <div className="glass sticky top-0 z-30 border-b border-border">
        <header className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
          {/* Hamburger – opens the sage nav drawer (below lg) */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("dockMore")}
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-elevated hover:text-text lg:hidden"
          >
            <Menu size={19} aria-hidden />
          </button>

          <Link
            href="/overview"
            className="flex shrink-0 items-center gap-2"
            aria-label={t("spendFlow")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/brand-light.png"
              alt=""
              width={26}
              height={26}
              className="h-[26px] w-[26px] rounded-md ring-1 ring-border dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/brand-dark.png"
              alt=""
              width={26}
              height={26}
              className="hidden h-[26px] w-[26px] rounded-md ring-1 ring-border dark:block"
            />
            <span className="text-[15px] font-bold tracking-tight text-text">
              {t("spendFlow")}
            </span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <AlertBell buttonClassName="h-9 w-9 rounded-full hover:bg-surface-elevated" />
            <PrivacyEyeButton className="h-9 w-9 rounded-full" />
            <ThemeToggle className="hidden h-9 w-9 rounded-full sm:flex" />
            <Link
              href="/expense/new"
              aria-label={t("addTransaction")}
              className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-ink transition-colors hover:bg-primary-strong active:scale-[0.98] lg:flex"
            >
              <Plus size={15} />
              {t("addTransaction")}
            </Link>
            {avatar}
          </div>
        </header>
      </div>

      {/* ===== Content ===== */}
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-36 pt-4 sm:px-6 sm:pt-5 lg:pb-12 lg:pl-[104px]">
        {children}
      </main>

      {/* ===== Floating dock (phones + tablets below md) ===== */}
      {!pathname.startsWith("/expense/") && (
        <nav
          aria-label={t("spendFlow")}
          className="fixed inset-x-3 bottom-3 z-40 lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="glass mx-auto grid h-16 max-w-md grid-cols-5 items-center rounded-2xl border border-border shadow-pop">
            {DOCK.slice(0, 2).map(({ href, labelKey, Icon }) => (
              <DockTab key={href} href={href} label={t(labelKey)} active={isActive(href)}>
                <Icon size={19} aria-hidden />
              </DockTab>
            ))}
            <div className="grid place-items-center">
              <Link
                href="/expense/new"
                aria-label={t("addTransaction")}
                className="grid h-14 w-14 -translate-y-4 place-items-center rounded-2xl bg-primary text-primary-ink shadow-pop transition-transform active:scale-95"
              >
                <Plus size={22} aria-hidden />
              </Link>
            </div>
            {DOCK.slice(2).map(({ href, labelKey, Icon }) => (
              <DockTab key={href} href={href} label={t(labelKey)} active={isActive(href)}>
                <Icon size={19} aria-hidden />
              </DockTab>
            ))}
            <DockTab href="/settings" label={t("settings")} active={isActive("/settings")}>
              <SettingsIcon size={19} aria-hidden />
            </DockTab>
          </div>
        </nav>
      )}

      {/* ===== Sage nav drawer (hamburger / dock More, below lg) ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("spendFlow")}>
          <button
            aria-label="Close"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-[rgb(32_28_16/0.55)]"
          />
          <div
            className="sf-drawer absolute inset-y-0 left-0 flex w-[286px] max-w-[86vw] flex-col rounded-r-[24px] bg-[var(--sf-rail)] shadow-pop"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center gap-2.5 px-3 pb-2 pt-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sf-rail-active-bg)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/brand-light.png"
                  alt=""
                  width={26}
                  height={26}
                  className="h-[26px] w-[26px] rounded-lg"
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--sf-rail-active-bg)]">
                {t("spendFlow")}
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--sf-rail-ink)] transition-colors hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
              >
                <X size={18} />
              </button>
            </div>

            <nav aria-label={t("spendFlow")} className="flex-1 overflow-y-auto px-3 pb-2">
              {RAIL_PRIMARY.map(({ href, labelKey, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`mt-0.5 flex h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors ${
                      active
                        ? "bg-[var(--sf-rail-active-bg)] font-semibold text-[var(--sf-rail-active-ink)]"
                        : "font-medium text-[var(--sf-rail-ink)] hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
                    }`}
                  >
                    <Icon size={17} aria-hidden />
                    {t(labelKey)}
                  </Link>
                );
              })}
              <div aria-hidden className="my-2 border-t border-white/20" />
              {RAIL_MENU.map(({ href, labelKey, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`mt-0.5 flex h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors ${
                      active
                        ? "bg-[var(--sf-rail-active-bg)] font-semibold text-[var(--sf-rail-active-ink)]"
                        : "font-medium text-[var(--sf-rail-ink)] hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
                    }`}
                  >
                    <Icon size={17} aria-hidden />
                    {t(labelKey)}
                  </Link>
                );
              })}
              <div aria-hidden className="my-2 border-t border-white/20" />
              <Link
                href="/settings"
                aria-current={isActive("/settings") ? "page" : undefined}
                onClick={() => setDrawerOpen(false)}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors ${
                  isActive("/settings")
                    ? "bg-[var(--sf-rail-active-bg)] font-semibold text-[var(--sf-rail-active-ink)]"
                    : "font-medium text-[var(--sf-rail-ink)] hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
                }`}
              >
                <SettingsIcon size={17} aria-hidden />
                {t("settings")}
              </Link>
              {profile && (
                <Link
                  href="/profile"
                  onClick={() => setDrawerOpen(false)}
                  className="mt-0.5 flex h-14 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-[var(--sf-rail-ink)] transition-colors hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
                >
                  {profile.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full border border-white/40 object-cover"
                    />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--sf-rail-active-bg)] text-[10.5px] font-bold text-[var(--sf-rail-active-ink)]">
                      {memberInitials()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{memberName}</span>
                </Link>
              )}
            </nav>

            <div className="flex flex-col gap-0.5 border-t border-white/20 px-3 py-3">
              <button
                type="button"
                onClick={togglePrivacy}
                className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-[var(--sf-rail-ink)] transition-colors hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
              >
                {isPrivacyMode ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                {isPrivacyMode ? t("dockShowAmounts") : t("dockHideAmounts")}
              </button>
              <button
                type="button"
                onClick={() => setPreference(themeNext)}
                className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-[var(--sf-rail-ink)] transition-colors hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
              >
                {preference === "light" ? (
                  <Sun size={16} aria-hidden />
                ) : preference === "dark" ? (
                  <Moon size={16} aria-hidden />
                ) : (
                  <SunMoon size={16} aria-hidden />
                )}
                {preference === "light"
                  ? t("themeLight")
                  : preference === "dark"
                    ? t("themeDark")
                    : t("themeSystem")}
              </button>
            </div>
          </div>
        </div>
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

function DockTab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium leading-none transition-colors ${
        active ? "text-primary" : "text-text-muted"
      }`}
    >
      {children}
      {label}
    </Link>
  );
}

/**
 * One rail row (Supabase-style): a centered icon tile when the rail is
 * collapsed; on hover-expand the tile stretches full-width and the name
 * slides out beside the icon.
 */
function RailRow({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:w-full group-hover/rail:justify-start group-hover/rail:gap-3 group-hover/rail:px-3 ${
        active
          ? "bg-[var(--sf-rail-active-bg)] text-[var(--sf-rail-active-ink)]"
          : "text-[var(--sf-rail-ink)] hover:bg-white/15 hover:text-[var(--sf-rail-active-bg)]"
      }`}
    >
      <Icon size={19} aria-hidden className="shrink-0" />
      <span
        aria-hidden
        className="-translate-x-1 invisible max-w-0 overflow-hidden whitespace-nowrap text-[13.5px] font-medium opacity-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:visible group-hover/rail:max-w-[170px] group-hover/rail:translate-x-0 group-hover/rail:opacity-100"
      >
        {label}
      </span>
    </Link>
  );
}
