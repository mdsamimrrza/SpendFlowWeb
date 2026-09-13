"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Plus,
  Repeat,
  Settings as SettingsIcon,
  ScrollText,
  Home,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";
import { ConfirmDialog } from "@/components/ui/Modal";

const PRIMARY_NAV = [
  { href: "/overview", labelKey: "home", Icon: Home, enabled: true },
  { href: "/history", labelKey: "history", Icon: ScrollText, enabled: true },
  { href: "/analytics", labelKey: "analytics", Icon: BarChart3, enabled: true },
  { href: "/recurring", labelKey: "recurring", Icon: Repeat, enabled: true },
] as const;

const SECONDARY_NAV = [
  { href: "/settings", labelKey: "settings", Icon: SettingsIcon, enabled: true },
] as const;

/**
 * Ledger shell: paper sidebar separated by hairlines, brand masthead on top,
 * accent-bar active states. Sharp corners throughout.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { t } = useLanguage();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const isActive = (href: string) =>
    href === "/overview" ? pathname === "/overview" : pathname.startsWith(href);

  const signOutNow = async () => {
    setConfirmSignOut(false);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const navItem = ({
    href,
    labelKey,
    Icon,
    enabled,
  }: (typeof PRIMARY_NAV)[number] | (typeof SECONDARY_NAV)[number]) => {
    const label = t(labelKey);
    const active = enabled && isActive(href);
    const base =
      "flex w-full items-center gap-3 border-l-2 py-2.5 pl-4 pr-3 text-sm transition-colors";
    if (!enabled) {
      return (
        <span
          key={href}
          title={`${label} — ${t("comingSoon")}`}
          className={`${base} cursor-not-allowed border-transparent text-faint`}
        >
          <Icon size={16} className="shrink-0" />
          <span className="hidden lg:inline">{label}</span>
          <span className="caps-faint ml-auto hidden lg:inline">Soon</span>
        </span>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`${base} ${
          active
            ? "border-brass bg-primary-light/60 font-bold text-text"
            : "border-transparent font-semibold text-text-muted hover:text-text"
        }`}
      >
        <Icon size={16} className="shrink-0" />
        <span className="hidden lg:inline">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1400px]">
        {/* ===== Sidebar ===== */}
        <aside className="sticky top-0 hidden h-screen w-[68px] shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-60">
          <div className="border-b border-border px-2 py-4">
            <div className="flex items-center justify-center gap-2.5 lg:justify-start lg:px-2">
              <SpendFlowSeal size={32} />
              <p className="hidden font-brand text-lg font-bold text-text lg:inline">
                {t("spendFlow")}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1 lg:justify-start">
              <PrivacyEyeButton />
              <ThemeToggle />
            </div>
          </div>

          <Link
            href="/expense/new"
            className="mx-3 my-4 hidden h-9 items-center justify-center gap-2 border border-primary bg-primary text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong lg:flex"
          >
            <Plus size={14} /> Add entry
          </Link>

          <nav className="flex flex-col gap-0.5">{PRIMARY_NAV.map(navItem)}</nav>

          <div className="my-3 hidden px-4 lg:block">
            <div className="h-px bg-border" />
          </div>

          <nav className="flex flex-col gap-0.5">{SECONDARY_NAV.map(navItem)}</nav>

          {profile && (
            <div className="mt-auto hidden border-t border-border px-4 py-3 lg:block">
              <p className="truncate text-xs font-bold text-text">
                {profile.display_name ?? "Member"}
              </p>
              <p className="truncate text-[11px] text-faint">{profile.email}</p>
              <button
                onClick={() => setConfirmSignOut(true)}
                className="caps mt-2 !text-faint transition-colors hover:!text-danger"
              >
                {t("signOut")}
              </button>
              <p className="stamp mt-3">Form SF-01 · Ledger ed.</p>
            </div>
          )}
        </aside>

        {/* ===== Content ===== */}
        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-3 md:hidden">
            <Link href="/overview" className="flex items-center gap-2">
              <SpendFlowSeal size={26} />
              <span className="font-brand text-lg font-bold text-text">{t("spendFlow")}</span>
            </Link>
            <div className="flex items-center gap-0.5">
              <PrivacyEyeButton />
              <ThemeToggle />
              <Link
                href="/settings"
                aria-label={t("settings")}
                className="p-2 text-text-muted"
              >
                <SettingsIcon size={18} />
              </Link>
            </div>
          </header>

          <main className="px-4 pb-28 pt-6 sm:px-6 md:pb-12">{children}</main>
        </div>
      </div>

      {/* Mobile add button + bottom bar */}
      <Link
        href="/expense/new"
        aria-label={t("addTransaction")}
        className="fixed bottom-[84px] right-4 z-40 flex h-14 w-14 items-center justify-center border border-primary bg-primary text-white shadow-md md:hidden"
      >
        <Plus size={22} />
      </Link>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-tab md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="flex px-2 py-1">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ href, labelKey, Icon, enabled }) => {
            const active = enabled && isActive(href);
            const cls = `flex h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-wide ${
              active ? "text-primary" : enabled ? "text-text-muted" : "text-faint"
            }`;
            return enabled ? (
              <Link key={href} href={href} className={cls}>
                <Icon size={17} />
                {t(labelKey)}
              </Link>
            ) : (
              <span key={href} className={cls}>
                <Icon size={17} />
                {t(labelKey)}
              </span>
            );
          })}
        </nav>
      </div>

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
