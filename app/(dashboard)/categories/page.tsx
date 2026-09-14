"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { formatMoney, toISODate } from "@/utils/format";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/services/categories";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { categoryGlyph } from "@/components/ui/Glyph";
import { CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";
import {
  CATEGORY_ICONS,
  EMOJI_TO_ICON_NAME,
  INCOME_ICON_NAMES,
  SELECTABLE_CATEGORY_ICONS,
  categoryColorForIcon,
} from "@/constants/categoryIcons";
import type { Category } from "@/types/database.types";

const TYPE_COLORS = {
  expense: "#a5442b",
  income: "#047857",
} as const;

/**
 * Legacy rows store emoji icons (mobile parity); newer picks store Lucide
 * names. The editor always works in names, resolving any stored emoji once
 * on load so the strip shows a selection for old rows too.
 */
function toIconName(stored: string | null | undefined): string {
  if (!stored) return "tag";
  const lower = stored.trim().toLowerCase();
  if (CATEGORY_ICONS[lower]) return lower;
  return EMOJI_TO_ICON_NAME[stored.trim()] ?? "tag";
}

/**
 * Categories — register of classification keys with optional monthly limits.
 * The flow switcher doubles as the summary band (each flow is a stat cell
 * with its own accent), and keys read as a tile grid: tinted glyph, name,
 * limit line, inline edit/delete. The editor opens with a live tile preview
 * so the key is seen exactly as it will file.
 */
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

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const currencySymbol =
    CURRENCY_DETAILS[displayCurrency as CurrencyCode]?.symbol ?? displayCurrency;
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));
  const visible = categories.filter((c) => c.type === flow);
  const totalBudgets = visible.reduce((s, c) => s + (c.budget_monthly ?? 0), 0);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

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
    <main className="mx-auto w-full max-w-[1080px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">{t("catEyebrow")}</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("category")}</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <Button onClick={openNew}>
          <Plus size={14} /> {t("addNewCategory")}
        </Button>
      </header>

      {/* Flow statement band — the switcher IS the summary: tap a flow cell
          to file by it; the third cell totals the active flow's limits.
          Always three across, compact figures on narrow screens. */}
      <div className="panel mb-4 grid grid-cols-3 divide-x divide-border">
        {(["expense", "income"] as const).map((f) => {
          const active = flow === f;
          const count = categories.filter((c) => c.type === f).length;
          return (
            <button
              key={f}
              onClick={() => setFlow(f)}
              aria-pressed={active}
              className={`relative min-w-0 px-3 py-3.5 text-left transition-colors sm:px-5 sm:py-4 ${
                active ? "bg-surface-elevated/50" : "hover:bg-surface-elevated/30"
              }`}
            >
              <span
                className="absolute inset-x-0 top-0 h-0.5 transition-opacity"
                style={{ backgroundColor: TYPE_COLORS[f], opacity: active ? 1 : 0 }}
                aria-hidden
              />
              <p className="caps flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[f] }}
                  aria-hidden
                />
                <span className="truncate">
                  {t(f)}
                  <span className="hidden sm:inline"> {t("catKeys")}</span>
                </span>
              </p>
              <p className="figures mt-1.5 text-xl font-bold text-text sm:text-2xl">{count}</p>
              <p className="stamp mt-0.5 hidden sm:block">
                {count} {t("catKeys")}
              </p>
            </button>
          );
        })}
        <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
          <p className="caps truncate">{t("catLimitsSet")}</p>
          <p className="figures mt-1.5 text-xl font-bold text-text sm:text-2xl">
            {fmt(totalBudgets)}
          </p>
          <p className="stamp mt-0.5 truncate">
            <span className="hidden sm:inline">{t(flow)} · </span>
            {t("catPerMonth")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:gap-2.5 sm:p-5 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[66px] w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={t("category")}
          message={t("catAddFirst")}
          action={
            <Button onClick={openNew}>
              <Plus size={14} /> {t("addNewCategory")}
            </Button>
          }
        />
      ) : (
        <Panel
          label={`${t("category")} — ${visible.length}`}
          action={<span className="caps-faint">{t(flow)}</span>}
        >
          {/* Compact register tiles — color chip + name + limit line, the
              whole tile opens the editor, delete rides on hover (always
              visible on touch). Mobile-first: 2 → 3 → 4 columns. */}
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:gap-2.5 sm:p-5 xl:grid-cols-4">
            {visible.map((c) => {
              const G = categoryGlyph(c.icon);
              return (
                <div
                  key={c.id}
                  className="group relative flex items-center gap-3 border border-border bg-surface p-3 transition-colors hover:border-text-muted/50 hover:bg-surface-elevated/40"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center border"
                    style={{
                      borderColor: `${c.color}55`,
                      backgroundColor: `${c.color}14`,
                      color: c.color ?? undefined,
                    }}
                    aria-hidden
                  >
                    <G size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-text sm:text-sm">
                      {c.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                      {c.is_custom && (
                        <span className="caps shrink-0 border border-brass/40 px-1 py-px !text-brass">
                          {t("catCustom")}
                        </span>
                      )}
                      <span className="truncate">
                        {c.budget_monthly != null ? (
                          <>
                            <span className="numeric font-bold text-text">
                              {c.budget_monthly.toLocaleString(locale)}
                            </span>{" "}
                            · {t("catPerMonth")}
                          </>
                        ) : (
                          t("catNoLimit")
                        )}
                      </span>
                    </p>
                  </div>
                  {/* Tile-wide tap target → editor. */}
                  <button
                    onClick={() => {
                      setEditing(c);
                      setEditorOpen(true);
                    }}
                    aria-label={`${t("catEdit")} — ${c.name}`}
                    title={t("catEdit")}
                    className="absolute inset-0"
                  />
                  {/* Delete sits above the tap target. */}
                  <button
                    onClick={() => setConfirmDelete(c)}
                    aria-label={`${t("catDelete")} — ${c.name}`}
                    title={t("catDelete")}
                    className="relative z-10 shrink-0 p-1.5 text-faint transition-colors hover:text-danger focus-visible:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}

            {/* Dashed add-tile — one-tap key creation in the grid itself. */}
            <button
              onClick={openNew}
              className="flex min-h-[66px] flex-col items-center justify-center gap-1 border border-dashed border-border bg-transparent text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <Plus size={16} aria-hidden />
              <span className="caps">{t("addNewCategory")}</span>
            </button>
          </div>
        </Panel>
      )}

      <CategoryEditor
        open={editorOpen}
        category={editing}
        flow={flow}
        userId={user?.id}
        currencySymbol={currencySymbol}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setEditorOpen(false);
          setEditing(null);
          showToast(t("saved"), "success");
          await load();
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title={t("catDeleteConfirmTitle")}
        body={t("catDeleteConfirmBody")}
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
  currencySymbol,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: Category | null;
  flow: "expense" | "income";
  userId?: string;
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const supabase = getSupabaseBrowserClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState(() => categoryColorForIcon("tag"));
  const [budget, setBudget] = useState("");
  const [type, setType] = useState<"expense" | "income">(flow);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    const seedIcon = toIconName(category?.icon);
    setIcon(seedIcon);
    setColor(category?.color || categoryColorForIcon(seedIcon));
    setBudget(category?.budget_monthly != null ? String(category.budget_monthly) : "");
    setType(category?.type ?? flow);
  }, [open, category, flow]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !name.trim()) return;
    setSaving(true);
    try {
      const budgetMonthly = budget.trim() === "" ? null : Number(budget);
      if (category) {
        await updateCategory(supabase, userId, category.id, {
          name: name.trim(),
          icon,
          color,
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
          color,
          type,
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
      showToast(e instanceof Error ? e.message : t("catSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const PreviewGlyph = categoryGlyph(icon);
  const accentColor = TYPE_COLORS[type];
  const selectedIcon = SELECTABLE_CATEGORY_ICONS.find((i) => i.name === icon);

  // Icon strip filtered by the key's register: money-inflow icons for income,
  // spending icons for expense. When editing, a stored icon outside the set
  // (e.g. legacy "tag" on an income row) is pinned to the front so the current
  // value always shows. New keys auto-pick the first fitting icon on a flip.
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
    <Modal
      open={open}
      title={category ? t("catModalEdit") : t("catModalNew")}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={submit} className="space-y-4 px-4 pt-4 sm:px-5">
        {/* Flow strip — which register this key files under. Selectable when
            creating; fixed when editing (moving a key between registers would
            orphan its entries). */}
        {category ? (
          <div
            className="flex items-center justify-between border px-3 py-2"
            style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0d` }}
          >
            <span className="caps flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: accentColor }}
                aria-hidden
              />
              {t(type === "expense" ? "expenseCategory" : "incomeCategory")}
            </span>
            <span className="caps-faint">{t("catSaveChanges")}</span>
          </div>
        ) : (
          <div>
            <p className="caps mb-1.5">{t("category")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((f) => {
                const active = type === f;
                const c = TYPE_COLORS[f];
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setType(f)}
                    aria-pressed={active}
                    className={`relative border px-3 py-2.5 text-left transition-colors ${
                      active ? "" : "border-border bg-input hover:border-text-muted"
                    }`}
                    style={
                      active
                        ? { borderColor: `${c}80`, backgroundColor: `${c}14` }
                        : undefined
                    }
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-0.5 transition-opacity"
                      style={{ backgroundColor: c, opacity: active ? 1 : 0 }}
                      aria-hidden
                    />
                    <span className="caps flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: c }}
                        aria-hidden
                      />
                      {t(f === "expense" ? "expenseCategory" : "incomeCategory")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Live preview — the key exactly as it will file in the grid. */}
        <div className="panel-flush relative px-4 py-4">
          <span className="stamp absolute right-3 top-2">{t("catLivePreview")}</span>
          <div className="mt-2 flex items-center gap-3.5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center border"
              style={{
                borderColor: `${color}55`,
                backgroundColor: `${color}14`,
                color,
              }}
              aria-hidden
            >
              <PreviewGlyph size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text">
                {name.trim() || <span className="text-faint">{t("catModalName")}</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {budget.trim() !== "" && Number(budget) >= 0 ? (
                  <>
                    <span className="numeric font-bold text-text">
                      {currencySymbol} {Number(budget).toLocaleString()}
                    </span>{" "}
                    · {t("catPerMonth")}
                  </>
                ) : (
                  t("catNoLimit")
                )}
              </p>
            </div>
          </div>
        </div>

        <Input
          label={t("catModalName")}
          required
          maxLength={40}
          placeholder={t("catNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* Icon grid — compact tiles; picking an icon also seeds its color
            (web-only divergence, see `categoryColorForIcon`). */}
        <div>
          <p className="caps mb-1">{t("selectIcon")}</p>
          <div
            role="group"
            aria-label={t("selectIcon")}
            className="flex flex-wrap gap-1.5"
          >
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
                  className={`relative flex h-9 w-9 items-center justify-center border-2 transition active:scale-[0.95] sm:h-10 sm:w-10 ${
                    selected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-input text-text hover:border-text-muted"
                  }`}
                >
                  <item.icon size={20} />
                </button>
              );
            })}
          </div>
          <p className="caps-faint mt-1.5">
            {t("catSelectedIcon")}: {selectedIcon?.label ?? "—"}
          </p>
        </div>

        <Input
          label={t("catMonthlyBudget")}
          type="number"
          min="0"
          step="any"
          placeholder={t("catBudgetPlaceholder")}
          leftAdornment={<span className="text-sm font-bold">{currencySymbol}</span>}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />

        <div className="end-rule flex justify-end gap-2 pt-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
            {t("cancel")}
          </Button>
          <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
            {category ? t("catSaveChanges") : t("catCreate")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
