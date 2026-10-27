"use client";

/**
 * Notifications – full-page alert ledger (the shell bell's panel, as a
 * route): persisted budget/category milestone alerts grouped by day, an
 * All/Unread toggle, unread tinting, mark-all-read and the alert
 * suppression reset. Console styling, tokens only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Home, Tag, Wallet } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import {
  listNotifications,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/services/notifications";
import { resetAlertHistory } from "@/services/alerts";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

type View = "all" | "unread";

export default function NotificationsPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await listNotifications(supabase, user.id));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unread = items.filter((r) => !r.is_read).length;
  const visible = view === "unread" ? items.filter((r) => !r.is_read) : items;

  // Group consecutive alerts by calendar day (newest first).
  const sections = useMemo(() => {
    const out: { date: string; rows: NotificationRow[] }[] = [];
    for (const row of visible) {
      const day = row.created_at.slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.date === day) last.rows.push(row);
      else out.push({ date: day, rows: [row] });
    }
    return out;
  }, [visible]);

  const markAll = async () => {
    if (!user) return;
    try {
      await markAllNotificationsRead(supabase, user.id);
    } catch {
      // silent – refresh shows the truth
    }
    void refresh();
  };

  const resetSuppress = async () => {
    if (!user) return;
    const n = await resetAlertHistory(supabase, user.id);
    showToast(n > 0 ? `${n} ${t("alertResetDone")}` : t("alertResetNone"), "info");
  };

  const TypeIcon = ({ type }: { type: string }) => {
    const Icon = type === "budget_threshold" ? Wallet : type === "category_threshold" ? Tag : Home;
    return <Icon size={15} />;
  };
  const typeLabel = (type: string) =>
    type === "budget_threshold" ? t("budget") : type === "category_threshold" ? t("category") : type;
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    const isoOf = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(d);
    if (isoOf(d) === isoOf(today)) return `Today · ${label}`;
    if (isoOf(d) === isoOf(yest)) return `Yesterday · ${label}`;
    return label;
  };

  return (
    <main className="mx-auto w-full max-w-[900px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-tight text-text">Notifications</h1>
          <p className="mt-1 text-xs text-text-muted">
            Milestone alerts from your budgets and categories.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetSuppress}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-text shadow-soft transition-colors hover:bg-surface-elevated"
          >
            {t("alertLedger")}
          </button>
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-ink shadow-soft transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck size={14} aria-hidden />
            Mark all read
          </button>
        </div>
      </header>

      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
        {/* All / Unread toggle */}
        <div className="flex items-center justify-between border-b border-border p-3 sm:p-3.5">
          <div className="flex items-center rounded-md border border-gray-200/70 bg-[#f7f8f9] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView("all")}
              className={`rounded px-3.5 py-1 font-medium transition-all ${
                view === "all" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setView("unread")}
              className={`rounded px-3.5 py-1 font-medium transition-all ${
                view === "unread" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Unread{unread > 0 ? ` · ${unread}` : ""}
            </button>
          </div>
          {unread > 0 && (
            <span className="numeric rounded-full bg-[var(--sf-tint-sky)] px-2.5 py-1 text-[10px] font-bold text-income">
              {unread} new
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={view === "unread" ? "All caught up" : t("alertLedger")}
            message={view === "unread" ? "No unread alerts right now." : t("alertResetNone")}
          />
        ) : (
          <div>
            {sections.map((section) => (
              <div key={section.date} className="border-t border-border first:border-t-0">
                <p className="px-4 pt-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint sm:px-5">
                  {dayLabel(section.date)}
                </p>
                <ul className="divide-y divide-border">
                  {section.rows.map((n) => (
                    <li
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3.5 sm:px-5 ${
                        n.is_read ? "" : "bg-[var(--sf-tint-sky-soft)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                          n.type === "category_threshold"
                            ? "bg-[var(--sf-chip-beige-bg)] text-[var(--sf-chip-beige-ink)]"
                            : "bg-[var(--sf-chip-blue-bg)] text-[var(--sf-chip-blue-ink)]"
                        }`}
                      >
                        <TypeIcon type={n.type} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            className={`text-[13px] ${
                              n.is_read ? "font-medium text-text-muted" : "font-semibold text-text"
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                            {typeLabel(n.type)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-text-muted">{n.body}</span>
                        <span className="numeric mt-1 block text-[10px] font-medium text-faint">
                          {stamp.format(new Date(n.created_at))}
                        </span>
                      </span>
                      {!n.is_read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
