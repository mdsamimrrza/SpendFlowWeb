"use client";

/**
 * Accounts & Wallets — 1:1 web mirror of mobile app/accounts.tsx: centered
 * header with active-account caption, the TOTAL LIQUID BALANCE card (privacy
 * eye inside), the 3-up quick-action row (Add Account · Money Transfer ·
 * Transfer History), the account cards (46px tinted icon tile, flag + name +
 * DEFAULT pill, type + last4 line, live balance + initial line), and the
 * Recent Transfers strip with per-row delete. Same computed balances as the
 * ledger build; add/edit opens the 1:1 port of the APK AccountManageModal
 * (country → bank/wallet presets, type pills, inline delete).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  Landmark,
  Plus,
  Star,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useTheme } from "@/store/ThemeContext";
import { useToast } from "@/store/ToastContext";
import {
  MobileConfirmDialog,
  MobileEmptyState,
  MobileHeaderBar,
} from "@/components/ui/MobileChrome";
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
  const { isDark } = useTheme();
  const { isPrivacyMode, toggle } = usePrivacy();
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
  const [deletingTransfer, setDeletingTransfer] = useState(false);

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
    setDeletingTransfer(true);
    try {
      await deleteTransfer(supabase, user!.id, transferToDelete.id);
      setRecentTransfers((cur) => cur.filter((x) => x.id !== transferToDelete.id));
      setTransferToDelete(null);
      showToast(t("deleted"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setDeletingTransfer(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  return (
    <main className="mx-auto w-full max-w-[560px]">
      <MobileHeaderBar
        title={t("accScreenTitle")}
        caption={
          accounts.length > 0
            ? `${t("accActiveCount").replace("{count}", String(accounts.length))}`
            : undefined
        }
      />

      <div className="space-y-2 p-0.5">
        {/* ── Net worth / total liquid balance card ── */}
        <section
          className="rounded-[16px] border-[1.5px] bg-surface p-2.5 shadow-[0_2px_8px_var(--sf-set-card-shadow)]"
          style={{ borderColor: isDark ? "rgb(16 185 129 / 0.35)" : "var(--sf-border)" }}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-[5px]">
              <Wallet size={14} className="shrink-0 text-primary" aria-hidden />
              <p className="truncate text-[10.5px] font-bold uppercase leading-4 tracking-[0.8px] text-primary">
                {t("accTotalLiquid")}
              </p>
            </div>
            <button
              onClick={toggle}
              aria-label={isPrivacyMode ? "Show balances" : "Hide balances"}
              aria-pressed={isPrivacyMode}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface transition active:opacity-70 ${
                isPrivacyMode ? "border border-primary" : "border border-border"
              }`}
            >
              {isPrivacyMode ? (
                <EyeOff size={19} className="text-primary" aria-hidden />
              ) : (
                <Eye size={19} className="text-text-muted" aria-hidden />
              )}
            </button>
          </div>
          <p
            className={`truncate text-[21px] font-black leading-[25px] tracking-[-0.5px] tabular-nums ${
              displayTotal >= 0 ? "text-text" : "text-danger"
            }`}
          >
            {formatMoney(displayTotal, displayCurrency, locale)}
          </p>
          <p className="mt-px text-[11px] leading-4 text-text-muted">{t("accAcrossAll")}</p>
        </section>

        {/* ── Quick actions ── */}
        <div className="mt-0.5 flex gap-2">
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
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/30 bg-primary/10">
                  <Icon size={17} className="text-primary" aria-hidden />
                </span>
                <span className="block max-w-full truncate text-[11px] font-extrabold text-text">
                  {action.label}
                </span>
              </>
            );
            const cls =
              "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[16px] border border-border bg-surface px-1 py-3.5 shadow-[0_2px_4px_var(--sf-set-card-shadow)] transition active:opacity-80";
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

        {/* ── Accounts list ── */}
        <div className="mt-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-text">{t("accYourAccounts")}</p>
            <p className="text-xs text-text-muted">{t("accTapToEdit")}</p>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[78px] w-full rounded-[18px]" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <MobileEmptyState
              icon={Landmark}
              title={t("accNoTitle")}
              message={t("accNoMsg")}
              actionLabel={t("accAddAccountBtn")}
              onAction={openAdd}
            />
          ) : (
            accounts.map((item) => {
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
                  className="flex w-full items-center justify-between gap-3 rounded-[18px] border bg-surface p-4 text-left shadow-[0_2px_4px_var(--sf-set-card-shadow)] transition active:opacity-85"
                  style={{ borderColor: item.is_default ? "color-mix(in srgb, var(--sf-primary) 38%, transparent)" : "var(--sf-border)" }}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] border"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
                        borderColor: `color-mix(in srgb, ${color} 19%, transparent)`,
                        color,
                      }}
                      aria-hidden
                    >
                      <G size={22} />
                    </span>
                    <span className="min-w-0 flex-1 space-y-[3px]">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CurrencyFlag currency={item.currency} size={14} />
                          <span className="min-w-0 truncate text-[15px] font-extrabold text-text">
                            {item.name}
                          </span>
                        </span>
                        {item.is_default && (
                          <span className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/20 px-1.5 py-[2px] text-[9.5px] font-extrabold text-primary">
                            <Star size={9} fill="currentColor" aria-hidden />
                            {t("accDefault")}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold" style={{ color }}>
                          {ACCOUNT_TYPE_LABELS[item.account_type] ?? item.account_type}
                        </span>
                        {item.account_number_last4 && (
                          <span className="text-[11px] text-text-muted">
                            •••• {item.account_number_last4}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-[2px]">
                    <span
                      className={`text-base font-black tabular-nums ${
                        bal >= 0 ? "text-income" : "text-danger"
                      }`}
                    >
                      {formatMoney(bal, item.currency || displayCurrency, locale)}
                    </span>
                    <span className="flex items-center gap-[2px] text-[10px] text-text-muted">
                      {t("accInitial").replace(
                        "{amount}",
                        formatMoney(item.initial_balance, item.currency || displayCurrency, locale),
                      )}
                      <ChevronRight size={14} aria-hidden />
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* ── Recent transfers ── */}
        {recentTransfers.length > 0 && (
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-text">{t("accRecentTransfers")}</p>
              <Link href="/transfer/history" className="text-xs font-extrabold text-primary">
                {t("accSeeAll")}
              </Link>
            </div>
            {recentTransfers.slice(0, 3).map((tr) => {
              const crossCurrency = tr.from_currency !== tr.to_currency;
              const fromName = tr.from_account?.name ?? "—";
              const toName = tr.to_account?.name ?? "—";
              const tintColor = byId.get(tr.from_account?.id ?? "")?.color || "var(--sf-primary)";
              const dateLabel = new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: "short",
              }).format(new Date(`${tr.date}T00:00:00`));
              return (
                <div
                  key={tr.id}
                  className="flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-3"
                >
                  <span
                    className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${tintColor} 9%, transparent)`,
                      borderColor: `color-mix(in srgb, ${tintColor} 19%, transparent)`,
                      color: tintColor,
                    }}
                    aria-hidden
                  >
                    <ArrowLeftRight size={15} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-[2px]">
                    <span className="flex min-w-0 items-center gap-1 text-[13px] font-extrabold text-text">
                      <CurrencyFlag currency={tr.from_currency} size={13} />
                      <span className="max-w-[90px] truncate">{fromName}</span>
                      <span className="shrink-0">→</span>
                      <CurrencyFlag currency={tr.to_currency} size={13} />
                      <span className="min-w-0 truncate">{toName}</span>
                    </span>
                    <span className="block truncate text-[10.5px] text-text-muted">
                      {formatMoney(tr.amount, tr.from_currency, locale)} →{" "}
                      {formatMoney(tr.converted_amount, tr.to_currency, locale)}
                      {crossCurrency
                        ? ` · 1 ${tr.from_currency} = ${Number(tr.exchange_rate).toFixed(4)} ${tr.to_currency}`
                        : ""}{" "}
                      · {dateLabel}
                    </span>
                  </span>
                  <button
                    onClick={() => setTransferToDelete(tr)}
                    aria-label={t("deleteTransferTitle")}
                    className="shrink-0 p-1 text-text-muted transition active:opacity-70"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
      <MobileConfirmDialog
        open={!!transferToDelete}
        title={t("deleteTransferTitle")}
        message={t("deleteTransferBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        loading={deletingTransfer}
        onConfirm={() => void onTransferDelete()}
        onCancel={() => setTransferToDelete(null)}
      />
    </main>
  );
}
