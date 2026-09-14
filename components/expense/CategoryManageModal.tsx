"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/store/ToastContext";
import { useLanguage } from "@/store/LanguageContext";
import { createCategory, deleteCategory, updateCategory } from "@/services/categories";
import {
  DEFAULT_CATEGORY_COLOR,
  INCOME_ICON_NAMES,
  SELECTABLE_CATEGORY_ICONS,
  categoryColorForIcon,
} from "@/constants/categoryIcons";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { toISODate } from "@/utils/format";
import type { Category } from "@/types/database.types";

interface CategoryManageModalProps {
  open: boolean;
  onClose: () => void;
  /** Edit when set, create when null (APK `categoryToEdit`). */
  category?: Category | null;
  /** APK `defaultType` — the entry form's current flow type. */
  defaultType?: "expense" | "income";
  userId: string | undefined;
  /** APK `onSuccess` — receives the created/updated row to auto-select. */
  onSaved: (category?: Category) => void;
}

/**
 * Port of the APK's components/category/CategoryManageModal: the in-form
 * category editor — type toggle, name + live preview tile, the curated
 * Lucide icon strip, optional monthly target (expense only), create/save
 * and (edit only) delete with reassignment. No color picker: edits preserve
 * the stored color; on create, picking an icon auto-seeds an icon-matched
 * color (web-only divergence — see `categoryColorForIcon`).
 */
export function CategoryManageModal({
  open,
  onClose,
  category,
  defaultType = "expense",
  userId,
  onSaved,
}: CategoryManageModalProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [type, setType] = useState<"expense" | "income">(defaultType);
  const [budgetMonthly, setBudgetMonthly] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form each time the modal opens (APK useEffect parity).
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (category) {
      setName(category.name);
      setIcon(category.icon || "tag");
      setColor(category.color || DEFAULT_CATEGORY_COLOR);
      setType((category.type as "expense" | "income") || "expense");
      setBudgetMonthly(category.budget_monthly != null ? String(category.budget_monthly) : "");
    } else {
      const seedIcon = defaultType === "income" ? "briefcase" : "tag";
      setName("");
      setIcon(seedIcon);
      setColor(categoryColorForIcon(seedIcon));
      setType(defaultType);
      setBudgetMonthly("");
    }
  }, [open, category, defaultType]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t("catNameRequired"));
      return;
    }
    if (!userId) {
      setError(t("catNotSignedIn"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const budget = budgetMonthly.trim() === "" ? null : Number(budgetMonthly);
      if (category) {
        const updated = await updateCategory(supabase, userId, category.id, {
          name: name.trim(),
          icon,
          color,
          type,
          budget_monthly: budget,
        });
        if (budget != null) {
          // Budget trail parity with /categories (append-only history).
          await supabase.from("category_budget_history").insert({
            user_id: userId,
            category_id: category.id,
            effective_from: toISODate(new Date()),
            budget_monthly: budget,
          });
        }
        onSaved(updated);
      } else {
        const created = await createCategory(supabase, userId, {
          name: name.trim(),
          icon,
          color,
          type,
          budgetMonthly: budget,
        });
        if (created.budget_monthly != null) {
          await supabase.from("category_budget_history").insert({
            user_id: userId,
            category_id: created.id,
            effective_from: toISODate(new Date()),
            budget_monthly: created.budget_monthly,
          });
        }
        onSaved(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("catSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!category || !userId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCategory(supabase, userId, category.id);
      setConfirmDelete(false);
      onSaved();
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      showToast(err instanceof Error ? err.message : t("catDeleteFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const Icon = SELECTABLE_CATEGORY_ICONS.find((i) => i.name === icon)?.icon;

  // Icon strip filtered by the chosen register (inflow icons for income,
  // spending icons for expense). A stored icon outside the set stays pinned
  // to the front when editing so the current value always shows; new keys
  // re-pick the first fitting icon when the toggle flips.
  const iconChoices = useMemo(() => {
    const income = type === "income";
    const list = SELECTABLE_CATEGORY_ICONS.filter(
      (i) => INCOME_ICON_NAMES.has(i.name) === income,
    );
    if (category && icon && !list.some((i) => i.name === icon)) {
      const stored = SELECTABLE_CATEGORY_ICONS.find((i) => i.name === icon);
      if (stored) return [stored, ...list];
    }
    return list;
  }, [type, category, icon]);

  useEffect(() => {
    if (category || !open) return;
    if (iconChoices.length > 0 && !iconChoices.some((i) => i.name === icon)) {
      const first = iconChoices[0].name;
      setIcon(first);
      setColor(categoryColorForIcon(first));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-pick only when the register flips
  }, [type, open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={onClose}
          role="presentation"
        >
          <div
            className="panel max-h-[92vh] w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={category ? t("catModalEdit") : t("catModalNew")}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="caps">{category ? t("catModalEdit") : t("catModalNew")}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("cancel")}
                className="p-1 text-text-muted transition-colors hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              {/* Type toggle (APK parity) */}
              <div className="grid grid-cols-2 gap-1 border border-border bg-surface-elevated p-1">
                {(["expense", "income"] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setType(tp)}
                    aria-pressed={type === tp}
                    className={`flex h-9 items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.04em] transition ${
                      type === tp
                        ? tp === "income"
                          ? "bg-primary text-white"
                          : "bg-danger text-white"
                        : "text-text-muted"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        type === tp ? "bg-white" : tp === "income" ? "bg-income" : "bg-danger"
                      }`}
                      aria-hidden
                    />
                    {t(tp === "income" ? "incomeCategory" : "expenseCategory")}
                  </button>
                ))}
              </div>

              {/* Name + live preview tile */}
              <div>
                <p className="caps mb-1.5">{t("catModalName")}</p>
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center border border-border bg-surface-elevated"
                    aria-hidden
                  >
                    {Icon ? <Icon size={22} style={{ color }} /> : null}
                  </span>
                  <Input
                    aria-label={t("catModalName")}
                    placeholder={t("catNamePlaceholder")}
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              {/* Icon strip — the mobile SELECTABLE_ICONS, same order. Picking
                  an icon also seeds its color (web-only, see categoryIcons). */}
              <div>
                <p className="caps mb-1">{t("selectIcon")}</p>
                {/* Mobile-first: below sm the strip is one scrollable line
                    (APK parity — no vertical growth on small screens); on
                    tablet+ it spreads over two wrapped lines. */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {iconChoices.map((item) => {
                    const selected = icon === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          setIcon(item.name);
                          setColor(categoryColorForIcon(item.name));
                        }}
                        aria-pressed={selected}
                        aria-label={item.label}
                        title={item.label}
                        className={`relative flex h-9 w-9 shrink-0 items-center justify-center border-2 transition active:scale-[0.95] sm:h-10 sm:w-10 ${
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-surface-elevated text-text hover:border-text-muted"
                        }`}
                      >
                        <item.icon size={20} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Monthly target — expense categories only (APK parity) */}
              {type === "expense" && (
                <Input
                  label={t("catMonthlyBudget")}
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t("catBudgetPlaceholder")}
                  value={budgetMonthly}
                  onChange={(e) => setBudgetMonthly(e.target.value.replace(/[^\d.]/g, ""))}
                />
              )}

              {error && <p className="text-xs font-bold text-danger">{error}</p>}
            </div>

            {/* Actions (APK pinned row): delete (edit) + save/create */}
            <div className="flex items-center gap-2 border-t border-border px-5 py-4">
              {category && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t("catDelete")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center border border-danger/40 text-danger transition hover:bg-rust-tint"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <Button type="button" loading={saving} onClick={handleSave} className="flex-1">
                {category ? t("catSaveChanges") : t("catCreate")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("catDeleteConfirmTitle")}
        body={t("catDeleteConfirmBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => void confirmDeleteCategory()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
