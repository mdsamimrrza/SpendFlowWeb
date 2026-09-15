"use client";

/**
 * Categories & Budgets — 1:1 web mirror of mobile app/categories.tsx:
 * left-aligned header (back chip + title, "New" pill), the Monthly Target
 * Allocations hero card with the amber "Set Budgets" button and 3-cell stats
 * bar, the red/teal 50/50 segmented Expense|Income switcher, and the 2-up
 * category card grid (icon tile + name + edit glyph, budget/inflow line,
 * Custom pill). Add/edit opens the APK-ported CategoryManageModal; "Set
 * Budgets" opens the Category Budget Studio sheet.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Plus,
  Tag,
  Target,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import {
  MobileEmptyState,
  MobileHeaderBar,
} from "@/components/ui/MobileChrome";
import { CategoryManageModal } from "@/components/expense/CategoryManageModal";
import { CategoryBudgetStudio } from "@/components/category/CategoryBudgetStudio";
import { Skeleton } from "@/components/ui/Skeleton";
import { categoryGlyph } from "@/components/ui/Glyph";
import { formatMoney } from "@/utils/format";
import { listCategories } from "@/services/categories";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { Category } from "@/types/database.types";

export default function CategoriesPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [manageOpen, setManageOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);

  const currency = profile?.preferred_currency ?? "NPR";
  const money = (n: number) => formatMoney(n, currency, locale);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
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

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type !== "income"),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "income"),
    [categories],
  );
  const activeList = activeTab === "expense" ? expenseCategories : incomeCategories;

  const totalAllocatedBudget = useMemo(
    () => expenseCategories.reduce((acc, cat) => acc + (Number(cat.budget_monthly) || 0), 0),
    [expenseCategories],
  );
  const budgetedExpenseCount = useMemo(
    () => expenseCategories.filter((c) => (Number(c.budget_monthly) || 0) > 0).length,
    [expenseCategories],
  );

  const openNew = () => {
    setEditingCategory(null);
    setManageOpen(true);
  };
  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setManageOpen(true);
  };

  return (
    <main className="mx-auto w-full max-w-[560px]">
      <MobileHeaderBar
        title={t("rowCategoriesBudgets")}
        right={
          <button
            onClick={openNew}
            className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11.5px] font-extrabold text-white transition active:opacity-80"
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            {t("catNew")}
          </button>
        }
      />

      <div className="space-y-2 p-0.5">
        {/* ── Summary hero card ── */}
        <section className="space-y-1.5 rounded-[16px] border border-border bg-surface p-2.5 shadow-[0_2px_8px_var(--sf-set-card-shadow)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase leading-4 tracking-[0.8px] text-text-muted">
                {t("catKicker")}
              </p>
              <p className="text-[21px] font-black leading-[25px] text-text">
                {money(totalAllocatedBudget)}
              </p>
              <p className="text-xs leading-4 text-text-muted">
                {t("catAcrossBudgeted").replace("{count}", String(budgetedExpenseCount))}
              </p>
            </div>
            <button
              onClick={() => setStudioOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--sf-set-chip-gold-line)] bg-[var(--sf-set-chip-gold)] px-3 py-2 transition active:opacity-80"
            >
              <Target size={15} className="text-hue-amber" aria-hidden />
              <span className="text-xs font-extrabold text-hue-amber">{t("catSetBudgets")}</span>
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5">
            <div className="flex-1 border-r border-border text-center">
              <p className="text-base font-extrabold text-text">{expenseCategories.length}</p>
              <p className="text-[11px] font-semibold text-text-muted">{t("catExpenses")}</p>
            </div>
            <div className="flex-1 border-r border-border text-center">
              <p className="text-base font-extrabold text-primary">{incomeCategories.length}</p>
              <p className="text-[11px] font-semibold text-text-muted">{t("catIncomes")}</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-base font-extrabold text-hue-amber">{budgetedExpenseCount}</p>
              <p className="text-[11px] font-semibold text-text-muted">{t("catTargetsSet")}</p>
            </div>
          </div>
        </section>

        {/* ── 50/50 segmented switcher ── */}
        <div
          role="tablist"
          className="flex h-[50px] w-full rounded-[14px] border border-border bg-surface-elevated p-1"
        >
          <button
            role="tab"
            aria-selected={activeTab === "expense"}
            onClick={() => setActiveTab("expense")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] transition ${
              activeTab === "expense"
                ? "bg-[var(--sf-tab-expense)] text-white"
                : "text-text-muted"
            }`}
          >
            <ArrowDownRight size={16} strokeWidth={2.5} aria-hidden />
            <span className="text-[13.5px] font-extrabold leading-[18px]">
              {t("expense")} ({expenseCategories.length})
            </span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "income"}
            onClick={() => setActiveTab("income")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] transition ${
              activeTab === "income" ? "bg-primary text-white" : "text-text-muted"
            }`}
          >
            <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden />
            <span className="text-[13.5px] font-extrabold leading-[18px]">
              {t("income")} ({incomeCategories.length})
            </span>
          </button>
        </div>

        {/* ── Category grid ── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[78px] w-full rounded-[16px]" />
            ))}
          </div>
        ) : activeList.length === 0 ? (
          <MobileEmptyState
            icon={Tag}
            title={activeTab === "expense" ? t("catNoExpenseCats") : t("catNoIncomeCats")}
            message={t("catEmptyMsg")}
            actionLabel={t("catAddCategoryCta")}
            onAction={openNew}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {activeList.map((item) => {
              const budget = Number(item.budget_monthly) || 0;
              const G = categoryGlyph(item.icon);
              return (
                <button
                  key={item.id}
                  onClick={() => openEdit(item)}
                  className="flex min-h-[78px] flex-col justify-between gap-2 rounded-[16px] border-[1.5px] border-border bg-surface p-3 text-left transition active:opacity-85"
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-elevated">
                        <G
                          size={16}
                          style={{ color: item.type === "income" ? "var(--sf-hue-emerald)" : undefined }}
                          className={item.type === "income" ? "" : "text-primary"}
                          aria-hidden
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-text">
                        {item.name}
                      </span>
                    </span>
                    <Pencil size={13} className="shrink-0 text-text-muted" aria-hidden />
                  </span>
                  <span className="flex items-center justify-between">
                    {item.type === "expense" ? (
                      budget > 0 ? (
                        <span className="text-[12.5px] font-extrabold text-primary">
                          {money(budget)}
                          <span className="text-[10px] font-semibold text-text-muted"> /mo</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-muted">{t("catNoLimitShort")}</span>
                      )
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-hue-emerald">
                        <TrendingUp size={12} aria-hidden />
                        {t("catInflowStream")}
                      </span>
                    )}
                    {item.is_custom && (
                      <span className="rounded-full bg-primary-light px-[5px] py-[1.5px] text-[9px] font-extrabold text-primary">
                        {t("catCustom")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CategoryManageModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        category={editingCategory}
        defaultType={activeTab}
        userId={user?.id}
        onSaved={() => void load()}
      />
      <CategoryBudgetStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onSaved={() => void load()}
      />
    </main>
  );
}
