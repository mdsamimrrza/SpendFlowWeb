"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Panel, SectionTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, todayISO } from "@/utils/format";
import {
  createRecurringRule,
  deleteRecurringRule,
  generateDueRecurringExpenses,
  listRecurringRules,
  monthlyNormalized,
  updateRecurringRule,
  type RecurringRuleInput,
  type RecurringRuleRow,
} from "@/services/recurring";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { CURRENCIES, CURRENCY_DETAILS, PAYMENT_METHODS, type CurrencyCode, type PaymentMethod } from "@/constants/app";
import { useCategories } from "@/hooks/useExpenses";
import { FitText } from "@/components/ui/FitText";

type Frequency = "daily" | "weekly" | "monthly";

/** Recurring register — subscriptions & bills (mobile recurring.tsx parity). */
export default function RecurringPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { mask } = usePrivacy();
  const supabase = getSupabaseBrowserClient();
  const { categories } = useCategories(user?.id);

  const [rules, setRules] = useState<RecurringRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRuleRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringRuleRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      // Generation first so the register shows fresh due entries.
      await generateDueRecurringExpenses(supabase, user.id);
      setRules(await listRecurringRules(supabase, user.id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setLoading(false);
    }
  }, [user, supabase, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const monthlyTotal = useMemo(
    () => rules.filter((r) => r.is_active).reduce((s, r) => s + monthlyNormalized(r), 0),
    [rules],
  );

  const activeCount = rules.filter((r) => r.is_active).length;

  const onSave = async (input: RecurringRuleInput) => {
    setSaving(true);
    try {
      if (editing) {
        await updateRecurringRule(supabase, editing.id, input);
      } else {
        await createRecurringRule(supabase, user!.id, input);
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
    try {
      await updateRecurringRule(supabase, rule.id, { isActive: !rule.is_active });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteRecurringRule(supabase, confirmDelete.id);
      setConfirmDelete(null);
      showToast(t("deleted"), "success");
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

      {/* Monthly commitment strip */}
      <div className="panel mb-4 grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          <p className="caps">Monthly commitment</p>
          <div className="figures mt-1.5 font-bold text-text">
            <FitText basePx={24} minPx={14}>{fmt(monthlyTotal)}</FitText>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="caps">Active rules</p>
          <p className="figures mt-1.5 text-2xl font-bold text-text">{activeCount}</p>
        </div>
        <div className="px-5 py-4">
          <p className="caps">Paused</p>
          <p className="figures mt-1.5 text-2xl font-bold text-text">{rules.length - activeCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No recurring rules"
          message="Add rent, subscriptions and bills once — entries post themselves on the due date."
          action={
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus size={14} /> New rule
            </Button>
          }
        />
      ) : (
        <Panel label="Rules — by next due date">
          <div>
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0"
              >
                <span
                  className="h-8 w-1 shrink-0"
                  style={{ backgroundColor: rule.categories?.color ?? "#8B978F" }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${rule.is_active ? "text-text" : "text-faint line-through"}`}>
                    {rule.description || rule.categories?.name || "Recurring"}
                  </p>
                  <p className="text-[11px] text-faint">
                    {rule.categories?.name ?? "—"} · {rule.frequency} · next{" "}
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                      new Date(`${rule.next_due_date}T00:00:00`),
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="numeric text-sm font-bold text-text">
                    {CURRENCY_DETAILS[rule.currency as CurrencyCode]?.symbol ?? ""}{fmt(rule.amount).replace(/^[^\d]*/, "")}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-faint">
                    /{rule.frequency === "daily" ? "day" : rule.frequency === "weekly" ? "week" : "mo"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void onToggle(rule)}
                    className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      rule.is_active
                        ? "border-income/40 text-income hover:bg-income/10"
                        : "border-border text-faint hover:text-text"
                    }`}
                  >
                    {rule.is_active ? "Active" : "Paused"}
                  </button>
                  <button
                    onClick={() => { setEditing(rule); setEditorOpen(true); }}
                    aria-label="Edit rule"
                    className="p-1.5 text-faint transition-colors hover:text-primary"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(rule)}
                    aria-label="Delete rule"
                    className="p-1.5 text-faint transition-colors hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <RuleEditor
        open={editorOpen}
        rule={editing}
        categories={categories
          .filter((c) => c.type === "expense")
          .map((c) => ({ id: c.id, name: `${c.icon} ${c.name}` }))}
        defaultCurrency={displayCurrency}
        saving={saving}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={onSave}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete rule"
        body="Posted entries stay in your ledger; only future postings stop."
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </main>
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
  categories: { id: string; name: string }[];
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
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextDue, setNextDue] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setAmount(String(rule.amount));
      setCurrency(rule.currency as CurrencyCode);
      setCategoryId(rule.category_id);
      setDescription(rule.description ?? "");
      setFrequency(rule.frequency as Frequency);
      setNextDue(rule.next_due_date);
      setPaymentMethod(rule.payment_method);
    } else {
      setAmount("");
      setCurrency(defaultCurrency as CurrencyCode);
      setCategoryId(categories[0]?.id ?? "");
      setDescription("");
      setFrequency("monthly");
      setNextDue(todayISO());
      setPaymentMethod("Cash");
    }
  }, [open, rule, defaultCurrency, categories]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    if (!categoryId) return;
    onSave({
      categoryId,
      amount: numeric,
      currency,
      description: description.trim() || null,
      paymentMethod,
      frequency,
      nextDueDate: nextDue,
      isActive: rule ? rule.is_active : true,
    });
  };

  return (
    <Modal open={open} title={rule ? "Amend rule" : "New recurring rule"} onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2 border border-border bg-surface-elevated p-1">
          {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`h-9 text-xs font-bold uppercase tracking-[0.06em] transition ${
                frequency === f ? "bg-primary text-white" : "text-text-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("amount")}
            type="number"
            min="0"
            step="any"
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
          <Select label={t("category")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
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
            label="Next due date"
            type="date"
            required
            value={nextDue}
            onChange={(e) => setNextDue(e.target.value)}
          />
          <Input
            label={t("description")}
            type="text"
            maxLength={200}
            placeholder="e.g. House rent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
