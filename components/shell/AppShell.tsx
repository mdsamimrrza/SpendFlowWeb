"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Eye,
  EyeOff,
  FileText,
  Landmark,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  PieChart,
  PlusCircle,
  Repeat,
  Search,
  Settings as SettingsIcon,
  Sun,
  SunMoon,
  Tag,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useTheme } from "@/store/ThemeContext";
import { isAllowedAvatarUrl } from "@/services/auth";
import { ConfirmDialog } from "@/components/ui/Modal";
import { AlertBell } from "@/components/AlertBell";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";

type NavItem = { href: string; label: string; Icon: typeof LayoutGrid };

/**
 * Theme flip with the View Transitions circular reveal: the new theme
 * floods the screen from the toggle as a smooth expanding circle (water-
 * flow feel). Falls back to an instant switch when the API or motion is
 * unavailable.
 */
function themeReveal(apply: () => void, origin?: { x: number; y: number }) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    apply();
    return;
  }
  const transition = doc.startViewTransition(() => flushSync(apply));
  void transition.ready.then(() => {
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}

const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", Icon: LayoutGrid },
  { href: "/history", label: "Transactions", Icon: FileText },
  { href: "/expense/new", label: "Add Transaction", Icon: PlusCircle },
  { href: "/analytics", label: "Analytics", Icon: TrendingUp },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/profit-loss", label: "Budgets", Icon: PieChart },
  { href: "/recurring", label: "Recurring Transactions", Icon: Repeat },
  { href: "/categories", label: "Categories", Icon: Tag },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { t } = useLanguage();
  const { isPrivacyMode, toggle: togglePrivacy } = usePrivacy();
  const { preference, isDark, setPreference } = useTheme();

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
    const name = profile?.display_name || profile?.email || "AJ";
    const parts = name
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean);
    return `${parts[0]?.[0] ?? "A"}${parts[1]?.[0] ?? "J"}`.toUpperCase();
  };

  const themeNext = preference === "light" ? "dark" : preference === "dark" ? "system" : "light";

  const avatar = (
    <div className="relative shrink-0" ref={avatarRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={profile ? memberInitials() : t("signOut")}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95"
      >
        {profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-9 w-9 rounded-full border border-gray-200 dark:border-[#262626] object-cover"
          />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-[11px] font-bold text-white shadow-sm ring-1 ring-emerald-200">
            {memberInitials()}
          </div>
        )}
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="panel absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-xl border border-gray-200 dark:border-[#262626] bg-white dark:bg-[#0a0a0a] p-1.5 shadow-lg"
        >
          <div className="border-b border-gray-100 dark:border-[#262626] px-3 pb-2.5 pt-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {profile?.display_name || profile?.email || "User"}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{profile?.email || "alex@spendflow.app"}</p>
          </div>
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-[#141414]"
          >
            <SettingsIcon size={15} className="text-gray-400" />
            {t("rowProfileSecurity")}
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              togglePrivacy();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-[#141414]"
          >
            {isPrivacyMode ? (
              <EyeOff size={15} className="text-gray-400" aria-hidden />
            ) : (
              <Eye size={15} className="text-gray-400" aria-hidden />
            )}
            {isPrivacyMode ? t("dockShowAmounts") : t("dockHideAmounts")}
          </button>
          <button
            role="menuitem"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              themeReveal(() => setPreference(isDark ? "light" : "dark"), {
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
              });
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-[#141414]"
          >
            {isDark ? (
              <Sun size={15} className="text-gray-400" aria-hidden />
            ) : (
              <Moon size={15} className="text-gray-400" aria-hidden />
            )}
            {isDark ? "Light Theme" : "Dark Theme"}
          </button>
          <button
            role="menuitem"
            onClick={() => setConfirmSignOut(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <LogOut size={15} />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f8f9fa] dark:bg-[#000000] text-gray-900 dark:text-gray-100">
      {/* ===== Left Fixed Sidebar (lg+) ===== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] py-6 lg:flex">
        {/* Brand Header */}
        <Link href="/overview" className="mb-6 flex items-center gap-3 px-6" aria-label="SpendFlow">
          <SpendFlowSeal size={32} />
          <span className="text-[18px] font-bold tracking-tight text-gray-900 dark:text-gray-100">SpendFlow</span>
        </Link>

        {/* Navigation list */}
        <nav aria-label="SpendFlow" className="flex w-full flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 w-full items-center gap-3 rounded-lg px-3.5 text-[13px] transition-colors ${
                  active
                    ? "bg-[#f0f2f5] dark:bg-[#141414] font-semibold text-gray-900 dark:text-gray-100"
                    : "font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                <Icon size={18} className={active ? "text-gray-800 dark:text-gray-100" : "text-gray-400"} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation Links */}
        <div className="border-t border-[#eaecf0] dark:border-[#262626] px-3 pt-3 flex flex-col gap-1">
          <Link
            href="/notifications"
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3.5 text-[13px] transition-colors ${
              isActive("/notifications")
                ? "bg-[#f0f2f5] dark:bg-[#141414] font-semibold text-gray-900 dark:text-gray-100"
                : "font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <Bell size={18} className={isActive("/notifications") ? "text-gray-800 dark:text-gray-100" : "text-gray-400"} />
            <span>Notifications</span>
          </Link>
          <Link
            href="/settings"
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3.5 text-[13px] transition-colors ${
              isActive("/settings")
                ? "bg-[#f0f2f5] dark:bg-[#141414] font-semibold text-gray-900 dark:text-gray-100"
                : "font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <SettingsIcon size={18} className={isActive("/settings") ? "text-gray-800 dark:text-gray-100" : "text-gray-400"} />
            <span>Settings</span>
          </Link>
          <Link
            href="/profile"
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3.5 text-[13px] transition-colors ${
              isActive("/profile")
                ? "bg-[#f0f2f5] dark:bg-[#141414] font-semibold text-gray-900 dark:text-gray-100"
                : "font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <UserRound size={18} className={isActive("/profile") ? "text-gray-800 dark:text-gray-100" : "text-gray-400"} />
            <span>Profile</span>
          </Link>
        </div>
      </aside>

      {/* ===== Top Header Bar ===== */}
      <div className="sticky top-0 z-30 border-b border-[#eaecf0] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] lg:ml-[240px] lg:w-[calc(100%-240px)]">
        <header className="flex h-16 w-full items-center justify-between px-6">
          {/* Left: Hamburger (mobile) + Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#141414] lg:hidden"
            >
              <Menu size={19} />
            </button>
            {/* App icon beside the hamburger (mobile header brand mark) */}
            <Link
              href="/overview"
              aria-label="SpendFlow"
              className="lg:hidden"
            >
              <SpendFlowSeal size={32} />
            </Link>

          </div>

          {/* Right: Search, Notification Bell, User info + Avatar */}
          <div className="flex items-center gap-3 sm:gap-4">
            <form
              className="relative hidden items-center sm:flex"
              onSubmit={(e) => {
                e.preventDefault();
                const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
                if (q) router.push(`/history?q=${encodeURIComponent(q)}`);
              }}
            >
              <Search size={14} className="absolute left-3 text-gray-400" />
              <input
                name="q"
                type="search"
                placeholder="Search transactions..."
                className="h-9 w-60 rounded-md border border-gray-200 dark:border-[#262626] bg-[#fbfcfc] dark:bg-[#141414] pl-9 pr-3 text-xs text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none"
              />
            </form>

            <button
              type="button"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                themeReveal(() => setPreference(isDark ? "light" : "dark"), {
                  x: r.left + r.width / 2,
                  y: r.top + r.height / 2,
                });
              }}
              className="relative grid h-9 w-9 place-items-center rounded-full text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <AlertBell buttonClassName="relative grid h-9 w-9 place-items-center rounded-full text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100" />

            <div className="flex items-center gap-3 pl-1 sm:pl-2">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold leading-tight text-gray-900 dark:text-gray-100">
                  {profile?.display_name || profile?.email || "User"}
                </p>
                <p className="text-[10px] leading-tight text-gray-400">Pro Member</p>
              </div>
              {avatar}
            </div>
          </div>
        </header>
      </div>

      {/* ===== Main Content Area ===== */}
      <main className="min-h-[calc(100vh-64px)] bg-[#f8f9fa] dark:bg-[#000000] p-5 pb-28 sm:p-6 sm:pb-28 lg:ml-[240px] lg:w-[calc(100%-240px)] lg:p-8 lg:pb-8">
        {children}
      </main>

      {/* ===== Floating dock (phones + tablets below md) ===== */}
      {!pathname.startsWith("/expense/") && (
        <nav
          aria-label="Navigation"
          className="fixed inset-x-3 bottom-3 z-40 lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex h-16 max-w-md items-center justify-around rounded-2xl border border-gray-200 dark:border-[#262626] bg-white dark:bg-[#0a0a0a]/95 dark:bg-[#0a0a0a]/95 px-2 shadow-lg backdrop-blur-md">
            {NAV_ITEMS.slice(0, 2).map(({ href, label, Icon }) => (
              <DockTab key={href} href={href} label={label} active={isActive(href)}>
                <Icon size={19} aria-hidden />
              </DockTab>
            ))}
            <div className="grid place-items-center">
              <Link
                href="/expense/new"
                aria-label="Add transaction"
                className="grid h-12 w-12 -translate-y-3 place-items-center rounded-xl bg-primary text-primary-ink shadow-md transition-transform active:scale-95"
              >
                <PlusCircle size={22} aria-hidden />
              </Link>
            </div>
            {[
              { href: "/analytics", label: "Analytics", Icon: TrendingUp },
              { href: "/settings", label: "Settings", Icon: SettingsIcon },
            ].map(({ href, label, Icon }) => (
              <DockTab key={href} href={href} label={label} active={isActive(href)}>
                <Icon size={19} aria-hidden />
              </DockTab>
            ))}
          </div>
        </nav>
      )}

      {/* ===== Mobile nav drawer (hamburger) ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            aria-label="Close"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-xs"
          />
          <div
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[86vw] flex-col bg-white dark:bg-[#0a0a0a] shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-[#262626] px-5 py-4">
              <SpendFlowSeal size={32} />
              <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-gray-900 dark:text-gray-100">
                SpendFlow
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#141414]"
              >
                <X size={18} />
              </button>
            </div>

            <nav aria-label="SpendFlow" className="flex-1 overflow-y-auto px-3 py-3">
              {NAV_ITEMS.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`mt-1 flex h-10 items-center gap-3 rounded-lg px-3.5 text-[13px] transition-colors ${
                      active
                        ? "bg-[#f0f2f5] dark:bg-[#141414] font-semibold text-gray-900 dark:text-gray-100"
                        : "font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414] hover:text-gray-900 dark:hover:text-gray-100"
                    }`}
                  >
                    <Icon size={18} className={active ? "text-gray-800 dark:text-gray-100" : "text-gray-400"} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-gray-100 dark:border-[#262626] p-3 flex flex-col gap-1">
              <Link
                href="/notifications"
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 items-center gap-3 rounded-lg px-3.5 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414]"
              >
                <Bell size={18} className="text-gray-400" />
                <span>Notifications</span>
              </Link>
              <Link
                href="/settings"
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 items-center gap-3 rounded-lg px-3.5 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414]"
              >
                <SettingsIcon size={18} className="text-gray-400" />
                <span>Settings</span>
              </Link>
              <Link
                href="/profile"
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 items-center gap-3 rounded-lg px-3.5 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414]"
              >
                <UserRound size={18} className="text-gray-400" />
                <span>Profile</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  togglePrivacy();
                  setDrawerOpen(false);
                }}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3.5 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#141414]"
              >
                {isPrivacyMode ? <EyeOff size={18} className="text-gray-400" /> : <Eye size={18} className="text-gray-400" />}
                <span>{isPrivacyMode ? "Show Amounts" : "Hide Amounts"}</span>
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
        active ? "text-gray-900 dark:text-gray-100 font-semibold" : "text-gray-400"
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}
