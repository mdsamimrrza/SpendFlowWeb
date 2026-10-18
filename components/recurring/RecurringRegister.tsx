"use client";

/**
 * Recurring - V2 plan register (web layout; behavior mirrors mobile
 * `app/(tabs)/recurring.tsx`): page header with the desktop New-plan action,
 * the total-commitment hero (privacy eye inside), on lg+ a two-column layout
 * (register list left, summary column right: status counts and the next-30-
 * days list) while phones keep the stacked hero-then-register flow, the
 * grouped card of plan rows (42px category tile, "frequency · paid proof ·
 * next Mon d" subtitle, amount over a DUE badge or a dashed ACTIVE/PAUSED
 * pill), the centered subscription sheet (amount banner, due card / paid
 * proof with undo, booked slots plus the current and two upcoming slots,
 * Mark Paid + Skip, and the status/frequency/due/channel/billing-mode tiles),
 * the bottom-sheet bill editor (currency-prefixed amount hero, description,
 * category, four frequency pills, Every-N-days with 7/14/28/30d presets, the
 * two billing-mode cards, the date field with Today/Tomorrow/1st/15th
 * presets, payment-channel pills, Delete + Save on edit) and the delete
 * confirm.
 *
 * Web divergences (recorded in docs/FEATURE-PARITY.md, not silent): stored
 * emoji resolve through `categoryGlyph` and every other glyph is Lucide; the
 * quick-add presets seed a plain text description; auto-charge rules are
 * generated on load because the web has no login-time generator; every
 * figure honours the privacy mask; the sheet is capped to the 560px column on
 * wide screens.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ChevronDown,
  Home,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Tv,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { CalendarModal } from "@/components/ui/CalendarModal";
import { MobileButton } from "@/components/ui/MobileChrome";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { categoryGlyph } from "@/components/ui/Glyph";
import { formatMoney, formatShortDate, toISODate, todayISO } from "@/utils/format";
import { notifyExpensesChanged, useCategories } from "@/hooks/useExpenses";
import { useRowConverter, type ConvertibleRow } from "@/hooks/useRates";
import { CURRENCIES, CURRENCY_DETAILS, PAYMENT_METHODS, type CurrencyCode, type PaymentMethod } from "@/constants/app";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import {
  createRecurringRule,
  deleteRecurringRule,
  generateDueRecurringExpenses,
  latestOccurrenceFor,
  listRecurringRules,
  listRuleOccurrences,
  markOccurrencePaid,
  nextDueDate as advanceDueDate,
  ruleIsDue,
  ruleMode,
  skipCurrentOccurrence,
  undoLatestOccurrencePayment,
  updateRecurringRule,
  type RecurringFrequency,
  type RecurringMode,
  type RecurringRuleRow,
  type RuleOccurrence,
} from "@/services/recurring";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Quick-add templates (mobile's preset chips; the emoji it stores in the
 *  description is dropped - the web keeps descriptions as plain text). */
const PRESETS: { icon: typeof Home; nameKey: TranslationKey; amount: string; freq: RecurringFrequency }[] = [
  { icon: Home, nameKey: "recPresetRent", amount: "25000", freq: "monthly" },
  { icon: Wifi, nameKey: "recPresetWifi", amount: "1200", freq: "monthly" },
  { icon: Tv, nameKey: "recPresetNetflix", amount: "800", freq: "monthly" },
];

const INTERVAL_PRESETS = [7, 14, 28, 30];

/** Days between two ISO dates (calendar days, never negative-rounded). */
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function shiftISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Mobile Modal (transparent fade) as a web overlay; `end` = bottom sheet. */
function Sheet({
  open,
  onClose,
  align = "center",
  children,
}: {
  open: boolean;
  onClose: () => void;
  align?: "center" | "end";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{ backgroundColor: align === "center" ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.7)" }}
      className={`fixed inset-0 z-[90] flex justify-center p-5 ${
        align === "center" ? "items-center" : "items-end"
      }`}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex w-full justify-center">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Recurring plans with slot-based paid state (mobile recurring.tsx parity).
 *  `inject` is the /preview-recurring design seam: static rules/occurrences,
 *  no auth, no network, actions no-op without a user. */
export function RecurringRegister({
  inject,
}: {
  inject?: {
    rules: RecurringRuleRow[];
    occurrences: RuleOccurrence[];
    /** Preview-only: render the register as if the account's display currency
     *  were this, so the multi-currency conversion path is screenshot-able. */
    displayCurrency?: string;
  };
}) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const { categories } = useCategories(user?.id);

  const [rules, setRules] = useState<RecurringRuleRow[]>([]);
  // Booked installments for every rule - powers the paid state, DUE badges and
  // the timeline strips (one query, newest slot first).
  const [occurrences, setOccurrences] = useState<RuleOccurrence[]>([]);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail sheet + editor state (mobile names kept).
  const [selectedRule, setSelectedRule] = useState<RecurringRuleRow | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [intervalDays, setIntervalDays] = useState("28");
  const [ruleModeState, setRuleModeState] = useState<RecurringMode>("pay_on_due");
  const [nextDueDate, setNextDueDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  // Web addition (mobile always charges in the account currency): the plan's
  // own currency, seeded from the account and editable in the amount field.
  const [planCurrency, setPlanCurrency] = useState<CurrencyCode>(
    (profile?.preferred_currency as CurrencyCode) ?? "NPR",
  );
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const load = useCallback(async (): Promise<RecurringRuleRow[]> => {
    if (inject) {
      setRules(inject.rules);
      setOccurrences(inject.occurrences);
      setLoading(false);
      return inject.rules;
    }
    if (!user) {
      setLoading(false);
      return [];
    }
    // Auto-charge rules post themselves first (the mobile app does this at
    // login); pay_on_due rules wait for an explicit tap.
    await generateDueRecurringExpenses(supabase, user.id).catch(() => undefined);
    const nextRules = await listRecurringRules(supabase, user.id);
    setRules(nextRules);
    try {
      setOccurrences(await listRuleOccurrences(supabase, user.id, nextRules.map((r) => r.id)));
    } catch {
      // Paid-state decoration is optional; the rules list is authoritative.
    }
    setLoading(false);
    return nextRules;
  }, [user, supabase, inject]);

  useEffect(() => {
    void load().catch((error: unknown) =>
      showToast(error instanceof Error ? error.message : t("error"), "error"),
    );
  }, [load, showToast, t]);

  const preferredCurrency = inject?.displayCurrency ?? profile?.preferred_currency ?? "NPR";
  const money = useCallback(
    (n: number, currency?: string) => mask(formatMoney(n, (currency || preferredCurrency) as CurrencyCode, locale)),
    [mask, preferredCurrency, locale],
  );

  // Plans are forward-looking, so every figure on this screen prices at
  // today's rate through the app's shared converter (NPR peg + per-date
  // resolver included). A plan whose rate has not resolved yet keeps its own
  // currency label rather than wearing the display symbol over an unconverted
  // number.
  const planRows = useMemo<ConvertibleRow[]>(
    () =>
      rules.map((r) => ({
        amount: Number(r.amount) || 0,
        currency: r.currency || preferredCurrency,
        date: todayISO(),
        exchange_rate_to_usd: null,
      })),
    [rules, preferredCurrency],
  );
  const { convert, ready } = useRowConverter(preferredCurrency, planRows);

  /** A plan amount as a number, plus the currency it is honest to label it with. */
  const toDisplay = useCallback(
    (amountValue: number, ruleCurrency?: string | null) => {
      const native = ruleCurrency || preferredCurrency;
      if (native === preferredCurrency || !ready) {
        return { value: amountValue, currency: native };
      }
      const converted = convert({
        amount: amountValue,
        currency: native,
        date: todayISO(),
        exchange_rate_to_usd: null,
      });
      return converted === amountValue
        ? { value: amountValue, currency: native }
        : { value: converted, currency: preferredCurrency };
    },
    [convert, ready, preferredCurrency],
  );

  /** Displayed figure for a plan amount, with the native amount when they differ. */
  const planAmount = useCallback(
    (amountValue: number, ruleCurrency?: string | null) => {
      const priced = toDisplay(amountValue, ruleCurrency);
      const native = ruleCurrency || preferredCurrency;
      return {
        shown: money(priced.value, priced.currency),
        nativeText: priced.currency === native ? null : money(amountValue, native),
      };
    },
    [toDisplay, money, preferredCurrency],
  );

  /** Sum of the active plans' own amounts, priced in the display currency.
   *  Mobile amortises each cadence to a 30-day month here (a 28-day ₹350 plan
   *  reads as ₹375); dropped per user - the figure is the plain sum of what
   *  the plans actually charge, so the caption says "Total", not "Monthly". */
  const planTotal = useMemo((): { value: number; currency: CurrencyCode } => {
    // Plain sum of the active plans priced through the same live per-date
    // converter as every row and the sheet (docs/FEATURE-PARITY.md
    // 2026-09-15 – stored snapshots are never used for display; the old
    // snapshot leg also silently zeroed a plan with a null snapshot).
    // convert() already answers in the display currency, so no second leg.
    // While rates are unresolved a mixed-currency set keeps the honest USD
    // label rather than the display symbol over raw amounts.
    let total = 0;
    let hasForeign = false;
    for (const [i, rule] of rules.entries()) {
      if (!rule.is_active) continue;
      const row = planRows[i];
      if (row.currency !== preferredCurrency) hasForeign = true;
      total += convert(row);
    }
    if (!ready && hasForeign) return { value: total, currency: "USD" };
    return { value: total, currency: preferredCurrency as CurrencyCode };
  }, [rules, planRows, ready, convert, preferredCurrency]);

  const activeRules = rules.filter((r) => r.is_active);
  const activeCount = activeRules.length;
  const pausedCount = rules.length - activeCount;
  const dueCount = rules.filter((r) => ruleIsDue(r, occurrences)).length;

  // Next 30 days - active plans whose next slot lands inside the window,
  // soonest first (desktop summary column).
  const upcoming = useMemo(() => {
    const horizon = shiftISO(30);
    return rules
      .filter((r) => r.is_active && r.next_due_date <= horizon)
      .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
      .slice(0, 6);
  }, [rules]);

  /** Newest booked slot for a rule, if any. */
  const latestFor = (rule: RecurringRuleRow) => latestOccurrenceFor(occurrences, rule.id);

  const due = (rule: RecurringRuleRow) => ruleIsDue(rule, occurrences);

  /** "Paid Sep 12 · late 5d" proof line for the newest booked slot. */
  const paidLabelFor = (rule: RecurringRuleRow): string | null => {
    const latest = latestFor(rule);
    if (!latest?.recurring_due_date) return null;
    if (latest.recurring_due_date >= rule.next_due_date) return null; // current slot unpaid
    const late = daysBetween(latest.recurring_due_date, latest.date);
    const paid = formatShortDate(latest.date, locale);
    return late > 0
      ? `${t("recurring_paid_short")} ${paid} · ${t("recurring_late_days")} ${late}d`
      : `${t("recurring_paid_short")} ${paid} · ${t("recurring_on_time")}`;
  };

  const freqLabel = (rule: RecurringRuleRow) =>
    rule.frequency === "daily"
      ? t("recurring_freq_daily")
      : rule.frequency === "weekly"
        ? t("recurring_freq_weekly")
        : rule.frequency === "custom"
          ? `Every ${rule.interval_days ?? 30}d`
          : t("recurring_freq_monthly");

  const subtitleFor = (rule: RecurringRuleRow) => {
    const label = freqLabel(rule);
    if (!rule.is_active) return `${label} · ${t("recPaused")}`;
    const paid = paidLabelFor(rule);
    const next = formatShortDate(rule.next_due_date, locale);
    return paid
      ? `${label} · ${paid} · ${t("recNext")} ${next}`
      : `${label} · ${t("recNext")} ${next}`;
  };

  //  Editor open/close (mobile openCreateModal / openEditModal / closeFormModal)

  const openCreateModal = (preset?: { description: string; amount: string; freq: RecurringFrequency }) => {
    setSelectedRule(null);
    setEditingRuleId(null);
    setAmount(preset?.amount ?? "");
    setDescription(preset?.description ?? "");
    setFrequency(preset?.freq ?? "monthly");
    setIntervalDays("28");
    setRuleModeState("pay_on_due");
    setNextDueDate(todayISO());
    setPaymentMethod("Cash");
    setPlanCurrency(preferredCurrency as CurrencyCode);
    setCategoryId(
      (current) =>
        current || categories[0]?.id || rules.find((r) => r.categories)?.categories?.id || "",
    );
    setShowFormModal(true);
  };

  const openEditModal = (rule: RecurringRuleRow) => {
    setEditingRuleId(rule.id);
    setAmount(String(rule.amount));
    setDescription(rule.description || "");
    setCategoryId(rule.category_id);
    setFrequency(rule.frequency);
    setIntervalDays(String(rule.interval_days ?? 28));
    setRuleModeState(ruleMode(rule));
    setNextDueDate(rule.next_due_date);
    setPaymentMethod((rule.payment_method as PaymentMethod) || "Cash");
    setPlanCurrency((rule.currency as CurrencyCode) || (preferredCurrency as CurrencyCode));
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    setEditingRuleId(null);
    setAmount("");
    setDescription("");
  };

  const confirmDeleteRule = async () => {
    if (!deleteTargetId || !user) return;
    setDeletingRule(true);
    try {
      await deleteRecurringRule(supabase, user.id, deleteTargetId);
      setDeleteTargetId(null);
      setSelectedRule(null);
      closeFormModal();
      await load();
      showToast(t("bin_moved_toast"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setDeletingRule(false);
    }
  };

  const handleSaveRule = async () => {
    if (!user) return;
    const numeric = Number(amount);
    if (!amount || !numeric || numeric <= 0 || !categoryId) {
      showToast(t("amountRequired"), "error");
      return;
    }
    const interval = Number(intervalDays);
    if (frequency === "custom" && (!Number.isInteger(interval) || interval < 1 || interval > 365)) {
      showToast(t("recurring_interval_invalid"), "error");
      return;
    }
    setSaving(true);
    try {
      if (editingRuleId) {
        // If the cycle itself changed, re-derive the schedule from the CURRENT
        // due slot with the new cadence - the chain stays anchored to the plan,
        // never to "today".
        const existing = rules.find((r) => r.id === editingRuleId);
        const cycleChanged =
          !!existing &&
          (existing.frequency !== frequency ||
            (existing.interval_days ?? null) !== (frequency === "custom" ? interval : null));
        const resolvedNextDue =
          cycleChanged && existing
            ? advanceDueDate(existing.next_due_date, frequency, frequency === "custom" ? interval : null)
            : nextDueDate;
        await updateRecurringRule(
          supabase,
          editingRuleId,
          {
            categoryId,
            amount: numeric,
            currency: planCurrency,
            description: description.trim() || null,
            paymentMethod,
            frequency,
            intervalDays: frequency === "custom" ? interval : null,
            mode: ruleModeState,
            nextDueDate: resolvedNextDue,
          },
          user.id,
        );
      } else {
        await createRecurringRule(supabase, user.id, {
          categoryId,
          amount: numeric,
          currency: planCurrency,
          description: description.trim() || null,
          paymentMethod,
          frequency,
          intervalDays: frequency === "custom" ? interval : null,
          mode: ruleModeState,
          nextDueDate,
        });
      }
      closeFormModal();
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("error"), "error");
    } finally {
      setSaving(false);
    }
  };

  //  Payment actions (Mark Paid / Skip / Undo) - all through the shared
  //    service writes so phone, web and the generator can never double-book a
  //    slot (unique slot index).

  const runRuleAction = async (ruleId: string, action: "paid" | "skip" | "undo") => {
    if (!user) return;
    setBusyRuleId(ruleId);
    try {
      if (action === "paid") {
        const { lateDays } = await markOccurrencePaid(supabase, user.id, ruleId);
        notifyExpensesChanged();
        showToast(
          lateDays > 0
            ? `${t("recurring_marked_paid")} · ${t("recurring_late_days")} ${lateDays}d`
            : t("recurring_marked_paid"),
          "success",
        );
      } else if (action === "skip") {
        await skipCurrentOccurrence(supabase, user.id, ruleId);
        showToast(t("recurring_cycle_skipped"), "info");
      } else {
        const undone = await undoLatestOccurrencePayment(supabase, user.id, ruleId);
        if (!undone) {
          showToast(t("recurring_undo_not_recent"), "info");
        } else {
          notifyExpensesChanged();
          showToast(t("recurring_payment_undone"), "success");
        }
      }
      const nextRules = await load();
      // Keep the open detail sheet in sync with the freshly loaded rule.
      setSelectedRule((prev) => (prev ? nextRules.find((r) => r.id === ruleId) ?? null : null));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("error"), "error");
    } finally {
      setBusyRuleId(null);
    }
  };

  const toggleRuleActive = async (rule: RecurringRuleRow) => {
    if (!user) return;
    try {
      await updateRecurringRule(supabase, rule.id, { isActive: !rule.is_active }, user.id);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("error"), "error");
    }
  };

  const setQuickDate = (type: "today" | "tomorrow" | "first_next_month" | "fifteenth") => {
    const today = new Date();
    if (type === "today") setNextDueDate(todayISO());
    else if (type === "tomorrow") setNextDueDate(shiftISO(1));
    else if (type === "first_next_month") {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      setNextDueDate(toISODate(nextMonth));
    } else {
      const targetMonth = today.getDate() >= 15 ? today.getMonth() + 1 : today.getMonth();
      const targetYear = targetMonth > 11 ? today.getFullYear() + 1 : today.getFullYear();
      setNextDueDate(toISODate(new Date(targetYear, targetMonth % 12, 15)));
    }
  };

  /** Category picker options. The live flow takes them from the categories
   *  hook; the design-preview seam has no auth, so it falls back to the
   *  categories already joined onto the injected rules. */
  const categoryOptions = useMemo(() => {
    if (categories.length) return categories.map((c) => ({ value: c.id, label: c.name }));
    const seen = new Map<string, string>();
    for (const r of rules) if (r.categories) seen.set(r.categories.id, r.categories.name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [categories, rules]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1200px]">
        <Skeleton className="h-8 w-40" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <Skeleton className="h-[120px] w-full rounded-2xl" />
            <Skeleton className="h-[260px] w-full rounded-2xl" />
          </div>
          <div className="hidden min-w-0 space-y-4 lg:col-span-1 lg:block">
            <Skeleton className="h-[150px] w-full rounded-2xl" />
            <Skeleton className="h-[220px] w-full rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      {/* Page header - the shell topbar already carries the theme/avatar cluster */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
          {t("recurring")}
        </h1>
        <button
          type="button"
          onClick={() => openCreateModal()}
          className="hidden h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-strong active:scale-[0.98] lg:inline-flex"
        >
          <Plus size={16} aria-hidden />
          {t("recurring_add_new")}
        </button>
      </header>

      <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        {/* Summary column on desktop; on phones only the hero shows so the
            stacked flow stays: hero, then the register. */}
        <div className="min-w-0 space-y-4 lg:order-2">
          {/* Total commitment hero */}
          <section className="relative rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <span className="absolute right-4 top-4 z-10">
              <PrivacyEyeButton />
            </span>
            <p className="caps pr-12">{t("recTotalRecurring")}</p>
            <p className="figures-display mt-1 py-0.5 pr-12 text-[30px] leading-9 text-text">
              {money(planTotal.value, planTotal.currency)}
            </p>
            <p className="mt-1 text-[12.5px] text-text-muted">
              {(activeCount === 1 ? t("recAcrossOne") : t("recAcrossMany")).replace(
                "{count}",
                String(activeCount),
              )}
            </p>
          </section>

          {/* Status counts (desktop) */}
          <section className="hidden rounded-2xl border border-border bg-surface p-5 lg:block">
            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="min-w-0 pr-3">
                <p className="caps">{t("recActivePlans")}</p>
                <p className="figures-display mt-1 text-2xl text-text">{activeCount}</p>
              </div>
              <div className="min-w-0 px-3">
                <p className="caps">{t("recPausedPlans")}</p>
                <p className="figures-display mt-1 text-2xl text-text">{pausedCount}</p>
              </div>
              <div className="min-w-0 pl-3">
                <p className="caps">{t("recDueNow")}</p>
                <p className={`figures-display mt-1 text-2xl ${dueCount > 0 ? "text-danger" : "text-text"}`}>
                  {dueCount}
                </p>
              </div>
            </div>
          </section>

          {/* Next 30 days (desktop) */}
          <section className="hidden rounded-2xl border border-border bg-surface p-5 lg:block">
            <p className="caps">{t("recUpcoming30")}</p>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-xs text-text-muted">{t("recNothingUpcoming")}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((rule) => {
                  const Glyph = categoryGlyph(rule.categories?.icon);
                  const priced = planAmount(Number(rule.amount) || 0, rule.currency);
                  return (
                    <li key={rule.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-elevated text-primary">
                          <Glyph size={15} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-text">
                            {rule.description || rule.categories?.name || t("recSubscription")}
                          </span>
                          <span className="block text-[11px] text-faint">
                            {t("recNext")} {formatShortDate(rule.next_due_date, locale)}
                          </span>
                        </span>
                      </span>
                      <span className="figures shrink-0 text-[13px] text-text">{priced.shown}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Register column */}
        <div className="mt-4 min-w-0 lg:order-1 lg:col-span-2 lg:mt-0">
          {rules.length === 0 ? (
            <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
              <Sparkles size={32} className="text-primary" aria-hidden />
              <h2 className="text-base font-bold text-text">{t("recurring_no_rules_title")}</h2>
              <p className="max-w-sm text-[13px] leading-[18px] text-text-muted">
                {t("recurring_no_rules_message")}
              </p>

              <div className="mt-1 w-full space-y-2">
                <p className="text-[12px] font-semibold text-text-muted">{t("recurring_quick_add")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    const label = t(preset.nameKey);
                    return (
                      <button
                        key={preset.nameKey}
                        type="button"
                        onClick={() =>
                          openCreateModal({ description: label, amount: preset.amount, freq: preset.freq })
                        }
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-faint active:scale-[0.97]"
                      >
                        <Icon size={14} className="text-primary" aria-hidden />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
              {rules.map((rule, idx) => {
                const Glyph = categoryGlyph(rule.categories?.icon);
                const isDue = due(rule);
                const priced = planAmount(Number(rule.amount) || 0, rule.currency);
                return (
                  <div key={rule.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRule(rule)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-elevated/50 ${
                        rule.is_active ? "" : "opacity-60"
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3.5">
                        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg bg-surface-elevated text-primary">
                          <Glyph size={20} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-text">
                            {rule.description || rule.categories?.name || t("recSubscription")}
                          </span>
                          <span className="block text-xs leading-4 text-text-muted line-clamp-2">{subtitleFor(rule)}</span>
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="figures max-w-[140px] truncate text-[15px] text-text">
                          {priced.shown}
                        </span>
                        {priced.nativeText ? (
                          <span className="numeric text-[10px] font-semibold text-faint">
                            {priced.nativeText}
                          </span>
                        ) : null}
                        {isDue ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-rust-tint px-2 py-0.5 text-[10px] font-bold text-danger">
                            <AlertCircle size={10} className="shrink-0" aria-hidden />
                            {t("recurring_due_badge")}
                          </span>
                        ) : (
                          <span
                            className={`rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold ${
                              rule.is_active
                                ? "border-primary/50 text-primary"
                                : "border-border text-text-muted"
                            }`}
                          >
                            {rule.is_active ? t("recActive") : t("recPaused")}
                          </span>
                        )}
                      </span>
                    </button>
                    {idx < rules.length - 1 && <div className="mx-4 border-b border-border" aria-hidden />}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>

      {/*  4. SUBSCRIPTION DETAILS SHEET  */}
      <Sheet open={!!selectedRule} onClose={() => setSelectedRule(null)}>
        {selectedRule ? (
          <DetailSheet
            rule={selectedRule}
            occurrences={occurrences}
            busy={busyRuleId === selectedRule.id}
            planAmount={planAmount}
            onClose={() => setSelectedRule(null)}
            onUndo={() => void runRuleAction(selectedRule.id, "undo")}
            onAction={(a) => void runRuleAction(selectedRule.id, a)}
            onToggleActive={() => {
              const next = { ...selectedRule, is_active: !selectedRule.is_active };
              setSelectedRule(next);
              void toggleRuleActive(selectedRule);
            }}
            onEdit={() => {
              const ruleToEdit = selectedRule;
              setSelectedRule(null);
              openEditModal(ruleToEdit);
            }}
          />
        ) : null}
      </Sheet>

      {/*  5. BILL FORM SHEET (CREATE / EDIT)  */}
      <Sheet open={showFormModal} onClose={closeFormModal} align="end">
        <BillFormSheet
          editing={!!editingRuleId}
          amount={amount}
          setAmount={setAmount}
          description={description}
          setDescription={setDescription}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          categoryOptions={categoryOptions}
          frequency={frequency}
          setFrequency={setFrequency}
          intervalDays={intervalDays}
          setIntervalDays={setIntervalDays}
          ruleMode={ruleModeState}
          setRuleMode={setRuleModeState}
          nextDueDate={nextDueDate}
          setNextDueDate={setNextDueDate}
          setQuickDate={setQuickDate}
          openCalendar={() => setCalendarOpen(true)}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          currency={planCurrency}
          setCurrency={setPlanCurrency}
          saving={saving}
          onSave={() => void handleSaveRule()}
          onDelete={() => editingRuleId && setDeleteTargetId(editingRuleId)}
          onClose={closeFormModal}
        />
      </Sheet>

      {/* Calendar picker (mobile single-tap mode) */}
      <CalendarModal
        open={calendarOpen}
        mode="single"
        onClose={() => setCalendarOpen(false)}
        initial={{ from: nextDueDate, to: nextDueDate }}
        onApply={(range) => {
          if (range.from) setNextDueDate(range.from);
        }}
      />

      {/* Designed delete confirmation */}
      <ConfirmDialog
        open={deleteTargetId !== null}
        title={t("delete")}
        body={t("bin_move_plan_message")}
        confirmLabel={deletingRule ? t("recDeleting") : t("delete")}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => void confirmDeleteRule()}
      />

      {/* Floating action button (phones; desktop uses the header button) */}
      <button
        type="button"
        onClick={() => openCreateModal()}
        aria-label={t("recurring_add_new")}
        className="fixed right-5 z-40 grid h-14 w-14 place-items-center rounded-lg bg-primary text-primary-ink shadow-soft transition active:scale-[0.94] hover:bg-primary-strong bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-6 md:right-6 lg:hidden"
      >
        <Plus size={26} strokeWidth={2.5} aria-hidden />
      </button>
    </main>
  );
}

/** The centered subscription sheet: amount banner, payment state, timeline,
 *  detail tiles and the Close / Edit pair (mobile section 4). */
function DetailSheet({
  rule,
  occurrences,
  busy,
  planAmount,
  onClose,
  onUndo,
  onAction,
  onToggleActive,
  onEdit,
}: {
  rule: RecurringRuleRow;
  occurrences: RuleOccurrence[];
  busy: boolean;
  planAmount: (n: number, currency?: string | null) => { shown: string; nativeText: string | null };
  onClose: () => void;
  onUndo: () => void;
  onAction: (action: "paid" | "skip") => void;
  onToggleActive: () => void;
  onEdit: () => void;
}) {
  const { t, locale } = useLanguage();
  const Glyph = categoryGlyph(rule.categories?.icon);

  const ruleOccurrences = occurrences.filter((o) => o.recurring_rule_id === rule.id).slice(0, 4);
  const isDue = ruleIsDue(rule, occurrences);
  const latest = latestOccurrenceFor(occurrences, rule.id);
  // Undo is offered only while the chain sits exactly one cycle past the newest
  // booking - older history stays booked.
  const latestSlot = latest?.recurring_due_date ?? null;
  const canUndo =
    !!latestSlot && advanceDueDate(latestSlot, rule.frequency, rule.interval_days) === rule.next_due_date;
  const overdueDays = isDue ? Math.max(0, daysBetween(rule.next_due_date, todayISO())) : 0;
  const futureSlots = [0, 1].map((i) => {
    let d = rule.next_due_date;
    for (let k = 0; k <= i; k++) d = advanceDueDate(d, rule.frequency, rule.interval_days);
    return d;
  });

  const paid = (() => {
    if (!latest?.recurring_due_date) return null;
    if (latest.recurring_due_date >= rule.next_due_date) return null; // current slot unpaid
    const late = daysBetween(latest.recurring_due_date, latest.date);
    const paidDate = formatShortDate(latest.date, locale);
    return late > 0
      ? `${t("recurring_paid_short")} ${paidDate} · ${t("recurring_late_days")} ${late}d`
      : `${t("recurring_paid_short")} ${paidDate} · ${t("recurring_on_time")}`;
  })();
  const freqText =
    rule.frequency === "custom"
      ? `Every ${rule.interval_days ?? 30}d`
      : rule.frequency === "daily"
        ? t("recurring_freq_daily")
        : rule.frequency === "weekly"
          ? t("recurring_freq_weekly")
          : t("recurring_freq_monthly");
  const mode = ruleMode(rule);
  const priced = planAmount(Number(rule.amount) || 0, rule.currency);

  return (
    <div className="mx-auto w-full max-w-[400px] space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      {/* Header: icon + title + close */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-lg bg-surface-elevated text-primary">
            <Glyph size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-text">
              {rule.description || rule.categories?.name || t("recSubscription")}
            </p>
            <p className="truncate text-xs text-text-muted">
              {rule.categories?.name || t("recurring")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-elevated text-text transition hover:text-text-muted active:opacity-70"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Amount banner */}
      <div className="space-y-1 rounded-xl bg-surface-elevated px-4 py-3.5 text-center">
        <p className="caps">{t("recRecurringAmount")}</p>
        <p className="figures-display text-[28px] leading-9 text-text">{priced.shown}</p>
        {priced.nativeText ? (
          <p className="numeric text-[11px] font-semibold text-faint">
            {t("recInNative")} {priced.nativeText}
          </p>
        ) : null}
      </div>

      {/* Payment state: due card / paid proof / timeline / actions */}
      <div className="space-y-2.5">
        {isDue ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-rust-tint p-3">
            <AlertCircle size={20} className="shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-danger">
                {overdueDays > 0
                  ? `${t("recurring_overdue")} ${overdueDays}d · ${t("recurring_payment_due")}`
                  : t("recPaymentDueTitle")}
              </p>
              <p className="text-[11.5px] text-text-muted">
                {priced.shown} · {t("recurring_slot_due")} {rule.next_due_date}
              </p>
            </div>
          </div>
        ) : paid ? (
          <div className="flex items-center gap-2 rounded-xl border border-income/25 bg-income/10 p-3">
            <CheckCircle2 size={18} className="shrink-0 text-income" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-income">{paid}</p>
            {canUndo ? (
              <button
                type="button"
                onClick={onUndo}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-text-muted transition hover:text-text active:opacity-70 disabled:opacity-50"
              >
                <RotateCcw size={11} aria-hidden />
                {t("recurring_not_paid_undo")}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Payment timeline strip: booked slots, current slot, 2 upcoming */}
        <div className="flex flex-wrap gap-1.5">
          {ruleOccurrences.map((o) => {
            const slot = o.recurring_due_date ?? o.date;
            const late = daysBetween(slot, o.date);
            return (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-full border border-income/25 bg-income/10 px-2 py-1"
              >
                <Check size={10} strokeWidth={3} className="text-income" aria-hidden />
                <span className="numeric text-[10.5px] font-semibold text-text">
                  {formatShortDate(o.date, locale)}
                  {late > 0 ? ` (+${late})` : ""}
                </span>
              </span>
            );
          })}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-semibold ${
              isDue
                ? "border-danger/30 bg-rust-tint text-danger"
                : "border-border bg-surface-elevated text-text-muted"
            }`}
          >
            <Circle size={9} aria-hidden />
            {rule.next_due_date} {isDue ? t("recurring_pending_badge") : t("recurring_next_badge")}
          </span>
          {futureSlots.map((d) => (
            <span
              key={d}
              className="rounded-full border border-dashed border-border px-2 py-1 text-[10.5px] font-medium text-text-muted"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Payment actions for the open slot */}
        {isDue && rule.is_active ? (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onAction("paid")}
              disabled={busy}
              className="flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-income text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              <CheckCircle2 size={17} aria-hidden />
              {t("recurring_mark_paid")}
            </button>
            <button
              type="button"
              onClick={() => onAction("skip")}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-surface-elevated text-[13px] font-semibold text-text-muted transition hover:text-text active:opacity-70 disabled:opacity-60"
            >
              {t("recurring_skip_cycle")}
            </button>
          </div>
        ) : null}
      </div>

      {/* Detail tiles */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-[13px] font-semibold text-text-muted">{t("recStatus")}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold ${
                rule.is_active ? "border-primary/50 text-primary" : "border-border text-text-muted"
              }`}
            >
              {rule.is_active ? t("recActive") : t("recPaused")}
            </span>
            <button
              type="button"
              onClick={onToggleActive}
              className={`inline-flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-[11px] font-semibold transition active:opacity-70 ${
                rule.is_active ? "text-text-muted hover:text-text" : "text-primary"
              }`}
            >
              {rule.is_active ? <Pause size={11} aria-hidden /> : <Play size={11} aria-hidden />}
              {rule.is_active ? t("recPause") : t("recResume")}
            </button>
          </span>
        </div>

        <TileRow label={t("recBillingFrequency")} value={freqText} capitalize />
        <TileRow label={t("recurring_next_due")} value={rule.next_due_date || "-"} />
        <TileRow label={t("paymentChannel")} value={rule.payment_method || "Cash"} />
        <TileRow
          label={t("recurring_billing_mode")}
          value={mode === "auto_charge" ? t("recurring_mode_auto") : t("recurring_mode_reminder")}
        />
      </div>

      {/* Close & Edit */}
      <div className="flex gap-2.5 pt-1.5">
        <button
          type="button"
          onClick={onClose}
          className="h-11 flex-1 rounded-lg border border-border bg-surface-elevated text-sm font-semibold text-text transition hover:border-faint active:opacity-70"
        >
          {t("close")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-11 flex-[1.3] items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-ink transition hover:bg-primary-strong active:scale-[0.98]"
        >
          <Pencil size={15} aria-hidden />
          {t("recEdit")}
        </button>
      </div>
    </div>
  );
}

function TileRow({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <>
      <div className="border-b border-border" aria-hidden />
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="text-[13px] font-medium text-text-muted">{label}</span>
        <span className={`text-[13px] font-semibold text-text ${capitalize ? "capitalize" : ""}`}>
          {value}
        </span>
      </div>
    </>
  );
}

/** The bottom-sheet create/edit form (mobile section 5). */
function BillFormSheet(props: {
  editing: boolean;
  amount: string;
  setAmount: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  categoryOptions: { value: string; label: string }[];
  frequency: RecurringFrequency;
  setFrequency: (v: RecurringFrequency) => void;
  intervalDays: string;
  setIntervalDays: (v: string) => void;
  ruleMode: RecurringMode;
  setRuleMode: (v: RecurringMode) => void;
  nextDueDate: string;
  setNextDueDate: (v: string) => void;
  setQuickDate: (t: "today" | "tomorrow" | "first_next_month" | "fifteenth") => void;
  openCalendar: () => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (v: PaymentMethod) => void;
  currency: CurrencyCode;
  setCurrency: (v: CurrencyCode) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const frequencies: { label: string; value: RecurringFrequency }[] = [
    { label: t("recurring_freq_daily"), value: "daily" },
    { label: t("recurring_freq_weekly"), value: "weekly" },
    { label: t("recurring_freq_monthly"), value: "monthly" },
    { label: t("recurring_freq_every_n_days"), value: "custom" },
  ];
  const modes: { key: RecurringMode; label: string; sub: string; Icon: typeof Bell }[] = [
    {
      key: "pay_on_due",
      label: t("recurring_mode_reminder"),
      sub: t("recurring_mode_reminder_sub"),
      Icon: Bell,
    },
    { key: "auto_charge", label: t("recurring_mode_auto"), sub: t("recurring_mode_auto_sub"), Icon: Zap },
  ];

  return (
    <div className="mx-auto flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-soft">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--sf-primary-light)] text-primary">
              <CalendarClock size={20} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-text">
                {props.editing ? t("recEditBillTitle") : t("recurring_add_new")}
              </p>
              <p className="truncate text-xs text-text-muted">
                {props.editing ? t("recEditBillSub") : t("recAddBillSub")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {props.editing ? (
              <button
                type="button"
                onClick={props.onDelete}
                aria-label={t("delete")}
                className="grid h-9 w-9 place-items-center rounded-lg border border-danger/40 bg-rust-tint text-danger transition hover:opacity-80 active:opacity-70"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={props.onClose}
              aria-label={t("close")}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-text transition hover:border-faint active:opacity-70"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-10">
        {/* Amount hero */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-text-muted">{t("recurring_amount")}</p>
          <div className="flex h-[52px] items-center gap-2 rounded-lg border-[1.5px] border-primary bg-surface-elevated px-3.5">
            <span className="figures shrink-0 text-[16px] text-primary">
              {CURRENCY_DETAILS[props.currency]?.symbol ?? props.currency}
            </span>
            <input
              type="text"
              inputMode="decimal"
              aria-label={t("recurring_amount")}
              placeholder="0.00"
              value={props.amount}
              onChange={(e) => props.setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="figures-display min-w-0 flex-1 bg-transparent text-[20px] text-text outline-none placeholder:font-medium placeholder:text-text-muted"
            />
            {props.amount ? (
              <button
                type="button"
                onClick={() => props.setAmount("")}
                aria-label={t("clear")}
                className="shrink-0 text-text-muted transition hover:text-text active:opacity-70"
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
            {/* Which currency this plan charges in. Mobile fixes this to the
                account currency; the web lets a plan live in its own. */}
            <label className="relative flex shrink-0 items-center rounded-lg border border-primary/40 bg-surface px-2.5 py-1">
              <span className="sr-only">{t("currency")}</span>
              <select
                value={props.currency}
                onChange={(e) => props.setCurrency(e.target.value as CurrencyCode)}
                className="appearance-none bg-transparent pr-4 text-[13px] font-bold text-primary outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-primary"
              />
            </label>
          </div>
        </div>

        <Input
          label={t("recurring_description")}
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          placeholder={t("recDescPlaceholder")}
          maxLength={200}
        />

        <Select
          label={t("recurring_category")}
          value={props.categoryId}
          onChange={(e) => props.setCategoryId(e.target.value)}
        >
          {props.categoryOptions.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>

        {/* Frequency */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-text-muted">{t("recurring_frequency")}</p>
          <div className="grid grid-cols-4 gap-2">
            {frequencies.map((item) => {
              const active = props.frequency === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => props.setFrequency(item.value)}
                  className={`rounded-lg border py-2.5 text-center text-[13px] transition active:scale-[0.97] ${
                    active
                      ? "border-primary bg-[var(--sf-primary-light)] font-semibold text-primary-strong"
                      : "border-border bg-surface-elevated font-medium text-text hover:border-faint"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom cycle length */}
        {props.frequency === "custom" ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-text-muted">{t("recurring_interval_days")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-11 w-[110px] items-center rounded-lg border-[1.5px] border-primary bg-surface-elevated px-3.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  aria-label={t("recurring_interval_days")}
                  value={props.intervalDays}
                  onChange={(e) =>
                    props.setIntervalDays(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))
                  }
                  className="figures min-w-0 flex-1 bg-transparent text-[17px] text-text outline-none"
                />
              </div>
              {INTERVAL_PRESETS.map((preset) => {
                const active = props.intervalDays === String(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => props.setIntervalDays(String(preset))}
                    className={`rounded-lg border px-3 py-2 text-xs transition active:scale-[0.97] ${
                      active
                        ? "border-primary bg-[var(--sf-primary-light)] font-semibold text-primary-strong"
                        : "border-border bg-surface-elevated font-medium text-text hover:border-faint"
                    }`}
                  >
                    {preset}d
                  </button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-text-muted">{t("recurring_interval_hint")}</p>
          </div>
        ) : null}

        {/* Billing mode */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-text-muted">{t("recurring_billing_mode")}</p>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((m) => {
              const active = props.ruleMode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => props.setRuleMode(m.key)}
                  className={`space-y-[3px] rounded-lg border p-3 text-left transition active:scale-[0.98] ${
                    active
                      ? "border-primary bg-[var(--sf-primary-light)]"
                      : "border-border bg-surface-elevated hover:border-faint"
                  }`}
                >
                  <span
                    className={`flex items-center gap-1 text-[13px] font-semibold ${
                      active ? "text-primary-strong" : "text-text"
                    }`}
                  >
                    <m.Icon size={13} aria-hidden />
                    {m.label}
                  </span>
                  <span className="block text-[10.5px] text-text-muted">{m.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Next due + quick presets */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-muted">{t("recurring_next_due")}</p>
          <button
            type="button"
            onClick={props.openCalendar}
            className="flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3.5 transition-colors hover:border-faint"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarDays size={18} className="shrink-0 text-primary" aria-hidden />
              <span className="numeric truncate text-[15px] font-semibold text-text">{props.nextDueDate}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary">{t("recChooseDate")}</span>
          </button>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["today", t("today")],
                ["tomorrow", t("recTomorrow")],
                ["first_next_month", t("recFirstNextMonth")],
                ["fifteenth", t("recFifteenth")],
              ] as const
            ).map(([key, label]) => {
              const active = key === "today" && props.nextDueDate === todayISO();
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => props.setQuickDate(key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition active:scale-[0.97] ${
                    active
                      ? "border-primary bg-[var(--sf-primary-light)] font-semibold text-primary-strong"
                      : "border-border bg-surface-elevated font-medium text-text hover:border-faint"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment channel */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-text-muted">{t("paymentChannel")}</p>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((method) => {
              const active = props.paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => props.setPaymentMethod(method)}
                  className={`rounded-lg border py-2.5 text-center text-xs transition active:scale-[0.97] ${
                    active
                      ? "border-primary bg-[var(--sf-primary-light)] font-semibold text-primary-strong"
                      : "border-border bg-surface-elevated font-medium text-text hover:border-faint"
                  }`}
                >
                  {method}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {props.editing ? (
          <div className="flex items-center gap-2.5 pt-1.5">
            <button
              type="button"
              onClick={props.onDelete}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/40 bg-rust-tint text-sm font-semibold text-danger transition hover:opacity-80 active:scale-[0.98]"
            >
              <Trash2 size={16} aria-hidden />
              {t("delete")}
            </button>
            <MobileButton
              type="button"
              loading={props.saving}
              onClick={props.onSave}
              className="h-12 flex-[1.8] text-sm font-semibold"
            >
              {t("recSaveChanges")}
            </MobileButton>
          </div>
        ) : (
          <MobileButton
            type="button"
            loading={props.saving}
            onClick={props.onSave}
            className="mt-1.5 h-12 w-full text-sm font-semibold"
          >
            {t("recurring_save")}
          </MobileButton>
        )}
      </div>
    </div>
  );
}
