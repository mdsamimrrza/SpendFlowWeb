"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { Skeleton } from "@/components/ui/Skeleton";
import { resetAlertHistory } from "@/services/alerts";
import {
  listNotifications,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/services/notifications";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/**
 * Alert ledger — the notifications table stops being write-only. Bell +
 * unread badge in the masthead; a dropdown panel anchored under the bell
 * browses persisted milestone alerts (APK Settings→Notifications
 * counterpart), mark-all-read, and the alert suppression reset.
 */
export function AlertBell({ buttonClassName }: { buttonClassName?: string }) {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listNotifications(supabase, user.id);
      setItems(rows);
      setUnread(rows.filter((r) => !r.is_read).length);
    } catch {
      // best-effort — same tolerance as the alert writer
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const close = useCallback(() => {
    setOpen(false);
    bellRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const onToggle = () => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    void refresh();
  };

  const markAll = async () => {
    if (!user) return;
    try {
      await markAllNotificationsRead(supabase, user.id);
    } catch {
      // silent — refresh still shows truth
    }
    void refresh();
  };

  const resetSuppress = () => {
    if (!user) return;
    const n = resetAlertHistory(user.id);
    showToast(n > 0 ? `${n} ${t("alertResetDone")}` : t("alertResetNone"), "info");
  };

  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const typeLabel = (type: string) =>
    type === "budget_threshold" ? t("budget") : type === "category_threshold" ? t("category") : type;

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `${t("alerts")} — ${unread} ${t("alertsUnreadCount")}` : t("alerts")}
        className={`relative grid place-items-center text-text-muted transition-colors hover:text-text ${buttonClassName ?? "p-2"}`}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 text-[9px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away layer — same trick as the account menu */}
          <button
            aria-label={t("close")}
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label={t("alertLedger")}
            className="panel absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[min(72vh,560px)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl shadow-pop outline-none"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="caps">{t("alertLedger")}</span>
              <span className="caps-faint text-[10px]">
                {unread > 0 ? `${unread} ${t("alertsUnreadCount")}` : ""}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {loading && items.length === 0 ? (
                <div className="space-y-3" aria-busy="true" aria-label={t("loading")}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="border border-dashed border-border px-3 py-10 text-center">
                  <span className="caps">{t("noAlerts")}</span>
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {items.map((n) => (
                    <li key={n.id} className={`py-3 first:pt-0 last:pb-0 ${n.is_read ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-bold text-text">{n.title}</p>
                        <span className="caps shrink-0 border border-border px-1.5 py-0.5 text-faint">
                          {typeLabel(n.type)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">{n.body}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <p className="stamp">{stamp.format(new Date(n.created_at))}</p>
                        {!n.is_read && (
                          <span className="caps border border-primary px-1.5 py-0.5 text-primary">
                            {t("alertNewTag")}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="shrink-0 border-t border-border px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={resetSuppress}
                  className="text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-danger"
                >
                  {t("resetSuppression")}
                </button>
                <button
                  onClick={() => void markAll()}
                  disabled={unread === 0}
                  className="h-8 rounded-full border border-primary px-3.5 text-xs font-bold uppercase tracking-[0.08em] text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-40"
                >
                  {t("markAllRead")}
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-faint">{t("alertHelp")}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
