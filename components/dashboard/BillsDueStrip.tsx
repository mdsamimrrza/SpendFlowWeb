"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Repeat } from "lucide-react";
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
import { formatMoney, todayISO } from "@/utils/format";

const MAX_ROWS = 3;

/**
 * "Bills due" strip (mobile BillsDueStrip parity): rules whose slot is open
 * render here with a one-tap Mark Paid — money the user still owes, not
 * history. Auto_charge rules only appear transiently (the generator books
 * them when the Recurring tab loads); pay_on_due rules wait for this tap.
 */
export function BillsDueStrip() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [due, setDue] = useState<{ rule: RecurringRuleRow; overdueDays: number }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setDue([]);
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
      // The strip is decorative urgency — a failed poll never blocks the dashboard.
    }
  }, [user, supabase]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToExpenseChanges(() => void load());
    return unsubscribe;
  }, [load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";

  // The strip lists plans side by side, so each amount prices at today's rate
  // into the display currency; a foreign plan keeps its own figure as the
  // caption (History/Analytics convention).
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
      return { shown: formatMoney(value, native, locale), nativeText: null as string | null };
    }
    const converted = convert({
      amount: value,
      currency: native,
      date: todayISO(),
      exchange_rate_to_usd: null,
    });
    return converted === value
      ? { shown: formatMoney(value, native, locale), nativeText: null }
      : {
          shown: formatMoney(converted, displayCurrency, locale),
          nativeText: formatMoney(value, native, locale),
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
    <section
      className="panel mb-4 border-2"
      style={{ borderColor: hasOverdue ? "color-mix(in srgb, var(--sf-danger) 50%, transparent)" : "var(--sf-border)" }}
      aria-label={t("recurring_bills_due")}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5"
        style={{ borderColor: "color-mix(in srgb, var(--sf-border) 60%, transparent)" }}>
        <p
          className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.08em] ${
            hasOverdue ? "text-danger" : "text-primary"
          }`}
        >
          <AlertCircle size={14} />
          {t("recurring_bills_due")} · {due.length}
        </p>
        <Link href="/recurring" className="caps inline-flex items-center gap-0.5 !text-primary hover:underline">
          <ChevronRight size={13} /> {t("viewAll")}
        </Link>
      </div>
      <div>
        {visible.map(({ rule, overdueDays }) => {
          const Glyph = rule.categories?.icon ? categoryGlyph(rule.categories.icon) : Repeat;
          const priced = price(rule);
          return (
          <div
            key={rule.id}
            className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0 sm:px-5"
            style={{ borderColor: "color-mix(in srgb, var(--sf-border) 60%, transparent)" }}
          >
            <span aria-hidden className="text-primary">
              <Glyph size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text">
                {rule.description?.trim() || rule.categories?.name || t("recurring")}
              </p>
              <p className="truncate text-[11px] text-faint">
                <span className="numeric">
                  {priced.shown}
                  {priced.nativeText ? ` (${priced.nativeText})` : ""}
                </span>{" "}
                ·{" "}
                {overdueDays > 0 ? (
                  <span className="font-bold text-danger">
                    {t("recurring_overdue")} {overdueDays}d · {t("recurring_slot_due")} {rule.next_due_date}
                  </span>
                ) : (
                  <span className="font-bold text-primary">{t("recurring_due_today")}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handlePaid(rule)}
              disabled={busyId === rule.id}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 border border-income bg-[var(--sf-tint-success)] px-3 text-[11px] font-black uppercase tracking-[0.06em] text-income transition hover:bg-income hover:text-white disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {t("recurring_mark_paid")}
            </button>
          </div>
          );
        })}
        {extra > 0 && (
          <div className="border-t px-4 py-2 text-[11px] italic text-faint sm:px-5"
            style={{ borderColor: "color-mix(in srgb, var(--sf-border) 60%, transparent)" }}>
            +{extra} {t("recurring_more_due")}
          </div>
        )}
      </div>
    </section>
  );
}
