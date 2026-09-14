"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Pencil, Repeat } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { formatMoney } from "@/utils/format";
import { resolveReceiptUrl, resolveReceiptDownloadUrl } from "@/services/receipts";
import { accountGlyph, categoryGlyph } from "@/components/ui/Glyph";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { ExpenseRow } from "@/services/expenses";

interface ExpenseDetailSheetProps {
  row: ExpenseRow | null;
  /** Converted display-currency amount, already privacy-masked by the parent. */
  amount: string;
  displayCurrency: string;
  onClose: () => void;
}

/**
 * The web-only drill-in: the full record with everything the APK's detail
 * modal hides — exact FX math (rate snapshot + USD base), time, linked
 * account, recurring provenance, created/updated stamps. Ledger hairline
 * rows; privacy mask flows through the masked `amount` prop and `mask()`.
 */
export function ExpenseDetailSheet({ row, amount, displayCurrency, onClose }: ExpenseDetailSheetProps) {
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  // Private bucket: resolve the stored path to a 1 h signed URL on display
  // (never persisted — mobile useReceiptUrl parity, docs/SECURITY.md).
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  // Audit P2-2: "open" links use a forced-download signed URL so a stored
  // object can never render top-level on the storage origin.
  const [receiptDownloadUrl, setReceiptDownloadUrl] = useState<string | null>(null);
  const [receiptFailed, setReceiptFailed] = useState(false);
  useEffect(() => {
    setReceiptUrl(null);
    setReceiptDownloadUrl(null);
    setReceiptFailed(false);
    if (!row?.receipt_image_url) return;
    let cancelled = false;
    const client = getSupabaseBrowserClient();
    void Promise.all([
      resolveReceiptUrl(client, row.receipt_image_url),
      resolveReceiptDownloadUrl(client, row.receipt_image_url),
    ])
      .then(([inline, download]) => {
        if (!cancelled) {
          setReceiptUrl(inline);
          setReceiptDownloadUrl(download);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [row?.id, row?.receipt_image_url]);
  if (!row) return null;

  const isIncome = row.type === "income";
  const CategoryGlyph = categoryGlyph(row.categories?.icon);
  const original = mask(formatMoney(row.amount, row.currency, locale));
  const dtLong = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const timeLabel = row.time
    ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
        new Date(`${row.date}T${row.time}`),
      )
    : null;

  return (
    <SlideOver
      open={!!row}
      title="Transaction record"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-text-muted"
          >
            Close
          </button>
          <Link
            href={`/expense/${row.id}`}
            onClick={onClose}
            className="inline-flex h-9 items-center gap-2 border border-primary bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-primary-strong"
          >
            <Pencil size={13} /> Edit entry
          </Link>
        </div>
      }
    >
      {/* Header: category + type + hero amount */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-text">
            <CategoryGlyph
              size={14}
              style={{ color: row.categories?.color ?? "var(--sf-faint)" }}
              aria-hidden
            />
            {row.categories?.name ?? "—"}
          </span>
          <span
            className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
              isIncome ? "border-income text-income" : "border-danger text-danger"
            }`}
          >
            {isIncome ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
            {t(isIncome ? "income" : "expense")} · {isIncome ? "Credit" : "Debit"}
          </span>
        </div>
        <p
          className={`figures mt-3 break-all text-[34px] font-bold leading-none ${
            isIncome ? "text-income" : "text-text"
          }`}
        >
          {amount}
        </p>
        {row.currency !== displayCurrency && (
          <p className="mt-1.5 text-xs text-text-muted">
            Recorded: <span className="numeric font-bold text-text">{original}</span> ({row.currency})
          </p>
        )}
        {/* The line the APK never shows: exact FX math on the stored snapshot. */}
        {row.exchange_rate_to_usd != null && (
          <p className="stamp mt-2 leading-relaxed">
            1 {row.currency} = {row.exchange_rate_to_usd.toFixed(6)} USD
            {row.currency !== "USD" && (
              <> · base ≈ {mask(formatMoney(row.amount * row.exchange_rate_to_usd, "USD", locale))}</>
            )}
            {" "}
            · snapshot {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${row.date}T00:00:00`))}
            {row.base_currency ? ` · basis ${row.base_currency}` : ""}
          </p>
        )}
      </div>

      {/* Field register */}
      <div className="border-t border-border px-5">
        <Field label="Description">{row.description || "—"}</Field>
        <Field label="Date">
          {new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date(`${row.date}T00:00:00`))}
          {timeLabel ? ` · ${timeLabel}` : ""}
        </Field>
        <Field label={row.bank_accounts?.name ? (isIncome ? "Received into" : "Paid from") : "Account"}>
          {row.bank_accounts ? (
            <span className="inline-flex items-center gap-2">
              {(() => {
                const AccountGlyph = accountGlyph(row.bank_accounts!.icon, row.bank_accounts!.account_type);
                return (
                  <AccountGlyph size={14} style={{ color: row.bank_accounts!.color }} aria-hidden />
                );
              })()}
              {row.bank_accounts.name}
              <span className="text-faint">· {row.bank_accounts.account_type}</span>
            </span>
          ) : (
            <span className="text-faint">Not tracked to an account</span>
          )}
        </Field>
        <Field label="Payment channel">{row.payment_method}</Field>
        <Field label="Recurrence">
          {row.is_recurring || row.recurring_rule_id ? (
            <Link
              href="/recurring"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
            >
              <Repeat size={12} /> Generated by a recurring rule
            </Link>
          ) : (
            <span className="text-faint">One-off entry</span>
          )}
        </Field>
        <Field label="Notes">{row.notes || <span className="text-faint">—</span>}</Field>
        <Field label="Receipt">
          {row.receipt_image_url ? (
            receiptUrl && !receiptFailed ? (
              <a
                href={receiptDownloadUrl ?? receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-col items-end gap-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptUrl}
                  alt="Attached receipt"
                  onError={() => setReceiptFailed(true)}
                  className="h-28 w-28 border border-border object-cover transition hover:opacity-90"
                />
                <span className="stamp">Tap to save full size</span>
              </a>
            ) : (
              <a
                href={receiptDownloadUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
              >
                <ExternalLink size={13} /> Open receipt
              </a>
            )
          ) : (
            <span className="text-faint">None</span>
          )}
        </Field>
        <Field label="Recorded">
          <span className="numeric text-xs">{dtLong.format(new Date(row.created_at))}</span>
        </Field>
        {row.updated_at !== row.created_at && (
          <Field label="Last updated">
            <span className="numeric text-xs">{dtLong.format(new Date(row.updated_at))}</span>
          </Field>
        )}
      </div>

      <div className="px-5 py-4">
        <p className="stamp">Form SF-01 · record ref {row.id.slice(0, 8).toUpperCase()}</p>
      </div>
    </SlideOver>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border/60 py-2.5 last:border-0">
      <span className="caps-faint shrink-0 pt-0.5">{label}</span>
      <span className="min-w-0 text-right text-sm text-text">{children}</span>
    </div>
  );
}
