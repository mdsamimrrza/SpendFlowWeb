"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney , toISODate } from "@/utils/format";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/services/categories";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { Category } from "@/types/database.types";

const TYPE_COLORS = {
  expense: "#a5442b",
  income: "#047857",
} as const;

/** Categories — register of classification keys with optional monthly limits. */
export default function CategoriesPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<"expense" | "income">("expense");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setCategories(await listCategories(supabase, user.id));
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
  const visible = categories.filter((c) => c.type === flow);
  const totalBudgets = visible.reduce((s, c) => s + (c.budget_monthly ?? 0), 0);

  const onDelete = async () => {
    if (!confirmDelete || !user) return;
    try {
      await deleteCategory(supabase, user.id, confirmDelete.id);
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
          <p className="caps !text-primary-strong">Classification keys</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("category")}</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
          <Plus size={14} /> New category
        </Button>
      </header>

      {/* Flow switcher + totals strip */}
      <div className="panel mb-4 grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          <p className="caps">{t("expenses")} keys</p>
          <p className="figures mt-1.5 text-2xl font-bold text-text">
            {categories.filter((c) => c.type === "expense").length}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="caps">{t("income")} keys</p>
          <p className="figures mt-1.5 text-2xl font-bold text-text">
            {categories.filter((c) => c.type === "income").length}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="caps">Limits set ({flow})</p>
          <p className="figures mt-1.5 text-2xl font-bold text-text">{fmt(totalBudgets)}</p>
        </div>
      </div>

      <div className="mb-4 flex w-fit border border-border">
        {(["expense", "income"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFlow(f)}
            className={`h-9 px-5 text-xs font-bold uppercase tracking-[0.08em] transition ${
              flow === f ? "text-white" : "text-text-muted hover:text-text"
            }`}
            style={flow === f ? { backgroundColor: TYPE_COLORS[f] } : undefined}
          >
            {t(f)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${flow} categories`} message="Add one to start classifying entries." />
      ) : (
        <Panel label={`Keys — ${visible.length}`}>
          <div>
            {visible.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center border text-base"
                  style={{ borderColor: `${c.color}55`, backgroundColor: `${c.color}14` }}
                  aria-hidden
                >
                  {c.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {c.name}
                    {c.is_custom && <span className="caps ml-2 !text-brass">Custom</span>}
                  </p>
                  <p className="text-[11px] text-faint">
                    {c.budget_monthly != null
                      ? `Limit ${c.budget_monthly.toLocaleString(locale)} / month`
                      : "No monthly limit"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => { setEditing(c); setEditorOpen(true); }}
                    aria-label="Edit category"
                    className="p-1.5 text-faint transition-colors hover:text-primary"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(c)}
                    aria-label="Delete category"
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

      <CategoryEditor
        open={editorOpen}
        category={editing}
        flow={flow}
        userId={user?.id}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSaved={async () => {
          setEditorOpen(false);
          setEditing(null);
          showToast(t("saved"), "success");
          await load();
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete category"
        body="Entries in this category are moved to another category first (the ledger never loses them)."
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </main>
  );
}

function CategoryEditor({
  open,
  category,
  flow,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: Category | null;
  flow: "expense" | "income";
  userId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? "🏷️");
    setBudget(category?.budget_monthly != null ? String(category.budget_monthly) : "");
  }, [open, category]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !name.trim()) return;
    setSaving(true);
    try {
      const budgetMonthly = budget.trim() === "" ? null : Number(budget);
      if (category) {
        await updateCategory(supabase, category.id, {
          name: name.trim(),
          icon,
          budget_monthly: budgetMonthly,
        });
        if (budgetMonthly != null) {
          await supabase.from("category_budget_history").insert({
            user_id: userId,
            category_id: category.id,
            effective_from: toISODate(new Date()),
            budget_monthly: budgetMonthly,
          });
        }
      } else {
        const created = await createCategory(supabase, userId, {
          name: name.trim(),
          icon,
          color: TYPE_COLORS[flow],
          type: flow,
          budgetMonthly,
        });
        if (created.budget_monthly != null) {
          await supabase.from("category_budget_history").insert({
            user_id: userId,
            category_id: created.id,
            effective_from: toISODate(new Date()),
            budget_monthly: created.budget_monthly,
          });
        }
      }
      await onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={category ? "Amend category" : "New category"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[70px_1fr] gap-3">
          <Input
            label="Icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 2))}
            maxLength={2}
            className="text-center"
          />
          <Input label="Name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Input
          label="Monthly limit (optional)"
          type="number"
          min="0"
          step="any"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
