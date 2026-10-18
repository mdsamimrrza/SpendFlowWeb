"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { listRecurringRules, type RecurringRuleRow } from "@/services/recurring";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, stripCents, todayISO } from "@/utils/format";
import { Skeleton } from "@/components/ui/Skeleton";

interface UpcomingProps {
  /** Preview harness injection – skips the self-fetch. */
  injected?: { rules: RecurringRuleRow[] };
}

/**
 * The next scheduled payments that have NOT come due yet (overdue slots
 * live in the bills band), as statement rows: date block, days-away, and
 * a today-priced amount per plan. Capped at 3 – the section header's
 * "View all" leads to the full list.
 */
export function Upcoming({ injected }: UpcomingProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const supabase = getSupabaseBrowserClient();
  const [upcoming, setUpcoming] = useState<RecurringRuleRow[] | null>(
    injected?.rules ?? null,
  );
  const [loading, setLoading] = useState(!injected);

  const load = useCallback(async () => {
    if (injected) return;
    if (!user) {
      setUpcoming([]);
      setLoading(false);
      return;
    }
    try {
      const rules = await listRecurringRules(supabase, user.id);
      const today = todayISO();
      setUpcoming(
        rules
          .filter((r) => r.is_active && r.next_due_date > today)
          .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
          .slice(0, 3),
      );
    } catch {
      setUpcoming([]);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, injected]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToExpenseChanges(() => void load());
    return unsubscribe;
  }, [load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";

  // Same pricing convention as the bills band: today's rate into the
  // display currency, native figure kept as the caption.
  const { convert, ready } = useRowConverter(
    displayCurrency,
    (upcoming ?? []).map((rule) => ({
      amount: Number(rule.amount) || 0,
      currency: rule.currency || displayCurrency,
      date: todayISO(),
      exchange_rate_to_usd: null,
    })),
  );
  const price = (rule: RecurringRuleRow) => {
    const value = Number(rule.amount) || 0;
    const native = rule.currency || displayCurrency;
    if (native === displayCurrency || !ready) {
      return { shown: stripCents(formatMoney(value, native, locale)), nativeText: null as string | null };
    }
    const converted = convert({
      amount: value,
      currency: native,
      date: todayISO(),
      exchange_rate_to_usd: null,
    });
    return converted === value
      ? { shown: stripCents(formatMoney(value, native, locale)), nativeText: null }
      : {
          shown: stripCents(formatMoney(converted, displayCurrency, locale)),
          nativeText: stripCents(formatMoney(value, native, locale)),
        };
  };

  const daysAway = (iso: string) =>
    Math.max(
      1,
      Math.round(
        (new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) /
          86_400_000,
      ),
    );

  if (loading) {
    return (
      <div className="space-y-3 py-1">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!upcoming || upcoming.length === 0) {
    return <p className="py-1 text-[12.5px] text-faint">{t("homeNoUpcoming")}</p>;
  }

  return (
    <ul className="divide-y divide-border border-t border-border">
      {upcoming.map((rule) => {
        const priced = price(rule);
        const days = daysAway(rule.next_due_date);
        const due = new Date(`${rule.next_due_date}T00:00:00`);
        return (
          <li key={rule.id} className="flex items-center gap-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface leading-none">
              <span className="text-[13.5px] font-bold text-text">{due.getDate()}</span>
              <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-faint">
                {new Intl.DateTimeFormat(locale, { month: "short" }).format(due)}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-text">
                {rule.description?.trim() || rule.categories?.name || t("recurring")}
              </span>
              <span className="numeric block truncate text-[11px] text-faint">{days}d</span>
            </span>
            <span className="min-w-0 shrink-0 text-right">
              <span className="numeric block truncate text-[13px] font-semibold text-text">
                {priced.shown}
              </span>
              {priced.nativeText && (
                <span className="numeric block truncate text-[10.5px] text-faint">
                  {priced.nativeText}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
