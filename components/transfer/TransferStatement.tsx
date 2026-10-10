"use client";

/**
 * Transfer - 1:1 web mirror of mobile `app/transfer.tsx`: centered header with
 * the live route caption, the From/To account pickers (tinted icon tile, flag,
 * live "Available" line, inline option list with check marks), the hairline
 * swap chip between them, the big centred amount field with currency pill,
 * clear button and +100/+500/+1000/+5000 quick-add chips, the "Recipient gets"
 * conversion card (same rate pipeline the row locks at), fee + note rows, the
 * insufficient-balance breakdown, the error banner and the full-height
 * Transfer button. With fewer than two accounts the mobile empty state shows
 * and "Add Account" opens the account editor inline.
 *
 * Web divergences (recorded in docs/FEATURE-PARITY.md, not silent): the
 * `?from=&to=` deep-link prefill is still accepted, every figure passes through
 * the privacy mask, the memo is capped at the 300-char column limit, and a
 * successful post resets the form in place instead of popping the navigation
 * stack. Like mobile, the transfer always posts with today's date - there is
 * no date picker.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountManageModal } from "@/components/account/AccountManageModal";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";
import { Skeleton } from "@/components/ui/Skeleton";
import { accountGlyph } from "@/components/ui/Glyph";
import { formatMoney, todayISO } from "@/utils/format";
import {
  computeAccountBalances,
  listBankAccounts,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { createTransfer } from "@/services/transfers";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { CurrencyCode } from "@/constants/app";

/** Mock dataset for the static design preview (no auth, no network). */
export interface TransferInject {
  accounts: BankAccountRow[];
  balances: Map<string, number>;
  /** Units of `to` per 1 unit of `from` (the same basis the row locks). */
  rate: number | null;
}

interface TransferPageProps {
  /** When present, renders the mirrored form with injected data. */
  inject?: TransferInject;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** Mobile tints the pickers/swap chip with hex+alpha; tokens are plain hex,
 *  so the same alphas are mixed against transparency here. */
function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

/** Transfer - move money between accounts; the FX rate locks on the row. */
export function TransferStatement({ inject }: TransferPageProps) {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [rawAmount, setRawAmount] = useState("");
  const [rawFee, setRawFee] = useState("");
  const [notes, setNotes] = useState("");
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{
    available: number;
    required: number;
    currency: string;
  } | null>(null);
  const [preview, setPreview] = useState<{ converted: number; rate: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

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
        const params =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const pf = params?.get("from");
        const pt = params?.get("to");
        const f = pf && accs.some((a) => a.id === pf) ? pf : null;
        const to = pt && pt !== f && accs.some((a) => a.id === pt) ? pt : null;
        if (f) setFromId(f);
        if (to) setToId(to);
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
      // The harness screenshots the populated design, so pre-select the route
      // (a real load starts unselected, exactly like mobile).
      setFromId(inject.accounts[0]?.id ?? null);
      setToId(inject.accounts.find((a) => a.id !== inject.accounts[0]?.id)?.id ?? null);
      setLoading(false);
      return;
    }
    void load();
  }, [inject, load]);

  const liveBalanceOf = useCallback(
    (id: string | null) => {
      if (!id) return 0;
      const entry = balances.get(id);
      if (entry !== undefined) return entry;
      return Number(accounts.find((a) => a.id === id)?.initial_balance ?? 0);
    },
    [balances, accounts],
  );

  const fromAccount = accounts.find((a) => a.id === fromId) ?? null;
  const toAccount = accounts.find((a) => a.id === toId) ?? null;
  const fromCurrency = (fromAccount?.currency || "NPR").toUpperCase();
  const toCurrency = (toAccount?.currency || "NPR").toUpperCase();
  const sameCurrency = Boolean(fromAccount && toAccount) && fromCurrency === toCurrency;

  const amountNum = Number(rawAmount) || 0;

  const money = useCallback(
    (n: number, currency: string) => mask(formatMoney(n, currency as CurrencyCode, locale)),
    [mask, locale],
  );

  // Live conversion preview: the same authoritative rate pipeline the saved
  // transfer locks (DB cache → provider → pegs/fallbacks), debounced while typing.
  useEffect(() => {
    setError(null);
    setInsufficient(null);
    if (!fromAccount || !toAccount || amountNum <= 0) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    if (sameCurrency) {
      setPreview({ converted: round2(amountNum), rate: 1 });
      setPreviewLoading(false);
      return;
    }
    if (inject) {
      const rate = inject.rate ?? 1;
      setPreview({ converted: round2(amountNum * rate), rate });
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const date = todayISO();
        const [fromUsdPerUnit, toUsdPerUnit] = await Promise.all([
          getRate(supabase, fromCurrency, date),
          getRate(supabase, toCurrency, date),
        ]);
        if (cancelled) return;
        const rate = round8(fromUsdPerUnit / toUsdPerUnit);
        setPreview({ converted: round2(amountNum * rate), rate });
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccount?.id, toAccount?.id, rawAmount, fromCurrency, toCurrency]);

  /** Digits and a single decimal separator, nothing else. */
  const digitsOnly = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  };

  const addQuickAmount = (inc: number) => setRawAmount(String(round2(amountNum + inc)));

  const closeAllPickers = () => {
    setFromOpen(false);
    setToOpen(false);
  };

  const submit = async () => {
    if (saving) return;
    setError(null);
    setInsufficient(null);
    if (!fromAccount || !toAccount) {
      setError(t("transferErrAccounts"));
      return;
    }
    if (amountNum <= 0) {
      setError(t("transferErrAmount"));
      return;
    }
    if (fromAccount.id === toAccount.id) {
      setError(t("transferErrSame"));
      return;
    }
    const fee = Number(rawFee) || 0;
    const available = liveBalanceOf(fromAccount.id);
    const required = round2(amountNum + (fee > 0 ? fee : 0));
    if (required > available) {
      setInsufficient({ available, required, currency: fromCurrency });
      setError(t("transferErrInsufficient"));
      return;
    }
    setSaving(true);
    try {
      const created = await createTransfer(supabase, user!.id, {
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount: amountNum,
        fee: fee > 0 ? fee : undefined,
        date: todayISO(),
        time: null,
        notes: notes.trim() || null,
      });
      showToast(
        `${t("transferDone")}: ${money(created.amount, created.from_currency)} → ${money(
          created.converted_amount,
          created.to_currency,
        )}`,
        "success",
      );
      setRawAmount("");
      setRawFee("");
      setNotes("");
      if (!inject) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  };

  const fromOptions = useMemo(() => accounts.filter((a) => a.id !== toId), [accounts, toId]);
  const toOptions = useMemo(() => accounts.filter((a) => a.id !== fromId), [accounts, fromId]);

  const canTransfer = accounts.length >= 2;

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-lg">
        <Skeleton className="h-8 w-36" />
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg">
      {/* Page header - the live route sits in the caption line */}
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
          {t("transferTitle")}
        </h1>
        <p className="mt-0.5 text-[13px] text-faint">
          {fromAccount && toAccount ? (
            <span className="inline-flex items-center gap-1.5">
              <CurrencyFlag currency={fromCurrency} size={12} />
              <span className="numeric font-semibold text-text-muted">{fromCurrency}</span>
              <ArrowRight size={11} className="text-faint" aria-hidden />
              <CurrencyFlag currency={toCurrency} size={12} />
              <span className="numeric font-semibold text-text-muted">{toCurrency}</span>
            </span>
          ) : (
            t("selectAccountHint")
          )}
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft sm:p-5">
        {!canTransfer ? (
          <EmptyState
            title={t("transferTitle")}
            message={t("twoAccountsMsg")}
            action={
              <Button className="!rounded-lg" onClick={() => setAccountModalOpen(true)}>
                {t("addAccount")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* FROM / TO ACCOUNT PICKERS */}
            <AccountPicker
              label={t("transferFromLabel")}
              accounts={accounts}
              options={fromOptions}
              selectedId={fromId}
              open={fromOpen}
              onOpen={(next) => {
                setFromOpen(next);
                setToOpen(false);
              }}
              onSelect={(id) => {
                setFromId(id);
                closeAllPickers();
              }}
              liveBalanceOf={liveBalanceOf}
              money={money}
            />

            <div className="-my-1.5 flex items-center gap-2.5">
              <span className="h-px flex-1 bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  setFromId(toId);
                  setToId(fromId);
                }}
                disabled={!fromId || !toId}
                aria-label={t("swapAccounts")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/30 bg-[var(--sf-primary-light)] text-primary transition hover:border-primary/60 active:opacity-70 disabled:opacity-40"
              >
                <ArrowUpDown size={15} aria-hidden />
              </button>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <AccountPicker
              label={t("transferToLabel")}
              accounts={accounts}
              options={toOptions}
              selectedId={toId}
              open={toOpen}
              onOpen={(next) => {
                setToOpen(next);
                setFromOpen(false);
              }}
              onSelect={(id) => {
                setToId(id);
                closeAllPickers();
              }}
              liveBalanceOf={liveBalanceOf}
              money={money}
            />

            {/* AMOUNT */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-text-muted">
                {t("amountLabel")}
                {fromAccount ? ` (${fromCurrency})` : ""}
              </p>
              <div className="flex items-center justify-center gap-2 rounded-lg border-[1.5px] border-border bg-surface-elevated px-3 py-2.5 transition-colors focus-within:border-primary">
                {fromAccount ? (
                  <span className="numeric shrink-0 rounded-lg bg-[var(--sf-primary-light)] px-2.5 py-1 text-[13px] font-bold text-primary-strong">
                    {fromCurrency}
                  </span>
                ) : null}
                <input
                  type="text"
                  inputMode="decimal"
                  name="tr-amount"
                  aria-label={t("amountLabel")}
                  placeholder="0.00"
                  value={rawAmount}
                  onChange={(e) => setRawAmount(digitsOnly(e.target.value))}
                  className="figures-display min-w-[100px] flex-1 bg-transparent text-center text-[30px] leading-9 text-text outline-none placeholder:font-medium placeholder:text-faint"
                />
                {rawAmount ? (
                  <button
                    type="button"
                    onClick={() => setRawAmount("")}
                    aria-label={t("clear")}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface text-text-muted transition hover:text-text active:opacity-70"
                  >
                    <X size={14} aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {QUICK_AMOUNTS.map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => addQuickAmount(inc)}
                    className="numeric rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text transition hover:border-faint active:scale-[0.97]"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>

            {/* CONVERSION PREVIEW */}
            <div
              className={`flex flex-col gap-1.5 rounded-xl border bg-surface-elevated p-4 transition-colors ${
                fromAccount && toAccount && amountNum > 0 ? "border-primary/30" : "border-border"
              }`}
            >
              <span className="caps flex items-center gap-1.5 !text-primary">
                <ArrowLeftRight size={12} aria-hidden />
                {t("recipientGets")}
              </span>

              <p className="figures-display truncate text-2xl leading-8 text-text">
                {previewLoading ? "..." : preview ? money(preview.converted, toCurrency) : "-"}
              </p>

              <p className="text-[11px] leading-4 text-text-muted">
                {previewLoading
                  ? t("rateLoading")
                  : preview
                    ? sameCurrency
                      ? t("sameCurrencyNoConvert")
                      : `1 ${fromCurrency} = ${preview.rate.toFixed(4)} ${toCurrency} · ${t(
                          "todayExchangeRate",
                        )}`
                    : fromAccount && toAccount
                      ? t("transferErrAmount")
                      : t("transferErrAccounts")}
              </p>
            </div>

            {/* FEE & NOTE */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-elevated px-3 py-1 transition-colors focus-within:border-primary">
                <span className="shrink-0 text-xs font-semibold text-text-muted">
                  {t("feeOptional")}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="tr-fee"
                  aria-label={t("feeOptional")}
                  placeholder="0.00"
                  value={rawFee}
                  onChange={(e) => setRawFee(digitsOnly(e.target.value))}
                  className="numeric min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-text outline-none placeholder:font-medium placeholder:text-faint"
                />
                {fromAccount ? (
                  <span className="numeric shrink-0 text-xs font-semibold text-text-muted">
                    {fromCurrency}
                  </span>
                ) : null}
              </div>

              <textarea
                name="tr-notes"
                aria-label={t("noteOptional")}
                placeholder={t("noteOptional")}
                value={notes}
                maxLength={300}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="min-h-[44px] w-full resize-y rounded-lg border border-border bg-surface-elevated px-3 py-2.5 text-[13.5px] leading-5 text-text outline-none transition-colors placeholder:text-text-muted focus:border-primary"
              />
            </div>

            {/* INSUFFICIENT BALANCE BANNER */}
            {insufficient ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-danger/30 bg-rust-tint p-3">
                <p className="text-[13px] font-semibold text-danger">
                  {t("insufficientBalance")}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text-muted">{t("available")}</span>
                  <span className="numeric text-xs font-semibold text-text">
                    {money(insufficient.available, insufficient.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text-muted">{t("requiredLabel")}</span>
                  <span className="numeric text-xs font-semibold text-danger">
                    {money(insufficient.required, insufficient.currency)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* ERROR BANNER */}
            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-rust-tint p-3">
                <AlertCircle size={16} className="shrink-0 text-danger" aria-hidden />
                <p className="flex-1 text-[12.5px] font-medium text-danger">{error}</p>
              </div>
            ) : null}

            {/* SUBMIT */}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <ArrowLeftRight size={16} aria-hidden />
              )}
              {t("transferTitle")}
            </button>
          </div>
        )}
      </div>

      <AccountManageModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        account={null}
        onSaved={() => {
          setAccountModalOpen(false);
          void load();
        }}
      />
    </main>
  );
}

/** Mobile renderPicker: label, trigger box with tile + live balance, and the
 *  expanded option list (each row carries its own available balance). */
function AccountPicker({
  label,
  accounts,
  options,
  selectedId,
  open,
  onOpen,
  onSelect,
  liveBalanceOf,
  money,
}: {
  label: string;
  accounts: BankAccountRow[];
  options: BankAccountRow[];
  selectedId: string | null;
  open: boolean;
  onOpen: (next: boolean) => void;
  onSelect: (id: string) => void;
  liveBalanceOf: (id: string | null) => number;
  money: (n: number, currency: string) => string;
}) {
  const { t } = useLanguage();
  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const SelectedGlyph = accountGlyph(selected?.icon, selected?.account_type);
  const live = liveBalanceOf(selectedId);

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-text-muted">{label}</p>

      <button
        type="button"
        onClick={() => onOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg border-[1.5px] bg-surface-elevated p-3 text-left transition-colors"
        style={{ borderColor: open ? "var(--sf-primary)" : "var(--sf-border)" }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {selected ? (
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
              style={{
                backgroundColor: tint(selected.color || "var(--sf-primary)", 9),
                borderColor: tint(selected.color || "var(--sf-primary)", 19),
                color: selected.color || "var(--sf-primary)",
              }}
            >
              <SelectedGlyph size={18} aria-hidden />
            </span>
          ) : (
            <Wallet size={18} className="shrink-0 text-text-muted" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            {selected ? (
              <>
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-text">
                  <CurrencyFlag currency={selected.currency} size={13} />
                  <span className="truncate">{selected.name}</span>
                </span>
                <span
                  className={`numeric block text-[11px] font-semibold ${
                    live >= 0 ? "text-income" : "text-danger"
                  }`}
                >
                  {t("available")}: {money(live, selected.currency)}
                </span>
              </>
            ) : (
              <>
                <span className="block truncate text-sm font-semibold text-text">
                  {t("selectAccount")}
                </span>
                <span className="block text-[11px] text-text-muted">{t("selectAccountHint")}</span>
              </>
            )}
          </span>
        </span>

        <ChevronDown
          size={18}
          className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="mt-1 rounded-lg border border-border bg-surface p-1.5 shadow-soft">
          <div className="max-h-[230px] overflow-y-auto">
            {options.length === 0 ? (
              <p className="p-2.5 text-xs text-text-muted">{t("twoAccountsMsg")}</p>
            ) : (
              options.map((acc) => {
                const isSelected = selectedId === acc.id;
                const accLive = liveBalanceOf(acc.id);
                const AccGlyph = accountGlyph(acc.icon, acc.account_type);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => onSelect(acc.id)}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-md px-3 py-2.5 text-left transition active:opacity-70 ${
                      isSelected ? "bg-[var(--sf-primary-light)]" : "hover:bg-surface-elevated"
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className="shrink-0"
                        style={{ color: acc.color || "var(--sf-primary)" }}
                      >
                        <AccGlyph size={18} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[13.5px] text-text">
                          <CurrencyFlag currency={acc.currency} size={12} />
                          <span
                            className="truncate"
                            style={{ fontWeight: isSelected ? 600 : 500 }}
                          >
                            {acc.name}
                          </span>
                        </span>
                        <span
                          className={`numeric block text-[10.5px] font-semibold ${
                            accLive >= 0 ? "text-income" : "text-danger"
                          }`}
                        >
                          {acc.currency} · {t("available")}: {money(accLive, acc.currency)}
                        </span>
                      </span>
                    </span>
                    {isSelected ? <Check size={16} className="shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
