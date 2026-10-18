"use client";

/**
 * Categories & Budgets - V2 rebuild of the mobile app/categories.tsx mirror:
 * left-aligned page header with a primary "New" action, then a desktop
 * two-column arrangement - the expense/income segmented switcher and a
 * responsive 2-3 up category card grid beside the Monthly Target Allocations
 * summary panel (sticky on laptop). On phones everything stacks single
 * column: summary hero, switcher, 2-up grid. Add/edit opens the APK-ported
 * CategoryManageModal; "Set Budgets" opens the Category Budget Studio sheet.
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
import { MobileEmptyState } from "@/components/ui/MobileChrome";
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
    <main className="mx-auto w-full max-w-[1200px]">
      {/* ── Page header ── */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-faint">{t("rowCategoriesBudgetsDesc")}</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
            {t("rowCategoriesBudgets")}
          </h1>
        </div>
        <button
          onClick={openNew}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-strong active:scale-[0.98]"
        >
          <Plus size={16} aria-hidden />
          {t("catNew")}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-5">
        {/* ── Allocation summary (right column on laptop, hero on phones) ── */}
        <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-soft lg:order-2 lg:sticky lg:top-[72px]">
          <p className="caps">{t("catKicker")}</p>
          <div>
            <p className="figures-display text-3xl tracking-[-0.02em] text-text">
              {money(totalAllocatedBudget)}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">
              {t("catAcrossBudgeted").replace("{count}", String(budgetedExpenseCount))}
            </p>
          </div>
          <button
            onClick={() => setStudioOpen(true)}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-strong active:scale-[0.98]"
          >
            <Target size={15} aria-hidden />
            {t("catSetBudgets")}
          </button>
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface-elevated py-2.5 text-center">
            <div>
              <p className="figures text-lg text-text">{expenseCategories.length}</p>
              <p className="text-[11px] font-medium text-text-muted">{t("catExpenses")}</p>
            </div>
            <div>
              <p className="figures text-lg text-income">{incomeCategories.length}</p>
              <p className="text-[11px] font-medium text-text-muted">{t("catIncomes")}</p>
            </div>
            <div>
              <p className="figures text-lg text-primary">{budgetedExpenseCount}</p>
              <p className="text-[11px] font-medium text-text-muted">{t("catTargetsSet")}</p>
            </div>
          </div>
        </section>

        {/* ── Switcher + category grid (left column on laptop) ── */}
        <div className="min-w-0 space-y-3 lg:order-1">
          {/* ── Expense / Income segmented switcher ── */}
          <div
            role="tablist"
            className="flex h-12 w-full rounded-lg border border-border bg-surface-elevated p-1"
          >
            <button
              role="tab"
              aria-selected={activeTab === "expense"}
              onClick={() => setActiveTab("expense")}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md transition-colors ${
                activeTab === "expense" ? "bg-primary text-primary-ink" : "text-text-muted hover:text-text"
              }`}
            >
              <ArrowDownRight size={15} aria-hidden />
              <span className="truncate text-[13px] font-semibold">
                {t("expense")} ({expenseCategories.length})
              </span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "income"}
              onClick={() => setActiveTab("income")}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md transition-colors ${
                activeTab === "income" ? "bg-primary text-primary-ink" : "text-text-muted hover:text-text"
              }`}
            >
              <ArrowUpRight size={15} aria-hidden />
              <span className="truncate text-[13px] font-semibold">
                {t("income")} ({incomeCategories.length})
              </span>
            </button>
          </div>

          {/* ── Category cards - 2-up on phones, up to 3-up on wide laptops ── */}
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[78px] w-full rounded-xl" />
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
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
              {activeList.map((item) => {
                const budget = Number(item.budget_monthly) || 0;
                const G = categoryGlyph(item.icon);
                return (
                  <button
                    key={item.id}
                    onClick={() => openEdit(item)}
                    className="flex min-h-[78px] flex-col justify-between gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-faint active:scale-[0.99]"
                  >
                    <span className="flex items-center justify-between gap-1.5">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-elevated">
                          <G
                            size={16}
                            className={item.type === "income" ? "text-income" : "text-primary"}
                            aria-hidden
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text">
                          {item.name}
                        </span>
                      </span>
                      <Pencil size={13} className="shrink-0 text-faint" aria-hidden />
                    </span>
                    <span className="flex items-center justify-between">
                      {item.type === "expense" ? (
                        budget > 0 ? (
                          <span className="numeric text-[12.5px] font-bold text-primary">
                            {money(budget)}
                            <span className="text-[10px] font-medium text-text-muted"> /mo</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-muted">{t("catNoLimitShort")}</span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-income">
                          <TrendingUp size={12} aria-hidden />
                          {t("catInflowStream")}
                        </span>
                      )}
                      {item.is_custom && (
                        <span className="rounded-full bg-[var(--sf-primary-light)] px-[6px] py-[2px] text-[9px] font-semibold text-primary-strong">
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
