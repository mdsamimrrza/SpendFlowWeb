"use client";

/**
 * Category Budget Studio — 1:1 web port of mobile
 * components/expense/CategoryBudgetFormModal.tsx: slide-up sheet with grab
 * handle, live allocation-impact gauge (vs the monthly ceiling), horizontal
 * category picker chips, hero amount input with quick-add pills, and the
 * 2-up active-limits grid with per-category clear buttons.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Target, Trash2, Wallet, X } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { MobileConfirmDialog } from "@/components/ui/MobileChrome";
import { categoryGlyph } from "@/components/ui/Glyph";
import { useBudget } from "@/hooks/useRates";
import { toISODate, formatMoney } from "@/utils/format";
import { listCategories, updateCategory } from "@/services/categories";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { Category } from "@/types/database.types";

export function CategoryBudgetStudio({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const monthlyOverall = useBudget() ?? 0;

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const currency = profile?.preferred_currency ?? "NPR";
  const money = (n: number) => formatMoney(n, currency, locale);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && user?.id) {
      listCategories(supabase, user.id)
        .then((cats) => {
          setCategories(cats);
          if (cats.length > 0) {
            setSelectedCatId((prev) => {
              const keep = prev && cats.some((c) => c.id === prev) ? prev : cats[0].id;
              const sel = cats.find((c) => c.id === keep);
              setAmountInput(sel?.budget_monthly ? String(sel.budget_monthly) : "");
              return keep;
            });
          }
        })
        .catch(() => setCategories([]));
    }
  }, [open, user?.id]);

  function handleSelectCategory(cat: Category) {
    setSelectedCatId(cat.id);
    setAmountInput(cat.budget_monthly ? String(cat.budget_monthly) : "");
  }

  function handleAddIncrement(inc: number) {
    const current = amountInput ? Number(amountInput) : 0;
    setAmountInput(String(current + inc));
  }

  async function writeBudget(catId: string, numeric: number | null) {
    if (!user?.id) return;
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const updated = await updateCategory(supabase, user.id, catId, { budget_monthly: numeric });
    if (numeric != null) {
      await supabase.from("category_budget_history").insert({
        user_id: user.id,
        category_id: catId,
        effective_from: toISODate(new Date()),
        budget_monthly: numeric,
      });
    }
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, ...updated } : c)));
  }

  async function handleSave() {
    if (!selectedCatId) return;
    setSaving(true);
    try {
      const raw = amountInput.trim().replace(/[^0-9.]/g, "");
      const numeric = raw && Number(raw) > 0 ? Number(raw) : null;
      await writeBudget(selectedCatId, numeric);
      showToast(numeric ? t("studioBudgetSet").replace("{amount}", money(numeric)) : t("studioLimitCleared"));
      onSaved?.();
    } catch (err) {
      setAlert({
        title: t("error"),
        message: err instanceof Error ? err.message : t("catSaveFailed"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearSingle(catId: string) {
    try {
      await writeBudget(catId, null);
      if (selectedCatId === catId) setAmountInput("");
      onSaved?.();
    } catch {
      setAlert({ title: t("error"), message: t("catSaveFailed") });
    }
  }

  const selectedCategory = categories.find((c) => c.id === selectedCatId);

  // Live allocation preview (mobile parity: entered value replaces the
  // selected category's stored cap before save).
  const previewAllocated = useMemo(() => {
    const entered = amountInput && Number(amountInput) > 0 ? Number(amountInput) : 0;
    return categories.reduce((sum, c) => {
      if (c.id === selectedCatId) return sum + entered;
      return sum + (c.budget_monthly ? Number(c.budget_monthly) : 0);
    }, 0);
  }, [categories, selectedCatId, amountInput]);

  const allocationPct = monthlyOverall > 0 ? Math.round((previewAllocated / monthlyOverall) * 100) : 0;
  const isOverAllocated = monthlyOverall > 0 && previewAllocated > monthlyOverall;
  const gaugeColor = isOverAllocated ? "var(--sf-danger)" : "var(--sf-primary)";

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[85] flex items-end justify-center bg-black/70"
        onClick={onClose}
        role="presentation"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t("studioTitle")}
          className="sf-sheet max-h-[92%] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] border border-border bg-surface"
        >
          {/* Sheet header — grab handle + title row */}
          <div className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-4 pb-2 pt-3">
            <div
              aria-hidden
              className="mx-auto mb-2.5 h-1 w-[38px] rounded-full bg-[var(--sf-grab)]"
            />
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sf-studio-chip)]">
                  <Target size={20} className="text-primary" aria-hidden />
                </span>
                <h2 className="truncate text-[17px] font-extrabold leading-6 text-text">
                  {t("studioTitle")}
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label={t("close")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-text transition active:opacity-70"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4 pb-10">
            {/* 1. Live allocation impact gauge */}
            <div
              className="space-y-2 rounded-[16px] border-[1.5px] bg-[var(--sf-studio-gauge-bg)] p-3.5"
              style={{ borderColor: gaugeColor }}
            >
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Wallet size={15} style={{ color: gaugeColor }} className="shrink-0" aria-hidden />
                  <p
                    className="min-w-0 truncate text-[10px] font-extrabold uppercase leading-4 tracking-[0.6px]"
                    style={{ color: gaugeColor }}
                  >
                    {t("studioIntelligence")}
                  </p>
                </div>
                <p
                  className="shrink-0 text-[11px] font-extrabold"
                  style={{ color: gaugeColor }}
                >
                  {allocationPct}% {isOverAllocated ? t("studioOver") : t("studioAllocated")}
                </p>
              </div>
              <div className="h-[7px] overflow-hidden rounded-full bg-[var(--sf-studio-track)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(allocationPct, 100)}%`,
                    backgroundColor: gaugeColor,
                  }}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-text-muted">
                  {t("studioTotalCaps")}{" "}
                  <b className="font-extrabold text-text">{money(previewAllocated)}</b>
                </p>
                {monthlyOverall > 0 ? (
                  <p
                    className="text-[11px] font-bold"
                    style={{ color: isOverAllocated ? "var(--sf-danger)" : "var(--sf-success)" }}
                  >
                    {isOverAllocated
                      ? t("studioExceeds").replace("{amount}", money(previewAllocated - monthlyOverall))
                      : t("studioBufferLeft").replace("{amount}", money(monthlyOverall - previewAllocated))}
                  </p>
                ) : (
                  <p className="text-[10px] text-text-muted">{t("studioNoCeiling")}</p>
                )}
              </div>
            </div>

            {/* 2. Choose category — horizontal chips */}
            <div className="space-y-2.5">
              <p className="text-[13px] font-extrabold text-text">
                1. {t("studioChooseCat")}
              </p>
              <div className="scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
                {categories.map((cat) => {
                  const isSelected = cat.id === selectedCatId;
                  const hasLimit = Number(cat.budget_monthly) > 0;
                  const G = categoryGlyph(cat.icon);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat)}
                      className={`flex min-w-[102px] shrink-0 flex-col items-center gap-[3px] rounded-[10px] border-[1.5px] px-2.5 py-[7px] transition active:scale-[0.94] ${
                        isSelected
                          ? "border-primary bg-[var(--sf-studio-chip)]"
                          : "border-border bg-surface-elevated"
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-full ${
                          isSelected
                            ? "bg-[var(--sf-studio-icon)]"
                            : "bg-[var(--sf-studio-icon-idle)]"
                        }`}
                      >
                        <G size={16} className={isSelected ? "text-primary" : "text-text"} aria-hidden />
                      </span>
                      <span
                        className={`max-w-full truncate text-xs ${
                          isSelected ? "font-extrabold text-primary" : "font-bold text-text"
                        }`}
                      >
                        {cat.name}
                      </span>
                      {hasLimit ? (
                        <span className="mt-px rounded-full border border-[var(--sf-studio-limit-line)] bg-[var(--sf-studio-limit-bg)] px-[7px] py-[1.5px] text-[10.5px] font-black text-[var(--sf-studio-limit-ink)]">
                          {money(Number(cat.budget_monthly))}
                        </span>
                      ) : (
                        <span className="mt-px rounded-full bg-[var(--sf-studio-nolimit-bg)] px-1.5 py-[1.5px] text-[9.5px] font-semibold text-text-muted">
                          {t("catNoLimitShort")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Amount input & quick-add pills */}
            {selectedCategory && (
              <div className="space-y-2.5">
                <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-text">
                  2. {t("studioSetLimitFor")}
                  {(() => {
                    const G = categoryGlyph(selectedCategory.icon);
                    return <G size={15} className="text-primary" aria-hidden />;
                  })()}
                  <span className="truncate text-primary">{selectedCategory.name}</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex h-[50px] min-w-0 flex-1 items-center rounded-[10px] border-[1.5px] border-primary bg-background px-3.5">
                    <span className="mr-2 shrink-0 text-base font-black text-primary">{currency}</span>
                    <input
                      inputMode="numeric"
                      placeholder="e.g. 15000"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="min-w-0 flex-1 bg-transparent text-lg font-black text-text outline-none placeholder:text-text-muted"
                      aria-label={t("studioSetLimitFor")}
                    />
                    {amountInput && (
                      <button
                        onClick={() => setAmountInput("")}
                        aria-label={t("clear")}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--sf-studio-icon-idle)] text-text-muted"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex h-[50px] shrink-0 items-center justify-center rounded-[10px] bg-primary px-[18px] text-[13px] font-bold text-white transition active:scale-[0.96] disabled:opacity-60"
                  >
                    {saving ? (
                      <span
                        aria-hidden
                        className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                      />
                    ) : (
                      t("save")
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[1000, 5000, 10000, 25000].map((inc) => (
                    <button
                      key={inc}
                      onClick={() => handleAddIncrement(inc)}
                      className="rounded-full border border-border bg-surface-elevated px-3 py-[7px] text-xs font-extrabold text-text transition active:scale-[0.92]"
                    >
                      +{money(inc)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Active category limits */}
            <div className="space-y-2 pt-1">
              <p className="text-[13px] font-extrabold text-text">
                {t("studioActiveCaps")} (
                {categories.filter((c) => Number(c.budget_monthly) > 0).length})
              </p>
              {categories.filter((c) => Number(c.budget_monthly) > 0).length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border bg-surface-elevated p-4 text-center">
                  <p className="text-xs italic text-text-muted">{t("studioNoCaps")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {categories
                    .filter((c) => Number(c.budget_monthly) > 0)
                    .map((c) => {
                      const isSelected = c.id === selectedCatId;
                      const G = categoryGlyph(c.icon);
                      return (
                        <div
                          key={c.id}
                          className={`flex min-h-[64px] items-center justify-between gap-2 rounded-[10px] border-[1.5px] px-3 py-2.5 ${
                            isSelected
                              ? "border-primary bg-[var(--sf-studio-chip)]"
                              : "border-border bg-surface-elevated"
                          }`}
                        >
                          <button
                            onClick={() => handleSelectCategory(c)}
                            className="min-w-0 flex-1 space-y-0.5 text-left"
                          >
                            <span className="flex items-center gap-1.5">
                              <G size={16} className="shrink-0 text-primary" aria-hidden />
                              <span className="truncate text-[13px] font-extrabold text-text">
                                {c.name}
                              </span>
                            </span>
                            <span className="block truncate pl-6 text-xs font-extrabold text-primary">
                              {money(Number(c.budget_monthly))}
                              <span className="text-[10px] font-semibold text-text-muted"> /mo</span>
                            </span>
                          </button>
                          <button
                            onClick={() => void handleClearSingle(c.id)}
                            aria-label={`${t("catDelete")} — ${c.name}`}
                            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-[var(--sf-studio-clear-line)] bg-[var(--sf-studio-clear-bg)] text-danger transition active:scale-[0.88]"
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {alert && (
        <MobileConfirmDialog
          open
          title={alert.title}
          message={alert.message}
          confirmLabel="OK"
          onConfirm={() => setAlert(null)}
          onCancel={() => setAlert(null)}
        />
      )}
    </>,
    document.body,
  );
}
