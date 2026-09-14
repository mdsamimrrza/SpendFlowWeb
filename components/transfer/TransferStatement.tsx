"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, todayISO } from "@/utils/format";
import {
  computeAccountBalances,
  listBankAccounts,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { createTransfer } from "@/services/transfers";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { accountGlyph } from "@/components/ui/Glyph";
import { CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";

/** Mock dataset for the static design preview (no auth, no network). */
export interface TransferInject {
  accounts: BankAccountRow[];
  balances: Map<string, number>;
  rate: number | null;
}

interface TransferPageProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: TransferInject;
}

/** Transfer — move money between accounts; the FX rate locks on the row. */
/** Statement implementation — the default page export renders it bare;
 *  preview harnesses pass inject (mock data, no auth, no network). */
export function TransferStatement({ inject }: TransferPageProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [rate, setRate] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const accs = await listBankAccounts(supabase, user.id);
      setAccounts(accs);
      setBalances(await computeAccountBalances(supabase, user.id, accs));
      if (accs.length >= 2 && !fromId) {
        // Deep link: ?from=<id>&to=<id> pre-selects the route (accounts-page drills).
        const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const pf = params?.get("from");
        const pt = params?.get("to");
        const f = pf && accs.some((a) => a.id === pf) ? pf : accs[0].id;
        const t = pt && pt !== f && accs.some((a) => a.id === pt) ? pt : accs.find((a) => a.id !== f)?.id ?? "";
        setFromId(f);
        setToId(t);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  useEffect(() => {
    if (inject) {
      setAccounts(inject.accounts);
      setBalances(inject.balances);
      setRate(inject.rate);
      setFromId(inject.accounts[0]?.id ?? "");
      setToId(inject.accounts.find((a) => a.id !== inject.accounts[0]?.id)?.id ?? "");
      setLoading(false);
      return;
    }
    void load();
  }, [inject, load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const numericAmount = Number(amount) || 0;
  const numericFee = Number(fee) || 0;
  const available = from ? balances.get(from.id) ?? from.initial_balance : 0;
  const insufficient = numericAmount + numericFee > available && numericAmount > 0;
  const sameCurrency = from?.currency === to?.currency;
  const arrivesAt =
    !sameCurrency && to && numericAmount > 0 && rate != null ? numericAmount * rate : null;

  // Locked-at-submit rate preview.
  useEffect(() => {
    if (inject || !from || !to) return;
    let cancelled = false;
    void (async () => {
      try {
        const [fr, tr] = await Promise.all([
          getRate(supabase, from.currency),
          getRate(supabase, to.currency),
        ]);
        if (!cancelled) setRate(tr / fr);
      } catch {
        if (!cancelled) setRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inject, from, to, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    if (numericAmount <= 0) {
      showToast(t("amountRequired"), "error");
      return;
    }
    if (insufficient) {
      showToast("Insufficient balance in source account", "error");
      return;
    }
    setSaving(true);
    try {
      await createTransfer(supabase, user!.id, {
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: numericAmount,
        fee: numericFee,
        date,
        notes: notes.trim() || null,
      });
      showToast("Transfer posted", "success");
      setAmount("");
      setFee("");
      setNotes("");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[760px] pt-10">
        <Skeleton className="panel h-96 w-full" />
      </main>
    );
  }

  if (accounts.length < 2) {
    return (
      <main className="mx-auto w-full max-w-[760px] pt-10">
        <EmptyState
          title={t("twoAccountsTitle")}
          message={t("twoAccountsMsg")}
          action={
            <Link href="/accounts">
              <Button>{t("goToAccounts")}</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[760px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">{t("internalMovementEyebrow")}</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("transferTitle")}</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <Link href="/transfer/history">
          <Button variant="secondary">{t("transferLog")}</Button>
        </Link>
      </header>

      <form onSubmit={onSubmit}>
        <Panel label={t("routeLabel")}>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:p-5">
            <EndpointCard
              side="From"
              accounts={accounts}
              value={fromId}
              excludeId={toId}
              onChange={setFromId}
              balances={balances}
              locale={locale}
              mask={mask}
            />
            <div className="flex items-center justify-center sm:px-1">
              <button
                type="button"
                onClick={() => {
                  setFromId(toId);
                  setToId(fromId);
                }}
                aria-label={t("swapAccounts")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-text-muted transition-all hover:rotate-180 hover:bg-primary-light hover:text-primary"
              >
                <ArrowLeftRight size={16} />
              </button>
            </div>
            <EndpointCard
              side="To"
              accounts={accounts}
              value={toId}
              excludeId={fromId}
              onChange={setToId}
              balances={balances}
              locale={locale}
              mask={mask}
            />
          </div>
          {from && (
            <p className="border-t border-border px-4 py-2 text-[11px] text-faint sm:px-5">
              {t("availableInSource")}:{" "}
              <span className="numeric font-bold text-text">
                {CURRENCY_DETAILS[from.currency as CurrencyCode]?.symbol ?? ""}
                {mask(formatMoney(available, from.currency, locale)).replace(/^[^\d]*/, "")}
              </span>
            </p>
          )}
        </Panel>

        <section className="panel mt-4">
          <div className="panel-rule flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
            <span className="caps">{t("amountLabel")}</span>
            <span className="caps-faint">{sameCurrency ? t("sameCurrencyNote") : t("convertedAtRateNote")}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5">
            <Input
              label={t("amountLabel")}
              name="tr-amount"
              type="number"
              min="0"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              leftAdornment={from ? CURRENCY_DETAILS[from.currency as CurrencyCode]?.symbol ?? "" : ""}
              className="numeric !h-11 text-base font-bold"
            />
            <Input
              label={t("feeLabel")}
              name="tr-fee"
              type="number"
              min="0"
              step="any"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              leftAdornment={from ? CURRENCY_DETAILS[from.currency as CurrencyCode]?.symbol ?? "" : ""}
            />
            <Input label={t("date")} name="tr-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {/* Locked-rate preview — the exact math the row will freeze. */}
          {arrivesAt != null && from && to && (
            <p className="mx-4 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-accent-bg px-3 py-2 text-xs text-text-muted sm:mx-5 sm:mb-5">
              <ArrowRight size={13} className="shrink-0 text-primary" aria-hidden />
              <span>
                {t("arrivesAs")}{" "}
                <span className="numeric font-bold text-text">
                  {CURRENCY_DETAILS[to.currency as CurrencyCode]?.symbol ?? ""}
                  {mask(formatMoney(arrivesAt, to.currency, locale)).replace(/^[^\d]*/, "")}
                </span>{" "}
                · 1 {from.currency} = <span className="numeric font-bold text-text">{rate?.toFixed(4)}</span> {to.currency}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                <Lock size={11} aria-hidden /> {t("lockedAtSubmit")}
              </span>
            </p>
          )}
          {insufficient && (
            <p className="flex items-start gap-2 border-t border-danger/40 bg-rust-tint px-4 py-2.5 text-xs font-semibold text-danger sm:px-5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {t("insufficientBalance")} — available {fmt(available)}, required {fmt(numericAmount + numericFee)}.
              </span>
            </p>
          )}
        </section>

        <section className="panel mt-4">
          <div className="panel-rule flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
            <span className="caps">{t("notesLabel")}</span>
            <span className="numeric text-[10px] text-faint">{notes.length}/300</span>
          </div>
          <div className="p-4 sm:p-5">
            <Input
              type="text"
              name="tr-notes"
              aria-label="Transfer memo"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("optionalMemo")}
            />
          </div>
        </section>

        <div className="mt-4 flex justify-center sm:justify-end">
          <Button type="submit" loading={saving} className="w-full sm:w-auto sm:min-w-[200px]">
            {t("postTransfer")}
          </Button>
        </div>
      </form>
    </main>
  );
}

/** One end of the route — tinted glyph tile of the current pick, selector, live balance. */
function EndpointCard({
  side,
  accounts,
  value,
  excludeId,
  onChange,
  balances,
  locale,
  mask,
}: {
  side: "From" | "To";
  accounts: BankAccountRow[];
  value: string;
  excludeId: string;
  onChange: (id: string) => void;
  balances: Map<string, number>;
  locale: string;
  mask: (v: string) => string;
}) {
  const { t } = useLanguage();
  const current = accounts.find((a) => a.id === value);
  const Glyph = accountGlyph(current?.icon, current?.account_type);
  const bal = current ? balances.get(current.id) ?? current.initial_balance : 0;
  const negative = bal < 0;
  return (
    <div className="panel-flush rounded-xl p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: current ? `${current.color}1a` : "var(--sf-surface-elevated)",
            color: current?.color ?? "var(--sf-text-muted)",
          }}
          aria-hidden
        >
          <Glyph size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="caps !text-[10px]">{side === "From" ? t("fromLabel") : t("toLabel")}</p>
          <p className="truncate text-sm font-semibold text-text">
            {current?.name ?? "—"}
          </p>
        </div>
        <p className={`numeric shrink-0 text-xs font-bold ${negative ? "text-danger" : "text-text-muted"}`}>
          {current
            ? `${CURRENCY_DETAILS[current.currency as CurrencyCode]?.symbol ?? ""}${mask(
                formatMoney(bal, current.currency, locale),
              ).replace(/^[^\d]*/, "")}`
            : "—"}
        </p>
      </div>
      <Select
        label={undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="mt-2 border-0 bg-transparent px-0 focus:border-0"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id} disabled={a.id === excludeId}>
            {a.name} · {a.currency}
          </option>
        ))}
      </Select>
    </div>
  );
}
