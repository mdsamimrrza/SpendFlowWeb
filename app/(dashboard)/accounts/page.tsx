"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { formatMoney, todayISO } from "@/utils/format";
import {
  computeAccountBalances,
  createBankAccount,
  deleteBankAccount,
  listBankAccounts,
  updateBankAccount,
  type AccountInput,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
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

/** Accounts — register of places money lives, with computed live balances. */
export default function AccountsPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  /** Per-account balance converted into the display currency. */
  const [displayBalances, setDisplayBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BankAccountRow | null>(null);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const accs = await listBankAccounts(supabase, user.id);
      const bals = await computeAccountBalances(supabase, user.id, accs);
      setAccounts(accs);
      setBalances(bals);

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
    void load();
  }, [load]);

  const fmtOf = (n: number, cur: string) => mask(formatMoney(n, cur, locale));

  const [displayTotal, setDisplayTotal] = useState(0);

  const onSave = async (input: AccountInput) => {
    try {
      if (editing) await updateBankAccount(supabase, editing.id, input);
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
      await deleteBankAccount(supabase, confirmDelete.id);
      setConfirmDelete(null);
      showToast(t("deleted"), "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1000px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">Register</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Accounts</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <div className="flex gap-2">
          <Link href="/transfer/history">
            <Button variant="secondary">Transfer log</Button>
          </Link>
          <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus size={14} /> New account
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts on file"
          message="Add cash, bank and wallet accounts to track where money lives."
          action={
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus size={14} /> New account
            </Button>
          }
        />
      ) : (
        <>
          <div className="panel mb-4 px-5 py-4">
            <p className="caps">Total tracked balance — {displayCurrency}</p>
            <div className="figures mt-1.5 font-bold text-text">
              <FitText basePx={30} minPx={16}>{fmt(displayTotal)}</FitText>
            </div>
          </div>

          <Panel label={`Accounts — ${accounts.length}`}>
            <div>
              {accounts.map((account) => {
                const bal = balances.get(account.id) ?? account.initial_balance;
                const negative = bal < 0;
                return (
                  <div key={account.id} className="flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center border text-base"
                      style={{ borderColor: account.color, backgroundColor: `${account.color}14` }}
                      aria-hidden
                    >
                      {account.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-text">
                        {account.name}
                        {account.is_default && <span className="caps !text-brass">Default</span>}
                      </p>
                      <p className="truncate text-[11px] text-faint">
                        {ACCOUNT_TYPES.find((x) => x.value === account.account_type)?.label ?? account.account_type}
                        {account.account_number_last4 ? ` · ••${account.account_number_last4}` : ""} · {account.currency}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`numeric text-sm font-extrabold ${negative ? "text-danger" : "text-text"}`}>
                        {CURRENCY_DETAILS[account.currency as CurrencyCode]?.symbol ?? ""}
                        {mask(formatMoney(bal, account.currency, locale)).replace(/^[^\d]*/, "")}
                      </p>
                      {account.currency !== displayCurrency && displayBalances.get(account.id) != null && (
                        <p className="numeric text-[10px] text-faint">
                          ≈ {displayCurrency}{" "}
                          {mask(formatMoney(displayBalances.get(account.id)!, displayCurrency, locale)).replace(/^[^\d]*/, "")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
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
                );
              })}
            </div>
          </Panel>
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

  useEffect(() => {
    if (!open) return;
    if (account) {
      setName(account.name);
      setAccountType(account.account_type);
      setCurrency(account.currency as CurrencyCode);
      setInitialBalance(String(account.initial_balance));
      setLast4(account.account_number_last4 ?? "");
      setIsDefault(account.is_default);
    } else {
      setName("");
      setAccountType("bank");
      setCurrency("NPR");
      setInitialBalance("");
      setLast4("");
      setIsDefault(false);
    }
  }, [open, account]);

  return (
    <Modal open={open} title={account ? "Amend account" : "New account"} onClose={onClose} maxWidth="max-w-xl">
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
          });
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nepal Investment Bank" />
          <Select label="Type" value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)}>
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
            label="Opening balance"
            type="number"
            step="any"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            leftAdornment={CURRENCY_DETAILS[currency].symbol}
          />
          <Input
            label="Last 4 digits"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
          <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-sm text-text">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-[var(--sf-primary)]" />
            Default account
          </label>
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
