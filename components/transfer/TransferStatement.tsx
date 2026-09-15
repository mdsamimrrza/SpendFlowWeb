"use client";

/**
 * Transfer — 1:1 web mirror of mobile `app/transfer.tsx`: centered header with
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
 * stack. Like mobile, the transfer always posts with today's date — there is
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
import {
  MobileButton,
  MobileEmptyState,
  MobileHeaderBar,
} from "@/components/ui/MobileChrome";
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

/** Transfer — move money between accounts; the FX rate locks on the row. */
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
      <main className="mx-auto w-full max-w-[560px]">
        <Skeleton className="h-[62px] w-full rounded-xl" />
        <div className="mt-4 flex flex-col gap-[18px]">
          <Skeleton className="h-[86px] w-full rounded-md" />
          <Skeleton className="h-[86px] w-full rounded-md" />
          <Skeleton className="h-[70px] w-full rounded-md" />
          <Skeleton className="h-[104px] w-full rounded-[16px]" />
          <Skeleton className="h-[52px] w-full rounded-[10px]" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[560px]">
      <MobileHeaderBar
        title={t("transferTitle")}
        caption={
          fromAccount && toAccount ? (
            <span className="inline-flex items-center gap-1.5">
              <CurrencyFlag currency={fromCurrency} size={12} />
              <span className="font-extrabold">{fromCurrency}</span>
              <ArrowRight size={11} className="text-faint" aria-hidden />
              <CurrencyFlag currency={toCurrency} size={12} />
              <span className="font-extrabold">{toCurrency}</span>
            </span>
          ) : (
            t("selectAccountHint")
          )
        }
      />

      <div className="flex flex-col gap-[18px]">
        {!canTransfer ? (
          <MobileEmptyState
            icon={ArrowLeftRight}
            title={t("transferTitle")}
            message={t("twoAccountsMsg")}
            actionLabel={t("addAccount")}
            onAction={() => setAccountModalOpen(true)}
          />
        ) : (
          <>
            {/* ── FROM / TO ACCOUNT PICKERS ── */}
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

            <div className="-my-[9px] flex items-center gap-2.5">
              <span className="h-px flex-1 bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  setFromId(toId);
                  setToId(fromId);
                }}
                disabled={!fromId || !toId}
                aria-label={t("swapAccounts")}
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border transition active:opacity-70 disabled:opacity-40"
                style={{
                  backgroundColor: tint("var(--sf-primary)", 9),
                  borderColor: tint("var(--sf-primary)", 21),
                  color: "var(--sf-primary)",
                }}
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

            {/* ── AMOUNT ── */}
            <div>
              <p className="mb-1.5 text-[12.5px] font-extrabold text-text-muted">
                {t("amountLabel")}
                {fromAccount ? ` (${fromCurrency})` : ""}
              </p>
              <div className="flex items-center justify-center gap-2 rounded-md border-[1.5px] border-border bg-surface-elevated px-3 py-2.5">
                {fromAccount ? (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[13px] font-black text-primary"
                    style={{
                      backgroundColor: tint("var(--sf-primary)", 9),
                      borderColor: tint("var(--sf-primary)", 19),
                      borderWidth: 1,
                    }}
                  >
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
                  className="min-w-[100px] flex-1 bg-transparent text-center text-[32px] font-black leading-[38px] text-text outline-none placeholder:text-faint"
                />
                {rawAmount ? (
                  <button
                    type="button"
                    onClick={() => setRawAmount("")}
                    aria-label={t("clear")}
                    className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full transition active:opacity-70"
                    style={{ backgroundColor: tint("var(--sf-text)", 8) }}
                  >
                    <X size={14} className="text-text-muted" aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {QUICK_AMOUNTS.map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => addQuickAmount(inc)}
                    className="rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-[12px] font-bold text-text transition active:scale-[0.96]"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>

            {/* ── CONVERSION PREVIEW ── */}
            <div
              className="flex flex-col gap-1.5 rounded-[16px] border-[1.5px] bg-surface p-3.5"
              style={{
                borderColor:
                  fromAccount && toAccount && amountNum > 0
                    ? tint("var(--sf-primary)", 27)
                    : "var(--sf-border)",
              }}
            >
              <span className="flex items-center gap-1.5">
                <ArrowLeftRight size={13} className="text-primary" aria-hidden />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.8px] text-primary">
                  {t("recipientGets")}
                </span>
              </span>

              <p className="truncate text-[24px] font-black leading-[30px] tabular-nums text-text">
                {previewLoading
                  ? "…"
                  : preview
                    ? money(preview.converted, toCurrency)
                    : "—"}
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

            {/* ── FEE & NOTE ── */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface-elevated px-3 py-1">
                <span className="shrink-0 text-[12.5px] font-bold text-text-muted">
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
                  className="min-w-0 flex-1 bg-transparent py-2 text-[14px] font-bold text-text outline-none placeholder:text-faint"
                />
                {fromAccount ? (
                  <span className="shrink-0 text-[12px] font-extrabold text-text-muted">
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
                className="min-h-[44px] w-full resize-y rounded-md border border-border bg-surface-elevated px-3 py-2.5 text-[13.5px] leading-5 text-text outline-none placeholder:text-text-muted"
              />
            </div>

            {/* ── INSUFFICIENT BALANCE BANNER ── */}
            {insufficient ? (
              <div
                className="flex flex-col gap-1.5 rounded-md border p-3"
                style={{
                  backgroundColor: "var(--sf-tint-danger)",
                  borderColor: tint("var(--sf-danger)", 31),
                }}
              >
                <p className="text-[13px] font-extrabold text-danger">
                  {t("insufficientBalance")}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-text-muted">{t("available")}</span>
                  <span className="text-[12px] font-bold tabular-nums text-text">
                    {money(insufficient.available, insufficient.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-text-muted">{t("requiredLabel")}</span>
                  <span className="text-[12px] font-bold tabular-nums text-danger">
                    {money(insufficient.required, insufficient.currency)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* ── ERROR BANNER ── */}
            {error ? (
              <div
                className="flex items-center gap-2 rounded-md border p-3"
                style={{
                  backgroundColor: "var(--sf-tint-danger)",
                  borderColor: tint("var(--sf-danger)", 31),
                }}
              >
                <AlertCircle size={16} className="shrink-0 text-danger" aria-hidden />
                <p className="flex-1 text-[12.5px] font-semibold text-danger">{error}</p>
              </div>
            ) : null}

            {/* ── SUBMIT ── */}
            <MobileButton
              type="button"
              loading={saving}
              onClick={() => void submit()}
              className="h-[52px] w-full text-[14.5px] font-extrabold"
            >
              <ArrowLeftRight size={17} aria-hidden />
              {t("transferTitle")}
            </MobileButton>
          </>
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
      <p className="mb-1.5 text-[12.5px] font-extrabold text-text-muted">{label}</p>

      <button
        type="button"
        onClick={() => onOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2.5 rounded-md border-[1.5px] bg-surface-elevated p-3 text-left transition-colors"
        style={{ borderColor: open ? "var(--sf-primary)" : "var(--sf-border)" }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {selected ? (
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border"
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
                <span className="flex items-center gap-1.5 truncate text-[14px] font-extrabold text-text">
                  <CurrencyFlag currency={selected.currency} size={13} />
                  <span className="truncate">{selected.name}</span>
                </span>
                <span
                  className="block text-[11px] font-bold"
                  style={{ color: live >= 0 ? "var(--sf-income)" : "var(--sf-danger)" }}
                >
                  {t("available")}: {money(live, selected.currency)}
                </span>
              </>
            ) : (
              <>
                <span className="block truncate text-[14px] font-extrabold text-text">
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
        <div className="mt-0.5 rounded-md border-[1.2px] border-border bg-surface p-1.5 shadow-pop">
          <div className="max-h-[230px] overflow-y-auto">
            {options.length === 0 ? (
              <p className="p-2.5 text-[12px] text-text-muted">{t("twoAccountsMsg")}</p>
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
                    className="flex w-full items-center justify-between gap-2.5 rounded-sm px-3 py-2.5 text-left transition active:opacity-70"
                    style={{
                      backgroundColor: isSelected ? "var(--sf-set-cur-selected)" : "transparent",
                    }}
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
                            style={{ fontWeight: isSelected ? 800 : 600 }}
                          >
                            {acc.name}
                          </span>
                        </span>
                        <span
                          className="block text-[10.5px] font-bold"
                          style={{
                            color: accLive >= 0 ? "var(--sf-income)" : "var(--sf-danger)",
                          }}
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
