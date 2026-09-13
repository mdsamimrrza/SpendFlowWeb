"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CircleDollarSign, CreditCard, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/store/ToastContext";
import { useLanguage } from "@/store/LanguageContext";
import { useAuth } from "@/store/AuthContext";
import { useCategories, useRefreshExpenses } from "@/hooks/useExpenses";
import { createExpense, getExpense, softDeleteExpense, updateExpense } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { CURRENCIES, CURRENCY_DETAILS, PAYMENT_METHODS, type CurrencyCode, type PaymentMethod } from "@/constants/app";
import { todayISO } from "@/utils/format";
import type { ExpenseRow } from "@/services/expenses";

interface ExpenseFormProps {
  expenseId?: string;
}

type FlowType = "expense" | "income";

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  Cash: <Banknote size={15} />,
  Card: <CreditCard size={15} />,
  UPI: <Smartphone size={15} />,
  Other: <CircleDollarSign size={15} />,
};

/**
 * Create/edit transaction form (mobile ExpenseForm semantics): calculator-style
 * amount entry with type toggle, payment-method pills, details grid.
 */
export function ExpenseForm({ expenseId }: ExpenseFormProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const refreshExpenses = useRefreshExpenses();
  const { user } = useAuth();
  const userId = user?.id;

  const { categories } = useCategories(userId);
  const [existing, setExisting] = useState<ExpenseRow | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!expenseId);

  const [flowType, setFlowType] = useState<FlowType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("NPR");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!expenseId) return;
    void getExpense(supabase, expenseId).then((row) => {
      if (row) {
        setExisting(row);
        setFlowType(row.type);
        setAmount(String(row.amount));
        setCurrency(row.currency as CurrencyCode);
        setCategoryId(row.category_id);
        setDescription(row.description ?? "");
        setDate(row.date);
        setTime(row.time ?? "");
        setPaymentMethod(row.payment_method);
        setNotes(row.notes ?? "");
      }
      setLoadingExisting(false);
    });
  }, [expenseId, supabase]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === flowType),
    [categories, flowType],
  );

  const switchType = (next: FlowType) => {
    setFlowType(next);
    const stillValid = visibleCategories.some((c) => c.id === categoryId);
    if (!stillValid) {
      const firstOfNext = categories.find((c) => c.type === next);
      setCategoryId(firstOfNext?.id ?? "");
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      showToast(t("amountRequired"), "error");
      return;
    }
    if (!categoryId) {
      showToast(t("categoryRequired"), "error");
      return;
    }
    if (!userId) return;
    setSaving(true);
    try {
      const payload = {
        categoryId,
        amount: numeric,
        currency,
        type: flowType,
        description: description.trim() || null,
        date,
        time: time || null,
        paymentMethod,
        notes: notes.trim() || null,
      };
      if (existing) {
        await updateExpense(supabase, existing.id, payload);
      } else {
        await createExpense(supabase, { userId, ...payload });
      }
      refreshExpenses();
      showToast(t("saved"), "success");
      router.push("/overview");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    setConfirmDelete(false);
    try {
      await softDeleteExpense(supabase, existing.id);
      refreshExpenses();
      showToast(t("deleted"), "success");
      router.push("/overview");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    }
  };

  if (loadingExisting) {
    return <p className="text-sm text-text-muted">{t("loading")}</p>;
  }

  const accent = flowType === "income" ? "income" : "danger";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Amount panel — the hero of this screen */}
      <section className="panel">
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">Amount</span>
          <span className="caps-faint">{flowType === "income" ? "Credit" : "Debit"}</span>
        </div>
        <div className="p-5">
        <div className="mb-5 grid max-w-md grid-cols-2 gap-2 border border-border bg-surface-elevated p-1">
          {(["expense", "income"] as FlowType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => switchType(type)}
              className={`h-10 text-xs font-bold uppercase tracking-[0.06em] transition ${
                flowType === type
                  ? type === "income"
                    ? "bg-income text-white shadow-sm"
                    : "bg-danger text-white shadow-sm"
                  : "text-text-muted"
              }`}
            >
              {t(type)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="expense-amount"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted"
            >
              {t("amount")}
            </label>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-extrabold ${accent === "income" ? "text-income" : "text-danger"}`}>
                {CURRENCY_DETAILS[currency].symbol}
              </span>
              <input
                id="expense-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                required
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="figures w-full max-w-xs border-b-2 border-border bg-transparent pb-1 text-[38px] font-bold leading-none text-text placeholder:text-faint/50 focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="w-44">
            <Select
              label={t("currency")}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_DETAILS[c].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Payment method pills */}
        <div className="mt-6">
          {/* pills */}
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            {t("paymentMethod")}
          </p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`flex h-9 items-center gap-2 border px-3.5 text-xs font-bold uppercase tracking-[0.04em] transition ${
                  paymentMethod === m
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-input text-text-muted hover:text-text"
                }`}
              >
                {METHOD_ICONS[m]}
                {m}
              </button>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* Details */}
      <section className="panel">
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">Details</span>
          <span className="caps-faint">Optional unless noted</span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Select
            label={t("category")}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            <option value="">—</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
          <Input
            label={t("date")}
            type="date"
            required
            min="2000-01-01"
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Input
            label={t("description")}
            type="text"
            maxLength={200}
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="sm:col-span-2">
            <label
              htmlFor="expense-notes"
              className="mb-1 block text-[13px] font-bold text-text-muted"
            >
              {t("notes")}
            </label>
            <textarea
              id="expense-notes"
              maxLength={500}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Optional details…"
            />
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        {existing && (
          <p className="hidden text-xs text-faint sm:block">Changes update this record in place.</p>
        )}
        <div className="flex flex-1 items-center justify-end gap-3">
          {existing && (
            <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> {t("delete")}
            </Button>
          )}
          <Button type="submit" loading={saving} className="min-w-[160px]">
            {t("save")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("deleteConfirmTitle")}
        body={t("deleteConfirmBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  );
}
