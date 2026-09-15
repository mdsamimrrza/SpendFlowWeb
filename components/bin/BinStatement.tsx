"use client";

/**
 * Bin — 1:1 web mirror of mobile app/bin.tsx: mobile header bar (back chip,
 * centered title + count, danger "Empty Bin"), amber retention notice, and
 * one rounded card per item (42px category-tinted glyph tile, title, amount +
 * countdown chip, Restore pill, trash button). Same services/behavior as the
 * ledger build (restore / delete-forever / empty-bin, receipt orphan drain).
 */
import { useCallback, useEffect, useState } from "react";
import { Repeat, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useTheme } from "@/store/ThemeContext";
import { useToast } from "@/store/ToastContext";
import {
  MobileConfirmDialog,
  MobileEmptyState,
  MobileHeaderBar,
} from "@/components/ui/MobileChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import { categoryGlyph } from "@/components/ui/Glyph";
import { notifyExpensesChanged } from "@/hooks/useExpenses";
import { useRowConverter } from "@/hooks/useRates";
import { formatMoney, todayISO } from "@/utils/format";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import {
  binDaysLeft,
  deleteBinItemForever,
  drainBinReceiptOrphans,
  emptyBin,
  listBinItems,
  restoreBinItem,
  type BinItem,
} from "@/services/bin";

/** Countdown tone (mobile daysLeftTone): ≤7 danger · ≤21 warn · else income. */
function daysToneVar(days: number): string {
  if (days <= 7) return "var(--sf-danger)";
  if (days <= 21) return "var(--sf-bin-warn)";
  return "var(--sf-income)";
}

function itemTitle(item: BinItem, fallback: string): string {
  const entity = item.kind === "expense" ? item.expense : item.rule;
  return entity.description?.trim() || entity.categories?.name?.trim() || fallback;
}

export interface BinInject {
  items: BinItem[];
}

interface BinStatementProps {
  /** When present, renders the injected statement instead of fetching. */
  inject?: BinInject;
}

export default function BinStatement({ inject }: BinStatementProps) {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { isDark } = useTheme();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [items, setItems] = useState<BinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<BinItem | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);

  // The Bin mixes expenses and plans, so amounts price into the display
  // currency like the rest of the app (expenses keep their own date and
  // snapshot; plans price at today). The native figure stays as the caption.
  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const { convert, ready } = useRowConverter(
    displayCurrency,
    items.map((item) => {
      const e = item.kind === "expense" ? item.expense : item.rule;
      return {
        amount: Number(e.amount) || 0,
        currency: e.currency || displayCurrency,
        date: item.kind === "expense" ? item.expense.date : todayISO(),
        exchange_rate_to_usd:
          item.kind === "expense" ? (item.expense.exchange_rate_to_usd ?? null) : null,
      };
    }),
  );
  const price = (item: BinItem) => {
    const e = item.kind === "expense" ? item.expense : item.rule;
    const value = Number(e.amount) || 0;
    const native = e.currency || displayCurrency;
    const nativeText = mask(formatMoney(value, native, locale));
    if (native === displayCurrency || !ready) return { shown: nativeText, nativeText: null };
    const converted = convert({
      amount: value,
      currency: native,
      date: item.kind === "expense" ? item.expense.date : todayISO(),
      exchange_rate_to_usd:
        item.kind === "expense" ? (item.expense.exchange_rate_to_usd ?? null) : null,
    });
    return converted === value
      ? { shown: nativeText, nativeText: null }
      : { shown: mask(formatMoney(converted, displayCurrency, locale)), nativeText };
  };

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setItems(await listBinItems(supabase, user.id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load the Bin", "error");
    } finally {
      setLoading(false);
    }
  }, [user, supabase, showToast]);

  useEffect(() => {
    if (inject) {
      setItems(inject.items);
      setLoading(false);
      return;
    }
    void load();
    // Cron purges un-root receipt files SQL-side; claim + remove them best-effort.
    void drainBinReceiptOrphans(supabase, user?.id);
  }, [inject, load, supabase, user?.id]);

  const handleRestore = async (item: BinItem) => {
    if (!user || workingId) return;
    setWorkingId(item.id);
    try {
      await restoreBinItem(supabase, user.id, item);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (item.kind === "expense") notifyExpensesChanged();
      showToast(t("bin_restored"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not restore this item", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const confirmPurge = async () => {
    if (!user || !purgeTarget) return;
    setWorkingId(purgeTarget.id);
    try {
      await deleteBinItemForever(supabase, user.id, purgeTarget);
      setItems((current) => current.filter((entry) => entry.id !== purgeTarget.id));
      if (purgeTarget.kind === "expense") notifyExpensesChanged();
      showToast(t("bin_purged"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete this item", "error");
    } finally {
      setWorkingId(null);
      setPurgeTarget(null);
    }
  };

  const confirmEmptyBin = async () => {
    if (!user) return;
    setEmptying(true);
    try {
      await emptyBin(supabase, user.id);
      setItems([]);
      notifyExpensesChanged();
      showToast(t("bin_emptied"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not empty the Bin", "error");
      await load();
    } finally {
      setEmptying(false);
      setEmptyConfirmOpen(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[560px]">
      <MobileHeaderBar
        title={t("bin_title")}
        caption={items.length > 0 ? t("bin_item_count").replace("{count}", String(items.length)) : undefined}
        right={
          <button
            onClick={() => setEmptyConfirmOpen(true)}
            disabled={items.length === 0}
            className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-extrabold text-danger transition active:opacity-70 disabled:opacity-[0.35]"
          >
            {t("bin_empty_bin")}
          </button>
        }
      />

      {/* Retention notice */}
      <div className="mb-3.5 mt-3 rounded-[14px] border border-[var(--sf-bin-notice-line)] bg-[var(--sf-bin-notice-bg)] p-3">
        <p className="text-xs font-semibold leading-[17px] text-text">{t("bin_subtitle")}</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-full rounded-[18px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="pt-6">
          <MobileEmptyState
            icon={Trash2}
            title={t("bin_empty_title")}
            message={t("bin_empty_message")}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const days = binDaysLeft(item.deleted_at);
            const tone = daysToneVar(days);
            const entity = item.kind === "expense" ? item.expense : item.rule;
            const iconColor = entity.categories?.color ?? "var(--sf-primary)";
            const priced = price(item);
            const busy = workingId === item.id;
            const Glyph = item.kind === "expense" ? categoryGlyph(entity.categories?.icon) : Repeat;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-[18px] border border-border bg-surface p-3.5 shadow-[0_2px_8px_var(--sf-set-card-shadow)]"
              >
                <button
                  type="button"
                  onClick={() => void handleRestore(item)}
                  disabled={busy}
                  aria-label={t("bin_restore")}
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] transition disabled:opacity-50"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${iconColor} ${isDark ? "15%" : "10%"}, transparent)`,
                    color: iconColor,
                  }}
                >
                  <Glyph size={20} />
                </button>

                <div className="min-w-0 flex-1 space-y-[3px]">
                  <p className="truncate text-[14.5px] font-bold text-text">
                    {itemTitle(item, item.kind === "expense" ? t("bin_item_expense") : t("bin_item_recurring"))}
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="numeric truncate text-[12.5px] font-bold text-text-muted">
                      {priced.shown}
                      {priced.nativeText ? ` (${priced.nativeText})` : ""}
                      {item.kind === "expense" && item.expense.type === "income"
                        ? ` · ${t("bin_type_income")}`
                        : ""}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-[7px] py-[2.5px]"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`,
                        color: tone,
                      }}
                    >
                      <Trash2 size={10} aria-hidden />
                      <span className="text-[10.5px] font-extrabold">
                        {t("bin_days_left").replace("{days}", String(days))}
                      </span>
                    </span>
                  </p>
                </div>

                {busy ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  />
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleRestore(item)}
                      className="flex items-center gap-[5px] rounded-[10px] bg-[var(--sf-bin-restore-bg)] px-2.5 py-[7px] text-[12px] font-extrabold text-primary transition active:opacity-70"
                    >
                      <RotateCcw size={13} aria-hidden />
                      {t("bin_restore")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurgeTarget(item)}
                      aria-label={t("bin_delete_forever")}
                      className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--sf-bin-purge-bg)] text-danger transition active:opacity-70"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MobileConfirmDialog
        open={purgeTarget !== null}
        title={t("bin_purge_title")}
        message={t("bin_purge_message")}
        confirmLabel={t("bin_delete_forever")}
        cancelLabel={t("cancel")}
        loading={workingId !== null && purgeTarget?.id === workingId}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurgeTarget(null)}
      />
      <MobileConfirmDialog
        open={emptyConfirmOpen}
        title={t("bin_empty_bin")}
        message={t("bin_empty_confirm_message")}
        confirmLabel={t("bin_empty_bin")}
        cancelLabel={t("cancel")}
        loading={emptying}
        onConfirm={() => void confirmEmptyBin()}
        onCancel={() => setEmptyConfirmOpen(false)}
      />
    </main>
  );
}
