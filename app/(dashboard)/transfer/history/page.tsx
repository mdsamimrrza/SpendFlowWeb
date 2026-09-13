"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney } from "@/utils/format";
import { deleteTransfer, listTransfers, type TransferRow } from "@/services/transfers";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Transfer log — chronological register of internal movements. */
export default function TransferHistoryPage() {
  const { user, profile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<TransferRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setRows(await listTransfers(supabase, user.id));
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.from_account?.name ?? "").toLowerCase().includes(q) ||
        (r.to_account?.name ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteTransfer(supabase, confirmDelete.id);
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
          <p className="caps !text-primary-strong">Register</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Transfer log</h1>
          <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts or memo…"
              aria-label="Search transfers"
              className="h-9 w-52 border border-border bg-input pl-8 pr-3 text-sm text-text placeholder:text-faint focus:border-primary focus:outline-none"
            />
          </div>
          <Link href="/transfer">
            <Button variant="secondary">New transfer</Button>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="panel space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No transfers"
          message={rows.length === 0 ? "Internal movements between accounts appear here." : "No matches for your search."}
        />
      ) : (
        <Panel label={`Entries — ${filtered.length}`}>
          <div>
            {filtered.map((r) => (
              <div key={r.id} className="group flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-border text-text-muted" aria-hidden>
                  <ArrowRight size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {r.from_account?.name ?? "—"}{" "}
                    <ArrowRight size={11} className="inline text-faint" /> {r.to_account?.name ?? "—"}
                  </p>
                  <p className="truncate text-[11px] text-faint">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
                      new Date(`${r.date}T00:00:00`),
                    )}
                    {r.notes ? ` · ${r.notes}` : ""}
                    {r.fee > 0 ? ` · fee ${fmt(r.fee)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="numeric text-sm font-extrabold text-text">
                    {CURRENCY(r.from_currency)}
                    {fmt(r.amount).replace(/^[^\d]*/, "")}
                  </p>
                  {r.from_currency !== r.to_currency && (
                    <p className="text-[10px] text-faint">
                      @ {r.exchange_rate.toFixed(4)} → {CURRENCY(r.to_currency)}
                      {fmt(r.converted_amount).replace(/^[^\d]*/, "")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDelete(r)}
                  aria-label="Delete transfer"
                  className="p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete transfer"
        body="The movement is removed from both account balances."
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </main>
  );
}

function CURRENCY(code: string): string {
  const symbols: Record<string, string> = {
    NPR: "रू", INR: "₹", USD: "$", QAR: "﷼", GBP: "£", AED: "د.إ",
    SAR: "﷼", MYR: "RM", KRW: "₩", JPY: "¥", AUD: "A$", CAD: "C$",
  };
  return symbols[code] ?? "";
}
