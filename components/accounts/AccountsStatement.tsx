"use client";

/**
 * Accounts & Wallets - V2 statement (behavior mirrors mobile app/accounts.tsx):
 * page header with the Add-account action, the TOTAL LIQUID BALANCE hero
 * (privacy eye inside), quick actions (inline row on phones, a links card in
 * the desktop aside), account cards in a responsive grid (2-up from sm),
 * and the Recent Transfers panel with per-row delete (desktop aside). Same
 * computed balances as the ledger build; add/edit opens the 1:1 port of the
 * APK AccountManageModal (country -> bank/wallet presets, type pills, inline
 * delete).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  History,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { AccountManageModal } from "@/components/account/AccountManageModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { formatMoney } from "@/utils/format";
import {
  computeAccountBalances,
  listBankAccounts,
  type AccountCycleStat,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { deleteTransfer, listTransfers, type TransferRow } from "@/services/transfers";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { accountGlyph } from "@/components/ui/Glyph";

// Type label shown on the account card (APK ACCOUNT_TYPES labels).
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: "Bank Account",
  wallet: "Digital Wallet",
  cash: "Cash / Pocket",
  credit_card: "Credit Card",
  savings: "Savings Deposit",
  investment: "Investment",
  other: "Other",
};

/** Mock dataset for the static design preview (no auth, no network). */
export interface AccountsInject {
  accounts: BankAccountRow[];
  balances: Map<string, number>;
  displayBalances: Map<string, number>;
  displayTotal: number;
  cycleStats: Map<string, AccountCycleStat>;
  recentTransfers: TransferRow[];
}

interface AccountsPageProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: AccountsInject;
}

export function AccountsStatement({ inject }: AccountsPageProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  /** Per-account balance converted into the display currency. */
  const [displayBalances, setDisplayBalances] = useState<Map<string, number>>(new Map());
  const [displayTotal, setDisplayTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [recentTransfers, setRecentTransfers] = useState<TransferRow[]>([]);
  const [transferToDelete, setTransferToDelete] = useState<TransferRow | null>(null);

  const displayCurrency = profile?.preferred_currency ?? "NPR";

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const accs = await listBankAccounts(supabase, user.id);
      const bals = await computeAccountBalances(supabase, user.id, accs);
      setAccounts(accs);
      setBalances(bals);

      const transfers = await listTransfers(supabase, user.id, 5).catch(() => [] as TransferRow[]);
      setRecentTransfers(transfers);

      // Convert every balance into the display currency at today's rate
      // (mobile Total Liquid Balance parity).
      const converted = new Map<string, number>();
      let total = 0;
      for (const a of accs) {
        const bal = bals.get(a.id) ?? a.initial_balance;
        let inDisplay = bal;
        if (a.currency !== displayCurrency) {
          const [accRate, dispRate] = await Promise.all([
            getRate(supabase, a.currency),
            getRate(supabase, displayCurrency),
          ]);
          inDisplay = (bal * accRate) / dispRate;
        }
        converted.set(a.id, inDisplay);
        total += inDisplay;
      }
      setDisplayBalances(converted);
      setDisplayTotal(total);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setLoading(false);
    }
  }, [user, supabase, showToast, t, displayCurrency]);

  useEffect(() => {
    if (inject) {
      setAccounts(inject.accounts);
      setBalances(inject.balances);
      setDisplayBalances(inject.displayBalances);
      setDisplayTotal(inject.displayTotal);
      setRecentTransfers(inject.recentTransfers);
      setLoading(false);
      return;
    }
    void load();
  }, [inject, load]);

  // Account lookup for transfer tinting (mobile uses from_account.color).
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const onTransferDelete = async () => {
    if (!transferToDelete) return;
    try {
      await deleteTransfer(supabase, user!.id, transferToDelete.id);
      setRecentTransfers((cur) => cur.filter((x) => x.id !== transferToDelete.id));
      setTransferToDelete(null);
      showToast(t("deleted"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const money = (n: number, currency: string) =>
    mask(formatMoney(n, currency || displayCurrency, locale));

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      {/* Page header */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
            {t("accScreenTitle")}
          </h1>
          <p className="mt-0.5 text-[13px] text-faint">
            {accounts.length > 0
              ? t("accActiveCount").replace("{count}", String(accounts.length))
              : t("accTapToEdit")}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="hidden h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-strong active:scale-[0.98] sm:inline-flex"
        >
          <Plus size={16} aria-hidden />
          {t("accAddAccount")}
        </button>
      </header>

      <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        {/* Left column: total-liquid hero + account grid (2-up from sm) */}
        <div className="min-w-0 lg:col-span-2">
          {/* Total liquid balance hero */}
          <section className="relative rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <span className="absolute right-4 top-4 z-10">
              <PrivacyEyeButton />
            </span>
            <p className="caps pr-12">{t("accTotalLiquid")}</p>
            <p
              className={`figures-display mt-1 py-0.5 pr-12 text-[30px] leading-9 ${
                displayTotal >= 0 ? "text-text" : "text-danger"
              }`}
            >
              {money(displayTotal, displayCurrency)}
            </p>
            <p className="mt-1 text-xs text-text-muted">{t("accAcrossAll")}</p>
          </section>

          {/* Quick actions (phones; the sidebar/header carry them from sm up) */}
          <div className="mt-3 flex gap-2 sm:hidden">
            {(
              [
                { icon: Plus, label: t("accAddAccount"), href: null as string | null, onClick: openAdd },
                { icon: ArrowLeftRight, label: t("accMoneyTransfer"), href: "/transfer", onClick: null },
                { icon: History, label: t("accTransferHistory"), href: "/transfer/history", onClick: null },
              ] as const
            ).map((action) => {
              const Icon = action.icon;
              const inner = (
                <>
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--sf-primary-light)] text-primary">
                    <Icon size={17} aria-hidden />
                  </span>
                  <span className="block max-w-full truncate text-[11px] font-semibold text-text">
                    {action.label}
                  </span>
                </>
              );
              const cls =
                "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-surface px-1 py-3 transition-colors hover:border-faint active:opacity-80";
              return action.href ? (
                <Link key={action.label} href={action.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={action.label} onClick={action.onClick ?? undefined} className={cls}>
                  {inner}
                </button>
              );
            })}
          </div>

          {/* Accounts */}
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">{t("accYourAccounts")}</h2>
              <p className="text-xs text-text-muted">{t("accTapToEdit")}</p>
            </div>

            {loading ? (
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[118px] w-full rounded-2xl" />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <div className="mt-2.5">
                <EmptyState
                  title={t("accNoTitle")}
                  message={t("accNoMsg")}
                  action={
                    <Button className="!rounded-lg" onClick={openAdd}>
                      {t("accAddAccountBtn")}
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {accounts.map((item) => {
                  const bal = balances.get(item.id) ?? item.initial_balance;
                  const color = item.color || "var(--sf-primary)";
                  const G = accountGlyph(item.icon, item.account_type);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setEditing(item);
                        setEditorOpen(true);
                      }}
                      className={`flex w-full flex-col gap-3 rounded-2xl border bg-surface p-4 text-left shadow-soft transition hover:border-faint active:opacity-90 ${
                        item.is_default ? "border-primary/40" : "border-border"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg border"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
                            borderColor: `color-mix(in srgb, ${color} 19%, transparent)`,
                            color,
                          }}
                          aria-hidden
                        >
                          <G size={21} />
                        </span>
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <CurrencyFlag currency={item.currency} size={14} />
                            <span className="min-w-0 truncate text-[15px] font-semibold text-text">
                              {item.name}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-semibold" style={{ color }}>
                              {ACCOUNT_TYPE_LABELS[item.account_type] ?? item.account_type}
                            </span>
                            {item.account_number_last4 && (
                              <span className="numeric text-text-muted">
                                •••• {item.account_number_last4}
                              </span>
                            )}
                          </span>
                        </span>
                        {item.is_default && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--sf-primary-light)] px-2 py-0.5 text-[10px] font-semibold text-primary-strong">
                            <Star size={9} fill="currentColor" aria-hidden />
                            {t("accDefault")}
                          </span>
                        )}
                      </span>
                      <span className="flex items-end justify-between gap-3 border-t border-border pt-3">
                        <span className="min-w-0 truncate text-[11px] text-faint">
                          {t("accInitial").replace(
                            "{amount}",
                            money(item.initial_balance, item.currency || displayCurrency),
                          )}
                        </span>
                        <span
                          className={`figures shrink-0 text-lg ${
                            bal >= 0 ? "text-income" : "text-danger"
                          }`}
                        >
                          {money(bal, item.currency || displayCurrency)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column (desktop): quick links + recent transfers; on phones
            the transfers strip flows beneath the accounts as before. */}
        <aside className="mt-5 min-w-0 space-y-4 lg:mt-0">
          {/* Quick links (desktop) */}
          <section className="hidden rounded-2xl border border-border bg-surface p-2 shadow-soft lg:block">
            {(
              [
                { icon: Plus, label: t("accAddAccount"), href: null as string | null, onClick: openAdd },
                { icon: ArrowLeftRight, label: t("accMoneyTransfer"), href: "/transfer", onClick: null },
                { icon: History, label: t("accTransferHistory"), href: "/transfer/history", onClick: null },
              ] as const
            ).map((action) => {
              const Icon = action.icon;
              const inner = (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--sf-primary-light)] text-primary">
                    <Icon size={15} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text">
                    {action.label}
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-faint" aria-hidden />
                </>
              );
              const cls =
                "flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors hover:bg-surface-elevated";
              return action.href ? (
                <Link key={action.label} href={action.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={action.label} onClick={action.onClick ?? undefined} className={cls}>
                  {inner}
                </button>
              );
            })}
          </section>

          {/* Recent transfers */}
          {recentTransfers.length > 0 && (
            <Panel
              label={t("accRecentTransfers")}
              action={
                <Link href="/transfer/history" className="caps !text-primary hover:underline">
                  {t("accSeeAll")}
                </Link>
              }
            >
              <div className="p-2 sm:p-3">
                {recentTransfers.slice(0, 4).map((tr) => {
                  const crossCurrency = tr.from_currency !== tr.to_currency;
                  const fromName = tr.from_account?.name ?? "-";
                  const toName = tr.to_account?.name ?? "-";
                  const tintColor = byId.get(tr.from_account?.id ?? "")?.color || "var(--sf-primary)";
                  const dateLabel = new Intl.DateTimeFormat(locale, {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(`${tr.date}T00:00:00`));
                  return (
                    <div
                      key={tr.id}
                      className="flex items-center gap-2.5 rounded-xl px-1.5 py-2.5 sm:px-2"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${tintColor} 9%, transparent)`,
                          borderColor: `color-mix(in srgb, ${tintColor} 19%, transparent)`,
                          color: tintColor,
                        }}
                        aria-hidden
                      >
                        <ArrowLeftRight size={15} />
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="flex min-w-0 items-center gap-1 text-[13px] font-semibold text-text">
                          <CurrencyFlag currency={tr.from_currency} size={13} />
                          <span className="max-w-[90px] truncate">{fromName}</span>
                          <ArrowRight size={12} className="shrink-0 text-faint" aria-hidden />
                          <CurrencyFlag currency={tr.to_currency} size={13} />
                          <span className="min-w-0 truncate">{toName}</span>
                        </span>
                        <span className="numeric block truncate text-[10.5px] text-text-muted">
                          {money(tr.amount, tr.from_currency)} <ArrowRight size={9} className="inline text-faint" aria-hidden />{" "}
                          {money(tr.converted_amount, tr.to_currency)}
                          {crossCurrency
                            ? ` · 1 ${tr.from_currency} = ${Number(tr.exchange_rate).toFixed(4)} ${tr.to_currency}`
                            : ""}{" "}
                          · {dateLabel}
                        </span>
                      </span>
                      <button
                        onClick={() => setTransferToDelete(tr)}
                        aria-label={t("deleteTransferTitle")}
                        className="shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-surface-elevated hover:text-danger active:opacity-70"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </aside>
      </div>

      <AccountManageModal
        open={editorOpen}
        account={editing}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!transferToDelete}
        title={t("deleteTransferTitle")}
        body={t("deleteTransferBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => void onTransferDelete()}
        onCancel={() => setTransferToDelete(null)}
      />
    </main>
  );
}
