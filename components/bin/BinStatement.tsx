"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { categoryGlyph } from "@/components/ui/Glyph";
import { notifyExpensesChanged } from "@/hooks/useExpenses";
import { formatMoney } from "@/utils/format";
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

/** Countdown tone: calm near 60 days, warning under a week, urgent near purge. */
function daysTone(days: number): string {
  if (days <= 7) return "bg-rust-tint text-danger";
  if (days <= 21) return "bg-brass-tint text-brass";
  return "bg-primary-light text-income";
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

/**
 * Bin — Google-Photos-style 60-day trash for deleted expenses and recurring
 * plans. Restore returns an item to its ledger; Delete forever removes the row
 * (and its receipt file) now; Empty Bin clears everything. Mirrors app/bin.tsx.
 */
export default function BinStatement({ inject }: BinStatementProps) {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [items, setItems] = useState<BinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<BinItem | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);

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
    <main className="mx-auto w-full max-w-[880px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="caps !text-primary-strong">{t("registerEyebrow")}</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text">
            {t("bin_title")}
            {items.length > 0 && (
              <span className="caps border border-border bg-surface-elevated/40 px-2 py-1">
                {t("bin_item_count").replace("{count}", String(items.length))}
              </span>
            )}
          </h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <Button
          variant="danger"
          disabled={items.length === 0}
          loading={emptying}
          onClick={() => setEmptyConfirmOpen(true)}
        >
          <Trash2 size={14} /> {t("bin_empty_bin")}
        </Button>
      </header>

      {/* Retention notice */}
      <div className="panel mb-4 flex items-start gap-2.5 border-brass/40 bg-brass-tint/50 px-4 py-3">
        <Trash2 size={15} className="mt-0.5 shrink-0 text-brass" aria-hidden />
        <p className="text-xs font-semibold leading-relaxed text-text">{t("bin_subtitle")}</p>
      </div>

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-faint">
            <Trash2 size={22} aria-hidden />
          </span>
          <p className="caps mt-3">{t("bin_empty_title")}</p>
          <p className="mt-2 max-w-xs text-xs text-text-muted">{t("bin_empty_message")}</p>
        </div>
      ) : (
        <Panel label={`${t("bin_title")} — ${items.length}`}>
          <div>
            {items.map((item, i) => {
              const days = binDaysLeft(item.deleted_at);
              const entity = item.kind === "expense" ? item.expense : item.rule;
              const iconColor = entity.categories?.color ?? "var(--sf-primary)";
              const busy = workingId === item.id;
              const Glyph = item.kind === "expense" ? categoryGlyph(entity.categories?.icon) : Repeat;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${
                    i < items.length - 1 ? "border-b border-border/60" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void handleRestore(item)}
                    disabled={busy}
                    aria-label={t("bin_restore")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-50"
                    style={{ backgroundColor: `${iconColor}1a`, color: iconColor }}
                  >
                    <Glyph size={17} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {itemTitle(item, item.kind === "expense" ? t("bin_item_expense") : t("bin_item_recurring"))}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="numeric text-[11px] font-bold text-text-muted">
                        {mask(formatMoney(Number(entity.amount), entity.currency, locale))}
                        {item.kind === "expense" && item.expense.type === "income"
                          ? ` · ${t("bin_type_income")}`
                          : ""}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${daysTone(days)}`}>
                        <Trash2 size={9} aria-hidden />
                        {t("bin_days_left").replace("{days}", String(days))}
                      </span>
                    </p>
                  </div>
                  {busy ? (
                    <span
                      aria-hidden
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
                    />
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRestore(item)}
                        aria-label={t("bin_restore")}
                        className="flex h-8 items-center gap-1.5 rounded-full bg-primary-light px-3 text-xs font-bold text-primary transition-colors hover:brightness-95"
                      >
                        <RotateCcw size={13} />
                        <span className="hidden sm:inline">{t("bin_restore")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurgeTarget(item)}
                        aria-label={t("bin_delete_forever")}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-rust-tint text-danger transition-colors hover:brightness-95"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <ConfirmDialog
        open={purgeTarget !== null}
        title={t("bin_purge_title")}
        body={t("bin_purge_message")}
        confirmLabel={t("bin_delete_forever")}
        cancelLabel={t("cancel")}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurgeTarget(null)}
      />
      <ConfirmDialog
        open={emptyConfirmOpen}
        title={t("bin_empty_bin")}
        body={t("bin_empty_confirm_message")}
        confirmLabel={t("bin_empty_bin")}
        cancelLabel={t("cancel")}
        onConfirm={() => void confirmEmptyBin()}
        onCancel={() => setEmptyConfirmOpen(false)}
      />
    </main>
  );
}
