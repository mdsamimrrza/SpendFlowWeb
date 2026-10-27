"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Repeat } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { notifyExpensesChanged, subscribeToExpenseChanges } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { categoryGlyph } from "@/components/ui/Glyph";
import {
  listRecurringRules,
  listRuleOccurrences,
  markOccurrencePaid,
  type RecurringRuleRow,
} from "@/services/recurring";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { formatMoney, stripCents, todayISO } from "@/utils/format";
import { CardPillLink, DashCard } from "./primitives";

const MAX_ROWS = 3;

interface BillsDueProps {
  /** Preview harness injection – skips the self-fetch. */
  injected?: { rules: RecurringRuleRow[]; overdueDays: number[] };
}

/**
 * "Bills due" statement band (mobile BillsDueStrip parity): rules whose
 * slot is open render here with one-tap Mark Paid – money still owed, not
 * history. The section self-removes when nothing is owed. Auto_charge
 * plans only appear transiently (the generator books them when the
 * Recurring tab loads); pay_on_due plans wait for this tap.
 */
export function BillsDue({ injected }: BillsDueProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [due, setDue] = useState<{ rule: RecurringRuleRow; overdueDays: number }[]>(
    injected
      ? injected.rules.map((rule, i) => ({ rule, overdueDays: injected.overdueDays[i] ?? 0 }))
      : [],
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (injected || !user) {
      if (!injected) setDue([]);
      return;
    }
    try {
      const rules = await listRecurringRules(supabase, user.id);
      const today = todayISO();
      const open = rules.filter((r) => r.is_active && r.next_due_date <= today);
      if (open.length === 0) {
        setDue([]);
        return;
      }
      const booked = await listRuleOccurrences(
        supabase,
        user.id,
        open.map((r) => r.id),
      );
      const isBooked = (rule: RecurringRuleRow) =>
        booked.some(
          (o) => o.recurring_rule_id === rule.id && o.recurring_due_date === rule.next_due_date,
        );
      setDue(
        open
          .filter((r) => !isBooked(r))
          .map((rule) => ({
            rule,
            overdueDays: Math.max(
              0,
              Math.round(
                (new Date(`${today}T00:00:00`).getTime() -
                  new Date(`${rule.next_due_date}T00:00:00`).getTime()) /
                  86_400_000,
              ),
            ),
          }))
          .sort((a, b) => a.rule.next_due_date.localeCompare(b.rule.next_due_date)),
      );
    } catch {
      // urgency band – a failed poll never blocks the dashboard
    }
  }, [user, supabase, injected]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToExpenseChanges(() => void load());
    return unsubscribe;
  }, [load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";

  // Each plan prices at today's rate into the display currency; a foreign
  // plan keeps its own figure as the caption (History/Analytics convention).
  const { convert, ready } = useRowConverter(
    displayCurrency,
    due.map(({ rule }) => ({
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

  async function handlePaid(rule: RecurringRuleRow) {
    if (!user) return;
    setBusyId(rule.id);
    try {
      const { lateDays } = await markOccurrencePaid(supabase, user.id, rule.id);
      notifyExpensesChanged();
      showToast(
        lateDays > 0
          ? `${t("recurring_marked_paid")} · ${t("recurring_late_days")} ${lateDays}d`
          : t("recurring_marked_paid"),
        "success",
      );
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setBusyId(null);
    }
  }

  if (due.length === 0) return null;

  const visible = due.slice(0, MAX_ROWS);
  const extra = due.length - visible.length;
  const hasOverdue = due.some((d) => d.overdueDays > 0);

  return (
    <DashCard
      title={
        <span className={hasOverdue ? "!text-danger" : "!text-income"}>
          {t("recurring_bills_due")}
          <span className="numeric ml-2 font-medium">
            · {due.length}
          </span>
        </span>
      }
      action={<CardPillLink href="/recurring">{t("viewAll")}</CardPillLink>}
    >
      <div
        className="divide-y divide-border/70 rounded-xl border px-4"
        style={{
          borderColor: hasOverdue
            ? "color-mix(in srgb, var(--sf-danger) 32%, transparent)"
            : "color-mix(in srgb, var(--sf-income) 32%, transparent)",
          background: hasOverdue ? "var(--sf-tint-danger)" : "var(--sf-tint-success)",
        }}
      >
        {visible.map(({ rule, overdueDays }) => {
          const Glyph = rule.categories?.icon ? categoryGlyph(rule.categories.icon) : Repeat;
          const priced = price(rule);
          return (
            <div key={rule.id} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className="shrink-0 text-text-muted">
                <Glyph size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text">
                  {rule.description?.trim() || rule.categories?.name || t("recurring")}
                </p>
                <p className="numeric truncate text-[11px] text-faint">
                  {priced.shown}
                  {priced.nativeText ? ` (${priced.nativeText})` : ""} ·{" "}
                  {overdueDays > 0 ? (
                    <span className="font-semibold text-danger">
                      {t("recurring_overdue")} {overdueDays}d
                    </span>
                  ) : (
                    <span className="font-semibold text-income">{t("recurring_due_today")}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePaid(rule)}
                disabled={busyId === rule.id}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-income bg-background px-2.5 text-[11px] font-bold text-income transition hover:bg-income hover:text-background disabled:opacity-50"
              >
                <Check size={13} aria-hidden />
                {t("recurring_mark_paid")}
              </button>
            </div>
          );
        })}
        {extra > 0 && (
          <p className="numeric py-2 text-[11px] text-faint">
            +{extra} {t("recurring_more_due")}
          </p>
        )}
      </div>
    </DashCard>
  );
}
