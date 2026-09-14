"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { FitText } from "@/components/ui/FitText";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, getCycleWindow, toISODate } from "@/utils/format";
import {
  computeAccountBalances,
  computeAccountCycleStats,
  createBankAccount,
  deleteBankAccount,
  listBankAccounts,
  updateBankAccount,
  type AccountCycleStat,
  type AccountInput,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { listTransfers, type TransferRow } from "@/services/transfers";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { accountGlyph } from "@/components/ui/Glyph";
import { CURRENCIES, CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
  { value: "credit_card", label: "Credit card" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
] as const;

// Stored row data (like category colors), not theme tokens.
const ACCOUNT_COLORS = ["#10B981", "#0EA5E9", "#8B5CF6", "#F59E0B", "#EF4444", "#14B8A6", "#6366F1", "#A8791F"];
// Values are the emoji the shared DB stores (mobile reads them); the editor
// renders each through the Lucide glyph layer — emoji never appear on screen.
const ACCOUNT_ICONS: { value: string; label: string }[] = [
  { value: "🏦", label: "Bank" },
  { value: "💵", label: "Cash" },
  { value: "👛", label: "Wallet" },
  { value: "💳", label: "Card" },
  { value: "📈", label: "Investment" },
  { value: "🪙", label: "Savings" },
  { value: "🏠", label: "Property" },
  { value: "💼", label: "Business" },
];

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

/** Accounts — register of places money lives, with computed live balances. */
/** Statement implementation — the default page export renders it bare;
 *  preview harnesses pass inject (mock data, no auth, no network). */
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
  const [confirmDelete, setConfirmDelete] = useState<BankAccountRow | null>(null);
  // Cycle activity + recent movements — the per-account detail beyond the APK.
  const [cycleStats, setCycleStats] = useState<Map<string, AccountCycleStat>>(new Map());
  const [recentTransfers, setRecentTransfers] = useState<TransferRow[]>([]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));
  const cycle = useMemo(
    () => getCycleWindow(new Date(), profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );
  const cycleLabel = `${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
    cycle.start,
  )} – ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
    cycle.end,
  )}`;

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

      // Web-only depth: per-account cycle activity + latest movements.
      const [cs, transfers] = await Promise.all([
        computeAccountCycleStats(supabase, user.id, accs, toISODate(cycle.start), toISODate(cycle.end)).catch(
          () => new Map<string, AccountCycleStat>(),
        ),
        listTransfers(supabase, user.id, 5).catch(() => [] as TransferRow[]),
      ]);
      setCycleStats(cs);
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
  }, [user, supabase, showToast, t, displayCurrency, cycle]);

  useEffect(() => {
    if (inject) {
      setAccounts(inject.accounts);
      setBalances(inject.balances);
      setDisplayBalances(inject.displayBalances);
      setDisplayTotal(inject.displayTotal);
      setCycleStats(inject.cycleStats);
      setRecentTransfers(inject.recentTransfers);
      setLoading(false);
      return;
    }
    void load();
  }, [inject, load]);

  const fmtOf = (n: number, cur: string) => mask(formatMoney(n, cur, locale));

  const onSave = async (input: AccountInput) => {
    try {
      if (editing) await updateBankAccount(supabase, user!.id, editing.id, input);
      else await createBankAccount(supabase, user!.id, input);
      setEditorOpen(false);
      setEditing(null);
      showToast(t("saved"), "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteBankAccount(supabase, user!.id, confirmDelete.id);
      setConfirmDelete(null);
      showToast(t("deleted"), "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  // Share of the tracked total per account — drives the distribution bar and
  // the per-row share lines. Negative balances clamp to zero width.
  const shares = useMemo(() => {
    const map = new Map<string, number>();
    if (displayTotal > 0) {
      for (const a of accounts) {
        const v = displayBalances.get(a.id) ?? 0;
        map.set(a.id, v > 0 ? v / displayTotal : 0);
      }
    }
    return map;
  }, [accounts, displayBalances, displayTotal]);

  return (
    <main className="mx-auto w-full max-w-[1000px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">{t("registerEyebrow")}</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("accounts")}</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/transfer/history">
            <Button variant="secondary">{t("transferLog")}</Button>
          </Link>
          <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus size={14} /> {t("newAccount")}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="panel space-y-3 p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-2.5 w-full" />
          </div>
          <div className="panel space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          title={t("noAccountsTitle")}
          message={t("noAccountsMsg")}
          action={
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus size={14} /> {t("newAccount")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Hero — total tracked balance with the distribution of where money
              lives: one stacked bar, one segment per account colour. */}
          <section className="panel mb-4 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="caps">{t("totalTracked")} — {displayCurrency}</p>
              <p className="caps-faint">
                {accounts.length} {accounts.length === 1 ? "account" : "accounts"} ·{" "}
                {new Set(accounts.map((a) => a.currency)).size}{" "}
                {new Set(accounts.map((a) => a.currency)).size === 1 ? "currency" : "currencies"}
              </p>
            </div>
            <div className="figures mt-1.5 font-bold text-text">
              <FitText basePx={32} minPx={18}>{fmt(displayTotal)}</FitText>
            </div>
            {displayTotal > 0 && (
              <>
                <div
                  className="mt-3 flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-elevated"
                  role="img"
                  aria-label="Balance distribution across accounts"
                >
                  {accounts.map((a) => {
                    const share = shares.get(a.id) ?? 0;
                    return share > 0 ? (
                      <span
                        key={a.id}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${share * 100}%`, backgroundColor: a.color }}
                      />
                    ) : null;
                  })}
                </div>
                <div className="scroll-x mt-2.5 flex gap-x-4 gap-y-1 overflow-x-auto whitespace-nowrap">
                  {accounts.map((a) => {
                    const share = shares.get(a.id) ?? 0;
                    return (
                      <span key={a.id} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                        <span className="max-w-[120px] truncate">{a.name}</span>
                        <span className="numeric font-bold text-text">{Math.round(share * 100)}%</span>
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <Panel label={`${t("accounts")} — ${accounts.length}`}>
            <div>
              {accounts.map((account) => {
                const bal = balances.get(account.id) ?? account.initial_balance;
                const negative = bal < 0;
                const stat = cycleStats.get(account.id);
                const sym = CURRENCY_DETAILS[account.currency as CurrencyCode]?.symbol ?? "";
                const share = shares.get(account.id) ?? 0;
                return (
                  <div key={account.id} className="border-b border-border/60 px-4 py-3 last:border-0 sm:px-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${account.color}1a`, color: account.color }}
                        aria-hidden
                      >
                        {(() => {
                          const G = accountGlyph(account.icon, account.account_type);
                          return <G size={17} />;
                        })()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-text">
                          {account.name}
                          {account.is_default && (
                            <span className="shrink-0 rounded-full bg-brass-tint px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-brass">
                              Default
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-faint">
                          {ACCOUNT_TYPES.find((x) => x.value === account.account_type)?.label ?? account.account_type}
                          {account.account_number_last4 ? ` · ••${account.account_number_last4}` : ""} · {account.currency}
                        </p>
                      </div>
                      <div className="w-[104px] shrink-0 text-right sm:w-auto">
                        <p className={`numeric text-sm font-extrabold ${negative ? "text-danger" : "text-text"}`}>
                          {sym}
                          {mask(formatMoney(bal, account.currency, locale)).replace(/^[^\d]*/, "")}
                        </p>
                        {account.currency !== displayCurrency && displayBalances.get(account.id) != null ? (
                          <p className="numeric text-[10px] text-faint">
                            ≈ {displayCurrency}{" "}
                            {mask(formatMoney(displayBalances.get(account.id)!, displayCurrency, locale)).replace(/^[^\d]*/, "")}
                          </p>
                        ) : (
                          <p className="numeric text-[10px] text-faint">
                            {Math.round(share * 100)}% of total
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center max-sm:ml-auto max-sm:w-full max-sm:justify-end">
                        <Link
                          href={`/history?account=${account.id}`}
                          title="View all transactions on this account"
                          className="p-1.5 text-faint transition-colors hover:text-primary"
                          aria-label={`View transactions for ${account.name}`}
                        >
                          <ArrowRight size={15} />
                        </Link>
                        <button
                          onClick={() => { setEditing(account); setEditorOpen(true); }}
                          aria-label="Edit account"
                          className="p-1.5 text-faint transition-colors hover:text-primary"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(account)}
                          aria-label="Delete account"
                          className="p-1.5 text-faint transition-colors hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Share of tracked total — thin colour tick under the row. */}
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                      <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: account.color }} />
                    </div>
                    {stat && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-0 text-[11px] text-text-muted sm:pl-[52px]">
                        <span className="caps-faint">{cycleLabel}:</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="font-bold text-text">{stat.count}</span>{" "}
                          {stat.count === 1 ? "entry" : "entries"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-danger">
                          <TrendingDown size={11} aria-hidden />
                          <span className="numeric font-bold">
                            −{sym}{mask(formatMoney(stat.spent, account.currency, locale)).replace(/^[^\d]*/, "")}
                          </span>
                        </span>
                        {stat.earned > 0 && (
                          <span className="inline-flex items-center gap-1 text-income">
                            <TrendingUp size={11} aria-hidden />
                            <span className="numeric font-bold">
                              +{sym}{mask(formatMoney(stat.earned, account.currency, locale)).replace(/^[^\d]*/, "")}
                            </span>
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {recentTransfers.length > 0 && (
            <Panel
              label={t("recentMovements")}
              className="mt-4"
              action={
                <Link href="/transfer/history" className="caps !text-primary hover:underline">
                  {t("transferLog")}
                </Link>
              }
            >
              <div className="p-4 sm:p-5">
                <ul className="divide-y divide-border/60">
                  {recentTransfers.map((tr) => (
                    <li key={tr.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary"
                        aria-hidden
                      >
                        <ArrowRight size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">
                          {tr.from_account?.name ?? "—"} <span className="text-faint">→</span> {tr.to_account?.name ?? "—"}
                        </span>
                        <span className="text-[11px] text-faint sm:hidden">
                          {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                            new Date(`${tr.date}T00:00:00`),
                          )}
                        </span>
                      </span>
                      <span className="numeric shrink-0 text-sm font-bold text-text">
                        {CURRENCY_DETAILS[tr.from_currency as CurrencyCode]?.symbol ?? ""}
                        {mask(formatMoney(tr.amount, tr.from_currency, locale)).replace(/^[^\d]*/, "")}
                      </span>
                      <span className="hidden shrink-0 text-[11px] text-faint sm:block">
                        {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                          new Date(`${tr.date}T00:00:00`),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          )}
        </>
      )}

      <AccountEditor
        open={editorOpen}
        account={editing}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={onSave}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete account"
        body="Linked entries keep their rows; the account is removed from lists and transfers."
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </main>
  );
}

function AccountEditor({
  open,
  account,
  onClose,
  onSave,
}: {
  open: boolean;
  account: BankAccountRow | null;
  onClose: () => void;
  onSave: (input: AccountInput) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<(typeof ACCOUNT_TYPES)[number]["value"]>("bank");
  const [currency, setCurrency] = useState<CurrencyCode>("NPR");
  const [initialBalance, setInitialBalance] = useState("");
  const [last4, setLast4] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(ACCOUNT_ICONS[0].value);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setName(account.name);
      setAccountType(account.account_type);
      setCurrency(account.currency as CurrencyCode);
      setInitialBalance(String(account.initial_balance));
      setLast4(account.account_number_last4 ?? "");
      setIsDefault(account.is_default);
      setColor(account.color || ACCOUNT_COLORS[0]);
      setIcon(account.icon || ACCOUNT_ICONS[0].value);
    } else {
      setName("");
      setAccountType("bank");
      setCurrency("NPR");
      setInitialBalance("");
      setLast4("");
      setIsDefault(false);
      setColor(ACCOUNT_COLORS[0]);
      setIcon("🏦");
    }
  }, [open, account]);

  const PreviewGlyph = accountGlyph(icon, accountType);

  return (
    <Modal open={open} title={account ? t("amendAccount") : t("newAccount")} onClose={onClose} maxWidth="max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const numeric = Number(initialBalance) || 0;
          onSave({
            name: name.trim(),
            accountType,
            currency,
            initialBalance: numeric,
            last4: last4.trim() || null,
            isDefault,
            color,
            icon,
          });
        }}
        className="space-y-4"
      >
        {/* Live identity preview — the register tints each account. */}
        <div className="panel-flush flex items-center gap-3 px-4 py-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}1a`, color }}
            aria-hidden
          >
            <PreviewGlyph size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{name.trim() || "Account name"}</p>
            <p className="truncate text-[11px] text-faint">
              {ACCOUNT_TYPES.find((x) => x.value === accountType)?.label} · {currency}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={t("accName")} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nepal Investment Bank" />
          <Select label={t("accountTypeLabel")} value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)}>
            {ACCOUNT_TYPES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
          <Select label={t("currency")} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} — {CURRENCY_DETAILS[c].label}
              </option>
            ))}
          </Select>
          <Input
            label={t("openingBalance")}
            type="number"
            step="any"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            leftAdornment={CURRENCY_DETAILS[currency].symbol}
          />
          <Input
            label={t("last4digits")}
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
          <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-sm text-text">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-[var(--sf-primary)]" />
            {t("defaultAccount")}
          </label>
        </div>
        <div>
          <p className="caps-faint mb-2">{t("colourLabel")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Account colour">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                className={`h-7 w-7 rounded-full transition ${
                  color === c
                    ? "ring-2 ring-text ring-offset-2 ring-offset-[var(--sf-surface)]"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <p className="caps-faint mb-2 mt-4">{t("markLabel")}</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Account icon">
            {ACCOUNT_ICONS.map(({ value, label }) => {
              const G = accountGlyph(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIcon(value)}
                  aria-label={label}
                  aria-pressed={icon === value}
                  title={label}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    icon === value ? "bg-primary-light text-primary" : "bg-surface-elevated text-text-muted hover:text-text"
                  }`}
                >
                  <G size={16} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit">{t("save")}</Button>
        </div>
      </form>
    </Modal>
  );
}
