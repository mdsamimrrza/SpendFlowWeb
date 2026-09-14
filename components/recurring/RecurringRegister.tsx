"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, todayISO } from "@/utils/format";
import { useRowConverter } from "@/hooks/useRates";
import { SlideOver } from "@/components/ui/SlideOver";
import { categoryGlyph } from "@/components/ui/Glyph";
import { notifyExpensesChanged, useCategories } from "@/hooks/useExpenses";
import {
  createRecurringRule,
  deleteRecurringRule,
  generateDueRecurringExpenses,
  latestOccurrenceFor,
  listRecurringRules,
  listRuleOccurrences,
  markOccurrencePaid,
  nextDueDate as advanceDueDate,
  nextOccurrences,
  ruleIsDue,
  ruleMode,
  skipCurrentOccurrence,
  undoLatestOccurrencePayment,
  updateRecurringRule,
  type RecurringFrequency,
  type RecurringMode,
  type RecurringRuleInput,
  type RecurringRuleRow,
  type RuleOccurrence,
} from "@/services/recurring";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { CURRENCIES, CURRENCY_DETAILS, PAYMENT_METHODS, type CurrencyCode, type PaymentMethod } from "@/constants/app";
import { FitText } from "@/components/ui/FitText";
import { CadenceOverview } from "@/components/recurring/CadenceOverview";
import { UpcomingTimeline } from "@/components/recurring/UpcomingTimeline";
import { PlanCard } from "@/components/recurring/PlanCard";

/** Cycle label for a rule (Daily / Weekly / Monthly / Every Nd). */
function freqLabel(rule: { frequency: RecurringFrequency; interval_days?: number | null }): string {
  if (rule.frequency === "daily") return "Daily";
  if (rule.frequency === "weekly") return "Weekly";
  if (rule.frequency === "custom") return `Every ${rule.interval_days ?? 30}d`;
  return "Monthly";
}

/** Register — recurring plans with slot-based paid state (mobile recurring.tsx parity).
 *  `inject` is the /preview-recurring design seam: static rules/occurrences,
 *  no auth, no network, actions no-op without a user. */
export function RecurringRegister({
  inject,
}: {
  inject?: { rules: RecurringRuleRow[]; occurrences: RuleOccurrence[] };
}) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { mask } = usePrivacy();
  const supabase = getSupabaseBrowserClient();
  const { categories } = useCategories(user?.id);

  const [rules, setRules] = useState<RecurringRuleRow[]>([]);
  // Booked installments for every rule — powers paid state, DUE badges, undo.
  const [occurrences, setOccurrences] = useState<RuleOccurrence[]>([]);
  const [detail, setDetail] = useState<RecurringRuleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRuleRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringRuleRow | null>(null);
  const [saving, setSaving] = useState(false);

  // The register heading promises due-date order — enforce it client-side too
  // (the server query already sorts; the preview seam must match).
  const setRulesByDue = useCallback((rs: RecurringRuleRow[]) => {
    setRules([...rs].sort((a, b) => (a.next_due_date < b.next_due_date ? -1 : a.next_due_date > b.next_due_date ? 1 : 0)));
  }, []);

  const load = useCallback(async () => {
    // Design-preview seam: static register, no auth, no writes.
    if (inject) {
      setRulesByDue(inject.rules);
      setOccurrences(inject.occurrences);
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      // Auto-charge rules post themselves first (mobile parity); pay_on_due
      // rules wait for an explicit tap and only ever show a due badge.
      await generateDueRecurringExpenses(supabase, user.id);
      const rs = await listRecurringRules(supabase, user.id);
      setRulesByDue(rs);
      try {
        setOccurrences(await listRuleOccurrences(supabase, user.id, rs.map((r) => r.id)));
      } catch {
        // Paid-state decoration is optional; the rules list is authoritative.
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setLoading(false);
    }
  }, [user, supabase, showToast, t, inject, setRulesByDue]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));
  const { convert } = useRowConverter(displayCurrency, occurrences);

  const paidBy = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const o of occurrences) {
      if (!o.recurring_rule_id) continue;
      const s = m.get(o.recurring_rule_id) ?? { count: 0, total: 0 };
      s.count += 1;
      s.total += convert(o);
      m.set(o.recurring_rule_id, s);
    }
    return m;
  }, [occurrences, convert]);

  const dShort = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(`${iso}T00:00:00`),
    );

  /** "Paid Sep 12 · late 5d" proof line for the newest booked slot (mobile paidLabelFor). */
  const paidLabelFor = (rule: RecurringRuleRow): { text: string; canUndo: boolean } | null => {
    const latest = latestOccurrenceFor(occurrences, rule.id);
    if (!latest?.recurring_due_date) return null;
    if (latest.recurring_due_date >= rule.next_due_date) return null; // current slot unpaid
    const late = Math.max(
      0,
      Math.round(
        (new Date(`${latest.date}T00:00:00`).getTime() -
          new Date(`${latest.recurring_due_date}T00:00:00`).getTime()) /
          86_400_000,
      ),
    );
    // Undoable only while the chain sits exactly one cycle past this slot.
    const canUndo =
      advanceDueDate(latest.recurring_due_date, rule.frequency, rule.interval_days) ===
      rule.next_due_date;
    const paid = `✓ ${t("recurring_paid_short")} ${dShort(latest.date)}`;
    const tail =
      late > 0
        ? ` · ${t("recurring_late_days")} ${late}d`
        : ` · ${t("recurring_on_time")}`;
    return { text: paid + tail, canUndo };
  };

  // ── Payment actions — all through the shared service writes so phone, web
  //    and the generator can never double-book a slot (unique slot index). ──
  const runRuleAction = async (ruleId: string, action: "paid" | "skip" | "undo") => {
    if (!user) return;
    setBusyRuleId(ruleId);
    try {
      if (action === "paid") {
        const { lateDays } = await markOccurrencePaid(supabase, user.id, ruleId);
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
          showToast(t("recurring_payment_undone"), "success");
        }
      }
      notifyExpensesChanged();
      const rs = await listRecurringRules(supabase, user.id);
      setRulesByDue(rs);
      setOccurrences(await listRuleOccurrences(supabase, user.id, rs.map((r) => r.id)).catch(() => occurrences));
      // Keep the open detail sheet in sync with the freshly loaded rule.
      setDetail((prev) => (prev ? rs.find((r) => r.id === ruleId) ?? null : null));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setBusyRuleId(null);
    }
  };

  const onSave = async (input: RecurringRuleInput) => {
    if (!user) return;
    setSaving(true);
    try {
      if (editing) {
        // If the cycle itself changed, re-derive the schedule from the CURRENT
        // due slot with the new cadence — the chain stays anchored to the plan,
        // never to "today" (mobile handleSaveRule parity).
        const cycleChanged =
          editing.frequency !== input.frequency ||
          (editing.interval_days ?? null) !==
            (input.frequency === "custom" ? input.intervalDays ?? null : null);
        const resolved = cycleChanged
          ? advanceDueDate(editing.next_due_date, input.frequency, input.intervalDays)
          : input.nextDueDate;
        await updateRecurringRule(
          supabase,
          editing.id,
          {
            categoryId: input.categoryId,
            amount: input.amount,
            currency: input.currency,
            description: input.description,
            paymentMethod: input.paymentMethod,
            frequency: input.frequency,
            intervalDays: input.intervalDays,
            mode: input.mode,
            nextDueDate: resolved,
            isActive: input.isActive,
          },
          user.id,
        );
      } else {
        await createRecurringRule(supabase, user.id, input);
      }
      setEditorOpen(false);
      setEditing(null);
      showToast(t("saved"), "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (rule: RecurringRuleRow) => {
    if (!user) return;
    try {
      await updateRecurringRule(supabase, rule.id, { isActive: !rule.is_active }, user.id);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  const onDelete = async () => {
    if (!confirmDelete || !user) return;
    try {
      await deleteRecurringRule(supabase, user.id, confirmDelete.id);
      setConfirmDelete(null);
      showToast(t("bin_moved_toast"), "success");
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
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">
            {t("recurring")}
          </h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
          <Plus size={14} /> New rule
        </Button>
      </header>

      {/* Cadence overview — commitment account + mix donut */}
      <div className="mb-4">
        <CadenceOverview
          rules={rules}
          occurrences={occurrences}
          formatted={fmt}
          locale={locale}
          labels={{
            commitment: t("recCommitment"),
            yearly: t("recPerYear"),
            active: t("recActivePlans"),
            paused: t("recPausedPlans"),
            dueNow: t("recDueNow"),
            mix: t("recMix"),
            perMonth: t("recPerMonth"),
            noPlans: t("recNoPlansYet"),
            manage: t("open"),
            weeklyApprox: t("recWeeklyApprox"),
            dailyApprox: t("recDailyApprox"),
          }}
        />
      </div>

      {!loading && rules.length > 0 && (
        <div className="mb-4">
          <UpcomingTimeline
            rules={rules}
            locale={locale}
            onOpenRule={(r) => setDetail(r)}
            labels={{
              title: t("recUpcoming30"),
              empty: t("recNothingUpcoming"),
              today: t("today"),
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No recurring plans"
          message="Add rent, subscriptions and bills once — a due card appears on the plan date, and money is only recorded when you tap Mark Paid."
          action={
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus size={14} /> New rule
            </Button>
          }
        />
      ) : (
        <Panel label={t("recPlansByDue")}>
          <div>
            {rules.map((rule) => {
              const paid = paidBy.get(rule.id);
              const due = ruleIsDue(rule, occurrences);
              const proof = paidLabelFor(rule);
              const overdueDays = due
                ? Math.max(
                    0,
                    Math.round(
                      (new Date(`${todayISO()}T00:00:00`).getTime() -
                        new Date(`${rule.next_due_date}T00:00:00`).getTime()) /
                        86_400_000,
                    ),
                  )
                : 0;
              const dueInDays = !due
                ? Math.max(
                    0,
                    Math.round(
                      (new Date(`${rule.next_due_date}T00:00:00`).getTime() -
                        new Date(`${todayISO()}T00:00:00`).getTime()) /
                        86_400_000,
                    ),
                  )
                : null;
              return (
                <PlanCard
                  key={rule.id}
                  rule={rule}
                  occurrences={occurrences}
                  amount={`${CURRENCY_DETAILS[rule.currency as CurrencyCode]?.symbol ?? ""}${fmt(rule.amount).replace(/^[^\d]*/, "")}`}
                  cadence={
                    rule.frequency === "daily"
                      ? "/day"
                      : rule.frequency === "weekly"
                        ? "/week"
                        : rule.frequency === "custom"
                          ? `/${rule.interval_days ?? 30}d`
                          : "/mo"
                  }
                  freqText={freqLabel(rule)}
                  nextDueShort={`${t("recurring_next_due_short")} ${dShort(rule.next_due_date)}${
                    paid ? ` · ${paid.count} ${t("recPostedWord")} ${fmt(paid.total)}` : ""
                  }`}
                  paidNote={proof ? proof.text : null}
                  due={due}
                  dueLabel={t("recurring_due_badge")}
                  overdueDays={overdueDays}
                  dueInDays={dueInDays}
                  labels={{
                    overdue: t("recurring_overdue"),
                    dueToday: t("recurring_due_today"),
                    inDays: t("recInDays"),
                    active: t("recActiveShort"),
                    paused: t("recPausedShort"),
                    edit: t("recEditPlan"),
                    del: t("delete"),
                  }}
                  onOpen={() => setDetail(rule)}
                  onToggle={() => void onToggle(rule)}
                  onEdit={() => {
                    setEditing(rule);
                    setEditorOpen(true);
                  }}
                  onDelete={() => setConfirmDelete(rule)}
                />
              );
            })}
          </div>
        </Panel>
      )}

      <RuleEditor
        open={editorOpen}
        rule={editing}
        categories={categories
          .filter((c) => c.type === "expense")
          .map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }))}
        defaultCurrency={displayCurrency}
        saving={saving}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={onSave}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title={t("delete")}
        body={t("bin_move_plan_message")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <RuleDetailSheet
        rule={detail}
        occurrences={occurrences}
        convert={convert}
        displayCurrency={displayCurrency}
        busyRuleId={busyRuleId}
        onClose={() => setDetail(null)}
        onToggle={onToggle}
        onAction={(id, action) => void runRuleAction(id, action)}
        onEdit={(r) => { setDetail(null); setEditing(r); setEditorOpen(true); }}
        onDelete={(r) => { setDetail(null); setConfirmDelete(r); }}
      />
    </main>
  );
}

/** Rule record sheet — payment state (due card / proof / timeline) + register. */
function RuleDetailSheet({
  rule,
  occurrences,
  convert,
  displayCurrency,
  busyRuleId,
  onClose,
  onToggle,
  onAction,
  onEdit,
  onDelete,
}: {
  rule: RecurringRuleRow | null;
  occurrences: RuleOccurrence[];
  convert: (r: { amount: number; currency: string; date: string; exchange_rate_to_usd: number | null }) => number;
  displayCurrency: string;
  busyRuleId: string | null;
  onClose: () => void;
  onToggle: (r: RecurringRuleRow) => Promise<void>;
  onAction: (ruleId: string, action: "paid" | "skip" | "undo") => void;
  onEdit: (r: RecurringRuleRow) => void;
  onDelete: (r: RecurringRuleRow) => void;
}) {
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  if (!rule) return null;

  const booked = occurrences.filter((o) => o.recurring_rule_id === rule.id);
  const entries = booked;
  const paidTotal = entries.reduce((s, p) => s + convert(p), 0);
  const fmtOf = (n: number) => mask(formatMoney(n, displayCurrency, locale));
  const dFmt = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(`${iso}T00:00:00`),
    );
  const dShort = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(`${iso}T00:00:00`),
    );

  const due = ruleIsDue(rule, occurrences);
  const latest = latestOccurrenceFor(occurrences, rule.id);
  const busy = busyRuleId === rule.id;
  const proof = (() => {
    if (!latest?.recurring_due_date) return null;
    if (latest.recurring_due_date >= rule.next_due_date) return null;
    const late = Math.max(
      0,
      Math.round(
        (new Date(`${latest.date}T00:00:00`).getTime() -
          new Date(`${latest.recurring_due_date}T00:00:00`).getTime()) /
          86_400_000,
      ),
    );
    const canUndo =
      advanceDueDate(latest.recurring_due_date, rule.frequency, rule.interval_days) ===
      rule.next_due_date;
    return { late, canUndo };
  })();
  const overdueDays = due
    ? Math.max(
        0,
        Math.round(
          (new Date(`${todayISO()}T00:00:00`).getTime() -
            new Date(`${rule.next_due_date}T00:00:00`).getTime()) /
            86_400_000,
        ),
      )
    : 0;
  const futureSlots = nextOccurrences(
    advanceDueDate(rule.next_due_date, rule.frequency, rule.interval_days),
    rule.frequency,
    2,
    rule.interval_days,
  );

  return (
    <SlideOver
      open={!!rule}
      title="Plan record"
      onClose={onClose}
      footer={
        /* Stacked full-width on the bottom sheet, primary edit under the thumb; inline row from sm up. */
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            onClick={() => onDelete(rule)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 border border-danger/40 px-4 text-xs font-bold uppercase tracking-[0.08em] text-danger transition-colors hover:bg-danger/10 sm:h-9 sm:w-auto"
          >
            <Trash2 size={13} /> Delete
          </button>
          <button
            onClick={onClose}
            className="inline-flex h-11 w-full items-center justify-center border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-text-muted sm:h-9 sm:w-auto"
          >
            Close
          </button>
          <button
            onClick={() => onEdit(rule)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 border border-primary bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong sm:h-9 sm:w-auto"
          >
            <Pencil size={13} /> Edit rule
          </button>
        </div>
      }
    >
      <div className="px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
        <p className="truncate text-sm font-bold text-text">
          {rule.categories?.icon} {rule.description || rule.categories?.name || "Recurring"}
        </p>
        <div
          className={`figures mt-2 font-bold leading-none ${
            rule.is_active ? "text-text" : "text-faint line-through"
          }`}
        >
          <FitText basePx={30} minPx={18}>
            {fmtOf(rule.amount)}
            <span className="ml-1 text-xs font-normal text-faint">
              /{rule.frequency === "daily" ? "day" : rule.frequency === "weekly" ? "week" : rule.frequency === "custom" ? `${rule.interval_days ?? 30}d` : "month"}
            </span>
          </FitText>
        </div>
        <p className="stamp mt-2">
          {rule.currency} · {rule.payment_method} · {rule.is_active ? "active" : "paused"}
        </p>
      </div>

      {/* ── Payment state: due card / paid proof + undo (mobile parity) ── */}
      <div className="border-t border-border px-4 py-4 sm:px-5">
        {due ? (
          <div className="border border-danger/40 bg-danger/5 p-3">
            <p className="flex items-center gap-2 text-[13px] font-black text-danger">
              <AlertCircle size={16} />
              {overdueDays > 0
                ? `${t("recurring_overdue")} ${overdueDays}d — ${t("recurring_payment_due")}`
                : t("recurring_payment_due")}
            </p>
            <p className="mt-0.5 text-[11.5px] text-text-muted">
              {fmtOf(rule.amount)} · {t("recurring_slot_due")}{" "}
              <span className="numeric font-bold text-text">{rule.next_due_date}</span>
            </p>
            {rule.is_active && (
              <div className="mt-3 flex gap-2">
                <Button onClick={() => onAction(rule.id, "paid")} loading={busy} className="flex-[1.4]">
                  <CheckCircle2 size={14} /> {t("recurring_mark_paid")}
                </Button>
                <button
                  onClick={() => onAction(rule.id, "skip")}
                  disabled={busy}
                  className="flex-1 border border-border bg-surface-elevated px-3 text-[13px] font-bold text-text-muted transition hover:border-text-muted hover:text-text disabled:opacity-50"
                >
                  {t("recurring_skip_cycle")}
                </button>
              </div>
            )}
          </div>
        ) : proof ? (
          <div className="flex items-center gap-2 border border-income/30 bg-income/5 p-3">
            <CheckCircle2 size={16} className="shrink-0 text-income" />
            <p className="flex-1 text-xs font-extrabold text-income">
              ✓ {t("recurring_paid_short")} {dShort(latest!.date)} ·{" "}
              {proof.late > 0
                ? `${t("recurring_late_days")} ${proof.late}d`
                : t("recurring_on_time")}
            </p>
            {proof.canUndo && (
              <button
                onClick={() => onAction(rule.id, "undo")}
                disabled={busy}
                className="inline-flex items-center gap-1 border border-border bg-surface-elevated px-2 py-1 text-[11px] font-bold text-text-muted transition hover:border-text-muted hover:text-text disabled:opacity-50"
              >
                <RotateCcw size={11} /> {t("recurring_not_paid_undo")}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs italic text-faint">
            Nothing booked yet — the first installment is due {dFmt(rule.next_due_date)}.
          </p>
        )}

        {/* Timeline strip: booked slots ✓, current slot, two future positions */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {booked.slice(0, 4).map((o) => {
            const slot = o.recurring_due_date ?? o.date;
            const late = Math.max(
              0,
              Math.round(
                (new Date(`${o.date}T00:00:00`).getTime() - new Date(`${slot}T00:00:00`).getTime()) /
                  86_400_000,
              ),
            );
            return (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 border border-border bg-income/5 px-2 py-0.5 text-[10.5px] font-bold text-text"
              >
                <Check size={10} className="text-income" /> {dShort(o.date)}
                {late > 0 && <span className="text-faint">(+{late})</span>}
              </span>
            );
          })}
          <span
            className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10.5px] font-bold ${
              due
                ? "border-danger/50 bg-danger/10 text-danger"
                : "border-border bg-surface-elevated text-text-muted"
            }`}
          >
            ○ {rule.next_due_date} {due ? t("recurring_pending_badge") : t("recurring_next_badge")}
          </span>
          {futureSlots.map((d) => (
            <span
              key={d}
              className="inline-flex items-center border border-dashed border-border px-2 py-0.5 text-[10.5px] font-semibold text-faint"
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <p className="caps mb-2">Next occurrences</p>
        <ul className="flex flex-wrap gap-2">
          {nextOccurrences(rule.next_due_date, rule.frequency, 3, rule.interval_days).map((iso) => (
            <li key={iso} className="border border-border bg-surface-elevated/50 px-2 py-1 text-xs font-bold text-text sm:px-2.5">
              {dFmt(iso)}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="caps shrink-0">Paid to date</p>
          <p className="numeric truncate text-sm font-extrabold text-text">{fmtOf(paidTotal)}</p>
        </div>
        {entries.length === 0 ? (
          <p className="mt-2 text-xs italic text-faint">
            Nothing posted yet{due ? " — this slot is open now." : ` — the first entry lands on ${dFmt(rule.next_due_date)}.`}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60">
            {entries.slice(0, 10).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-xs text-text-muted">
                  {dFmt(p.date)}
                  {p.recurring_due_date && p.recurring_due_date !== p.date && (
                    <span className="ml-1 text-[10px] text-faint">
                      ({t("recurring_slot_due")} {dShort(p.recurring_due_date)})
                    </span>
                  )}
                </span>
                <span className="numeric text-xs font-bold text-text">{fmtOf(convert(p))}</span>
              </li>
            ))}
            {entries.length > 10 && (
              <li className="pt-1.5 text-[11px] italic text-faint">
                …and {entries.length - 10} earlier entries in History.
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3 py-1">
          <p className="text-[13px] font-semibold text-text-muted">{t("recurring_billing_mode")}</p>
          <p className="text-[13px] font-bold text-text">
            {ruleMode(rule) === "auto_charge" ? t("recurring_mode_auto") : t("recurring_mode_reminder")}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 py-1">
          <p className="text-[13px] font-semibold text-text-muted">Status</p>
          <button
            onClick={() => void onToggle(rule)}
            className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-bold ${
              rule.is_active
                ? "border-income/40 text-income hover:bg-income/10"
                : "border-border text-text-muted hover:text-text"
            }`}
          >
            {rule.is_active ? <Pause size={11} /> : <Play size={11} />}
            {rule.is_active ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="stamp">Rule ref {rule.id.slice(0, 8).toUpperCase()}</p>
      </div>
    </SlideOver>
  );
}

function RuleEditor({
  open,
  rule,
  categories,
  defaultCurrency,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  rule: RecurringRuleRow | null;
  categories: { id: string; name: string; icon: string; color: string }[];
  defaultCurrency: string;
  saving: boolean;
  onClose: () => void;
  onSave: (input: RecurringRuleInput) => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("NPR");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [intervalDays, setIntervalDays] = useState("28");
  const [mode, setMode] = useState<RecurringMode>("pay_on_due");
  const [nextDue, setNextDue] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [catOpen, setCatOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setAmount(String(rule.amount));
      setCurrency(rule.currency as CurrencyCode);
      setCategoryId(rule.category_id);
      setDescription(rule.description ?? "");
      setFrequency(rule.frequency as RecurringFrequency);
      setIntervalDays(String(rule.interval_days ?? 28));
      setMode((rule.mode ?? "pay_on_due") as RecurringMode);
      setNextDue(rule.next_due_date);
      setPaymentMethod(rule.payment_method);
    } else {
      setAmount("");
      setCurrency(defaultCurrency as CurrencyCode);
      setCategoryId(categories[0]?.id ?? "");
      setDescription("");
      setFrequency("monthly");
      setIntervalDays("28");
      setMode("pay_on_due");
      setNextDue(todayISO());
      setPaymentMethod("Cash");
    }
  }, [open, rule, defaultCurrency, categories]);

  const interval = Number(intervalDays);
  const intervalInvalid = frequency === "custom" && (!Number.isInteger(interval) || interval < 1 || interval > 365);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    if (!categoryId) return;
    if (intervalInvalid) return;
    onSave({
      categoryId,
      amount: numeric,
      currency,
      description: description.trim() || null,
      paymentMethod,
      frequency,
      intervalDays: frequency === "custom" ? interval : null,
      mode,
      nextDueDate: nextDue,
      isActive: rule ? rule.is_active : true,
    });
  };

  return (
    <Modal open={open} title={rule ? "Amend rule" : "New recurring rule"} onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4 px-4 pt-4 pb-2 sm:px-5 sm:pb-0">
        <div className="grid grid-cols-4 gap-1.5 border border-border bg-surface-elevated p-1 sm:gap-2">
          {(["daily", "weekly", "monthly", "custom"] as RecurringFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`h-11 text-[11px] font-bold uppercase tracking-[0.04em] transition sm:h-9 sm:text-xs ${
                frequency === f ? "bg-primary text-white" : "text-text-muted"
              }`}
            >
              {f === "custom" ? t("recurring_freq_every_n_days") : t(`recur_${f}`)}
            </button>
          ))}
        </div>

        {/* Custom cycle length — the chain anchors to the plan start, not to payment dates. */}
        {frequency === "custom" && (
          <div className="border border-border bg-surface-elevated/50 p-3">
            <Input
              label={t("recurring_interval_days")}
              type="number"
              min="1"
              max="365"
              inputMode="numeric"
              required
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[7, 14, 28, 30].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setIntervalDays(String(preset))}
                  className={`px-2.5 py-1 text-xs font-bold transition ${
                    intervalDays === String(preset)
                      ? "border border-primary bg-primary text-white"
                      : "border border-border text-text-muted hover:text-text"
                  }`}
                >
                  {preset}d
                </button>
              ))}
            </div>
            {intervalInvalid && (
              <p className="mt-2 text-xs font-bold text-danger">{t("recurring_interval_invalid")}</p>
            )}
            <p className="mt-1.5 text-[11px] text-faint">{t("recurring_interval_hint")}</p>
          </div>
        )}

        {/* Billing mode: due card + explicit tap vs silent auto-post (mobile §4). */}
        <div>
          <p className="caps mb-1.5">{t("recurring_billing_mode")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              { key: "pay_on_due" as RecurringMode, icon: "🔔" },
              { key: "auto_charge" as RecurringMode, icon: "⚡" },
            ]).map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  aria-pressed={active}
                  className={`border-2 p-3 text-left transition ${
                    active ? "border-primary bg-primary/5" : "border-border bg-surface-elevated hover:border-text-muted"
                  }`}
                >
                  <p className={`text-[13px] font-extrabold ${active ? "text-primary" : "text-text"}`}>
                    {m.icon} {t(m.key === "auto_charge" ? "recurring_mode_auto" : "recurring_mode_reminder")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {t(m.key === "auto_charge" ? "recurring_mode_auto_sub" : "recurring_mode_reminder_sub")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("amount")}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            leftAdornment={CURRENCY_DETAILS[currency].symbol}
          />
          <Select label={t("currency")} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} — {CURRENCY_DETAILS[c].label}
              </option>
            ))}
          </Select>
          {/* Category — custom listbox so the stored emoji renders through the
              Lucide glyph layer (never as raw emoji), like the entry form. */}
          <div className="relative">
            <p className="caps mb-1.5">{t("category")}</p>
            <button
              type="button"
              onClick={() => {
                setCatOpen((o) => !o);
                setCatSearch("");
              }}
              aria-haspopup="listbox"
              aria-expanded={catOpen}
              className={`flex w-full items-center gap-3 border bg-input p-2.5 text-left transition hover:border-text-muted ${
                categoryId ? "border-border" : "border-danger"
              }`}
            >
              {(() => {
                const sel = categories.find((c) => c.id === categoryId) ?? null;
                const G = sel ? categoryGlyph(sel.icon) : Tag;
                return (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={sel ? { backgroundColor: `${sel.color}1a`, color: sel.color } : undefined}
                    aria-hidden
                  >
                    <G size={16} />
                  </span>
                );
              })()}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                {categories.find((c) => c.id === categoryId)?.name ?? "—"}
              </span>
              <ChevronDown size={15} className={catOpen ? "rotate-180 text-text-muted" : "text-faint"} />
            </button>
            {catOpen && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-border bg-surface-elevated shadow-pop">
                {categories.length > 10 && (
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        autoFocus
                        type="search"
                        value={catSearch}
                        onChange={(e) => setCatSearch(e.target.value)}
                        placeholder={t("searchCategories")}
                        className="h-9 w-full rounded-lg border border-border bg-input pl-8 pr-2 text-sm text-text placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}
                <ul className="max-h-[260px] overflow-auto py-1" role="listbox">
                  {categories
                    .filter((c) => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()))
                    .map((c) => {
                      const G = categoryGlyph(c.icon);
                      const active = categoryId === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setCategoryId(c.id);
                              setCatOpen(false);
                            }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface ${
                              active ? "bg-primary-light font-bold text-text" : "text-text"
                            }`}
                          >
                            <G size={16} style={{ color: c.color }} />
                            {c.name}
                            {active && <Check size={14} className="ml-auto text-primary" />}
                          </button>
                        </li>
                      );
                    })}
                  {categories.filter((c) => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()))
                    .length === 0 && (
                    <li className="px-3 py-3 text-center text-xs italic text-faint">{t("noCategories")}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          {/* Short pair shares one line on the phone sheet; joins the sm grid itself. */}
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <Select
              label={t("paymentMethod")}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              label={t("recurring_next_due")}
              type="date"
              required
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>
          <Input
            label={t("description")}
            type="text"
            maxLength={200}
            placeholder="e.g. House rent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Bottom-sheet actions: full-width stacked, save under the thumb on mobile. */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            {t("cancel")}
          </Button>
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            {t("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
