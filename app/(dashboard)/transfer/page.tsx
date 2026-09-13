"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, todayISO } from "@/utils/format";
import {
  computeAccountBalances,
  listBankAccounts,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { createTransfer } from "@/services/transfers";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Transfer — move money between accounts; the FX rate locks on the row. */
export default function TransferPage() {
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
    if (!user) return;
    try {
      const accs = await listBankAccounts(supabase, user.id);
      setAccounts(accs);
      setBalances(await computeAccountBalances(supabase, user.id, accs));
      if (accs.length >= 2 && !fromId) {
        setFromId(accs[0].id);
        setToId(accs[1].id);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const numericAmount = Number(amount) || 0;
  const numericFee = Number(fee) || 0;
  const available = from ? balances.get(from.id) ?? from.initial_balance : 0;
  const insufficient = numericAmount + numericFee > available;
  const sameCurrency = from?.currency === to?.currency;

  // Locked-at-submit rate preview.
  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    void (async () => {
      const [fr, tr] = await Promise.all([
        getRate(supabase, from.currency),
        getRate(supabase, to.currency),
      ]);
      if (!cancelled) setRate(tr / fr);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, supabase]);

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
        <div className="panel h-64 animate-pulse" />
      </main>
    );
  }

  if (accounts.length < 2) {
    return (
      <main className="mx-auto w-full max-w-[760px] pt-10">
        <EmptyState
          title="Two accounts needed"
          message="Add at least two accounts (e.g. Cash and a bank) to post transfers between them."
          action={
            <Link href="/accounts">
              <Button>Go to accounts</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const accOpts = accounts.map((a) => (
    <option key={a.id} value={a.id} disabled={a.id === fromId}>
      {a.name} · {a.currency}
    </option>
  ));

  return (
    <main className="mx-auto w-full max-w-[760px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">Internal movement</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Transfer</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <Link href="/transfer/history">
          <Button variant="secondary">Transfer log</Button>
        </Link>
      </header>

      <form onSubmit={onSubmit}>
        <Panel label="Route">
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <Select label="From" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === toId}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              aria-label="Swap accounts"
              className="mx-auto mb-0.5 flex h-9 w-9 items-center justify-center border border-border text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <ArrowLeftRight size={15} />
            </button>
            <Select label="To" value={toId} onChange={(e) => setToId(e.target.value)} required>
              {accOpts}
            </Select>
          </div>
          {from && (
            <p className="border-t border-border px-5 py-2 text-[11px] text-faint">
              Available in source:{" "}
              <span className="numeric font-bold text-text">
                {CURRENCY(from.currency)}
                {mask(formatMoney(available, from.currency, locale)).replace(/^[^\d]*/, "")}
              </span>
            </p>
          )}
        </Panel>

        <section className="panel mt-4">
          <div className="panel-rule flex items-center justify-between px-5 py-2.5">
            <span className="caps">Amount</span>
            <span className="caps-faint">{sameCurrency ? "Same currency" : "Converted at today's rate"}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <Input
              label="Amount"
              type="number"
              min="0"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              leftAdornment={from ? CURRENCY(from.currency) : ""}
              className="numeric"
            />
            <Input
              label="Fee"
              type="number"
              min="0"
              step="any"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              leftAdornment={from ? CURRENCY(from.currency) : ""}
            />
            <Input label={t("date")} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {!sameCurrency && from && to && numericAmount > 0 && rate != null && (
            <p className="border-t border-border px-5 py-2.5 text-xs text-text-muted">
              ≈{" "}
              <span className="numeric font-bold text-text">
                {CURRENCY(to.currency)}
                {mask(formatMoney(numericAmount * rate, to.currency, locale)).replace(/^[^\d]*/, "")}
              </span>{" "}
              at 1 {from.currency} = {rate.toFixed(4)} {to.currency} — locked when you submit.
            </p>
          )}
          {insufficient && (
            <p className="border-t border-danger px-5 py-2.5 text-xs font-bold text-danger">
              Insufficient balance — available {fmt(available)}, required {fmt(numericAmount + numericFee)}.
            </p>
          )}
        </section>

        <section className="panel mt-4">
          <div className="panel-rule px-5 py-2.5">
            <span className="caps">Notes</span>
          </div>
          <div className="p-5">
            <Input
              label={undefined}
              type="text"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional memo"
            />
          </div>
        </section>

        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={saving} className="min-w-[160px]">
            Post transfer
          </Button>
        </div>
      </form>
    </main>
  );
}

function CURRENCY(code: string): string {
  // Symbol lookup without importing CURRENCY_DETAILS again.
  const symbols: Record<string, string> = {
    NPR: "रू", INR: "₹", USD: "$", QAR: "﷼", GBP: "£", AED: "د.إ",
    SAR: "﷼", MYR: "RM", KRW: "₩", JPY: "¥", AUD: "A$", CAD: "C$",
  };
  return symbols[code] ?? "";
}
