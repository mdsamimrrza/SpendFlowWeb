"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import {
  computeAccountBalances,
  listBankAccounts,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney } from "@/utils/format";
import { Skeleton } from "@/components/ui/Skeleton";
import { Section } from "./primitives";

interface AccountsStripProps {
  /** Preview harness injection – skips the self-fetch. */
  injected?: {
    accounts: BankAccountRow[];
    balances: Map<string, number>;
    total: number;
  };
}

/**
 * Accounts as a statement register: the total live balance as the lead
 * figure, then one hairline-ruled row per account (color dot, name,
 * ··last4, balance). Mobile-parity math: initial + income − expenses ±
 * transfers, converted to the display currency at today's rates.
 */
export function AccountsStrip({ injected }: AccountsStripProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const supabase = getSupabaseBrowserClient();
  const [accounts, setAccounts] = useState<BankAccountRow[] | null>(
    injected?.accounts ?? null,
  );
  const [balances, setBalances] = useState<Map<string, number>>(
    injected?.balances ?? new Map(),
  );
  const [loading, setLoading] = useState(!injected);
  const [total, setTotal] = useState<number | null>(injected?.total ?? null);

  const load = useCallback(async () => {
    if (injected) return;
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const rows = await listBankAccounts(supabase, user.id);
      const map = await computeAccountBalances(supabase, user.id, rows);
      setAccounts(rows);
      setBalances(map);
    } catch {
      // never block the dashboard on the balance poll
    } finally {
      setLoading(false);
    }
  }, [user, supabase, injected]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToExpenseChanges(() => void load());
    return unsubscribe;
  }, [load]);

  // Total in the display currency: Σ balance × rate(account) / rate(display).
  useEffect(() => {
    if (injected || !accounts) return;
    let cancelled = false;
    const target = profile?.preferred_currency ?? "NPR";
    (async () => {
      let sum = 0;
      for (const account of accounts) {
        const bal = balances.get(account.id) ?? 0;
        if (account.currency === target) {
          sum += bal;
          continue;
        }
        try {
          const [from, to] = await Promise.all([
            getRate(supabase, account.currency),
            getRate(supabase, target),
          ]);
          sum += to > 0 ? (bal * from) / to : bal;
        } catch {
          sum += bal;
        }
      }
      if (!cancelled) setTotal(Math.round(sum * 100) / 100);
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, balances, supabase, injected, profile?.preferred_currency]);

  // Total in the display currency: Σ balance × rate(account) / rate(display).
  useEffect(() => {
    if (injected || !accounts) return;
    let cancelled = false;
    const target = profile?.preferred_currency ?? "NPR";
    (async () => {
      let sum = 0;
      for (const account of accounts) {
        const bal = balances.get(account.id) ?? 0;
        if (account.currency === target) {
          sum += bal;
          continue;
        }
        try {
          const [from, to] = await Promise.all([
            getRate(supabase, account.currency),
            getRate(supabase, target),
          ]);
          sum += to > 0 ? (bal * from) / to : bal;
        } catch {
          sum += bal;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, balances, supabase, injected, profile?.preferred_currency]);

  if (!loading && !accounts) return null; // anonymous / signed-out

  const fmt = (n: number) => formatMoney(n, profile?.preferred_currency ?? "NPR", locale);
  // Balances read cleaner without cents at dashboard scale.
  const whole = (n: number) =>
    fmt(n).replace(/[.,](?:\d{2}|[\u0966-\u096F]{2})$/, "");
  const ordered = accounts
    ? [...accounts].sort((a, b) => Number(b.is_default) - Number(a.is_default))
    : [];
  // The dashboard card shows at most 5 – the rest live behind "View all".
  const visible = ordered.slice(0, 5);
  const extra = ordered.length - visible.length;

  return (
    <Section
      label={t("accounts")}
      action={
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
        >
          {t("homeTotalBalance")}
          <span className="numeric">
            {loading || total == null ? "…" : whole(total)}
          </span>
        </Link>
      }
    >
      <ul className="divide-y divide-border/70">
        {loading || accounts == null
          ? Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="py-3">
                <Skeleton className="h-6 w-full" />
              </li>
            ))
          : visible.map((account) => {
              const bal = balances.get(account.id) ?? 0;
              return (
                <li key={account.id} className="flex items-center gap-3 py-3">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[var(--sf-surface-elevated)]"
                    style={{ background: account.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
                    {account.name}
                    {account.is_default && (
                      <span className="ml-2 align-middle text-[9px] font-bold uppercase tracking-[0.08em] text-faint">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="numeric shrink-0 text-[11px] text-faint">
                    {account.currency}
                    {account.account_number_last4 ? ` ·· ${account.account_number_last4}` : ""}
                  </span>
                  <span className="numeric w-24 shrink-0 text-right text-[13px] font-semibold text-text sm:w-28">
                    {whole(Math.round(bal * 100) / 100)}
                  </span>
                </li>
              );
            })}
      </ul>

      {extra > 0 && (
        <Link
          href="/accounts"
          className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full border border-border text-[12px] font-semibold text-text-muted transition-colors hover:border-faint hover:text-text"
        >
          {t("viewAll")} · {ordered.length}
        </Link>
      )}
    </Section>
  );
}
