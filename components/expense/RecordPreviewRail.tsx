"use client";

import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Eye, Paperclip, Type as TypeIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/store/LanguageContext";

export interface RailPreview {
  flowType: "expense" | "income";
  category: { name: string | null; icon: LucideIcon | null; color: string | null };
  /** Signed + currency-formatted entry amount, masked. `null` → placeholder. */
  signedAmount: string | null;
  /** FX line — null when entry currency equals the display currency. */
  fx: { text: string; pending: boolean } | null;
  account: { name: string; type: string; icon: LucideIcon | null } | null;
  paymentMethod: string | null;
  recurrence: string | null;
  description: string;
  dateLabel: string;
  /** Masked note text — empty string when none. */
  notes: string;
  hasReceipt: boolean;
  /** Budget impact bar; null when no budget is configured. */
  budget: {
    spent: string;
    added: string | null;
    limit: string;
    pct: number;
    /** Budget minus spend including this entry, masked — null when budget absent. */
    remaining: string;
  } | null;
  /** Balance-after-save impact line; null when no account linked. */
  afterSave: { label: string; value: string; negative: boolean; icon: LucideIcon | null } | null;
  meta: { ref: string | null; recorded: string | null; edited: string | null };
}

/**
 * Live record preview, rendered from form state. Two variants:
 * `full` — the exact 1:1 record sheet, used on mobile where Save pops it as
 * the review step (no rail on the phone); `compact` — the desktop rail, which
 * carries only what the form itself doesn't already show (amount + FX
 * snapshot, budget impact, balance-after-save, ref) so the field list is
 * never read twice side-by-side.
 */
export function RecordPreviewRail({
  preview,
  variant = "full",
}: {
  preview: RailPreview;
  variant?: "full" | "compact";
}) {
  const { t } = useLanguage();
  const isIncome = preview.flowType === "income";
  const accent = isIncome ? "text-income" : "text-danger";

  const header = (
    <div className="panel-rule flex items-center justify-between px-4 py-2.5">
      <span className="caps inline-flex items-center gap-1.5">
        <Eye size={12} /> {t("recordPreview")}
      </span>
      <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
        isIncome ? "border-income text-income" : "border-danger text-danger"
      }`}
      >
        {isIncome ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
        {t(isIncome ? "income" : "expense")} · {isIncome ? t("credit") : t("debit")}
      </span>
    </div>
  );

  const hero = (
    <div className="px-4 py-3.5">
      <p className="flex items-center gap-2 text-sm font-bold text-text">
        {preview.category.icon ? (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center border"
            style={{
              color: preview.category.color ?? undefined,
              backgroundColor: preview.category.color ? `${preview.category.color}1f` : undefined,
              borderColor: preview.category.color ? `${preview.category.color}55` : undefined,
            }}
            aria-hidden
          >
            <preview.category.icon size={15} />
          </span>
        ) : null}
        {preview.category.name ?? <span className="text-faint">{t("placeholderCategory")}</span>}
      </p>
      <p className={`figures mt-2.5 break-all text-[26px] font-bold leading-none ${accent}`}>
        {preview.signedAmount ?? (
          <span className="text-faint">
            {isIncome ? "+ " : "- "}
            {t("placeholderAmount")}
          </span>
        )}
      </p>
      {preview.fx ? (
        <p className="stamp mt-2 leading-relaxed">
          {preview.fx.pending ? t("fxPending") : preview.fx.text}
        </p>
      ) : null}
    </div>
  );

  if (variant === "compact") {
    return (
      <section className="panel">
        {header}
        {hero}
        {(preview.budget || preview.afterSave) && (
          <div className="border-t border-border px-4 py-3.5">
            <ImpactLines preview={preview} accent={accent} />
          </div>
        )}
        <div className="border-t border-border px-4 py-2.5">
          <p className="stamp">
            Form SF-01 ·{" "}
            {preview.meta.ref ? (
              <>
                {t("recordRef")} {preview.meta.ref}
                {preview.meta.edited ? (
                  <>
                    {" "}
                    · <TypeIcon size={9} className="inline" aria-hidden />{" "}
                    <span className="numeric">{preview.meta.edited}</span>
                  </>
                ) : null}
              </>
            ) : (
              t("refOnSave")
            )}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Live record preview ── */}
      <section className="panel">
        {header}
        {hero}

        <div className="border-t border-border px-4">
          <RailRow label={t("description")}>
            {preview.description || <span className="text-faint">—</span>}
          </RailRow>
          <RailRow label={t("date")}>{preview.dateLabel}</RailRow>
          <RailRow label={isIncome ? t("receivedInto") : t("paidFrom")}>
            {preview.account ? (
              <span className="inline-flex items-center gap-1.5">
                {preview.account.icon ? <preview.account.icon size={13} aria-hidden /> : null}
                {preview.account.name}
                <span className="text-faint">· {preview.account.type}</span>
              </span>
            ) : (
              <span className="text-faint">{t("notTracked")}</span>
            )}
          </RailRow>
          <RailRow label={t("paymentChannel")}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {preview.paymentMethod ?? "—"}
              {preview.recurrence ? (
                <span className="border border-border px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  {preview.recurrence}
                </span>
              ) : null}
            </span>
          </RailRow>
          <RailRow label={t("notes")}>
            {preview.notes ? <span className="text-text">{preview.notes}</span> : <span className="text-faint">—</span>}
          </RailRow>
          <RailRow label={t("receipt")}>
            {preview.hasReceipt ? (
              <span className="inline-flex items-center gap-1 border border-income/40 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-income">
                <Paperclip size={10} aria-hidden /> {t("attached")}
              </span>
            ) : (
              <span className="text-faint">{t("none")}</span>
            )}
          </RailRow>
        </div>

        <div className="end-rule px-4 py-3">
          <p className="stamp">
            Form SF-01 ·{" "}
            {preview.meta.ref ? (
              <>
                {t("recordRef")} {preview.meta.ref} · {t("recorded")}{" "}
                <span className="numeric">{preview.meta.recorded}</span>
                {preview.meta.edited ? (
                  <>
                    {" "}
                    · <TypeIcon size={9} className="inline" aria-hidden /> {preview.meta.edited}
                  </>
                ) : null}
              </>
            ) : (
              t("refOnSave")
            )}
          </p>
        </div>
      </section>

      {/* ── Impact lines ── */}
      {(preview.budget || preview.afterSave) && (
        <section className="panel">
          <div className="panel-rule px-4 py-2.5">
            <span className="caps">{t("impact")}</span>
          </div>
          <div className="space-y-3 px-4 py-3.5">
            <ImpactLines preview={preview} accent={accent} />
          </div>
        </section>
      )}
    </div>
  );
}

/** Budget bar + balance-after-save — shared by both variants. */
function ImpactLines({
  preview,
  accent,
}: {
  preview: RailPreview;
  accent: string;
}) {
  const { t } = useLanguage();
  return (
    <>
      {preview.budget ? (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-text-muted">{t("budgetThisCycle")}</span>
            <span className="numeric font-bold text-text">
              {preview.budget.spent}
              {preview.budget.added ? <span className={accent}> +{preview.budget.added}</span> : null}
              <span className="text-faint"> / {preview.budget.limit}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 border border-border bg-surface-elevated" role="presentation">
            <div
              className={`h-full ${preview.budget.pct >= 100 ? "bg-danger" : preview.budget.pct >= 80 ? "bg-brass" : "bg-income"}`}
              style={{ width: `${Math.min(preview.budget.pct, 100)}%` }}
            />
          </div>
          <p className="stamp mt-1">
            {preview.budget.pct}% · {preview.budget.remaining} {t("remaining")}
          </p>
        </div>
      ) : null}
      {preview.afterSave ? (
        <p
          className={`flex items-baseline justify-between gap-2 text-xs ${
            preview.afterSave.negative ? "font-bold text-danger" : "text-text-muted"
          }`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {preview.afterSave.icon ? <preview.afterSave.icon size={13} aria-hidden /> : null}
            {preview.afterSave.label}
          </span>
          <span className={`numeric shrink-0 font-bold ${preview.afterSave.negative ? "text-danger" : "text-text"}`}>
            {preview.afterSave.value}
          </span>
        </p>
      ) : null}
    </>
  );
}

function RailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="caps-faint shrink-0 pt-0.5">{label}</span>
      <span className="min-w-0 break-words text-right text-[13px] text-text">{children}</span>
    </div>
  );
}
