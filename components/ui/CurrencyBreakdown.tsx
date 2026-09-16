"use client";

/**
 * Currency-consistency breakdown (user request 2026-09-16; restyled same day):
 * a totals figure that merges multiple currencies never renders as one
 * converted number alone — this lists the raw per-currency subtotals as an
 * aligned mini-ledger (flag · code · raw · ≈ converted) in a hairline card.
 * Renders nothing when every amount is already in one currency. Callers format
 * via formatMoney + mask() so privacy mode keeps working exactly like every
 * other figure on the screen.
 */
import { useLanguage } from "@/store/LanguageContext";
import { CurrencyFlag } from "@/components/ui/CurrencyFlag";

export interface CurrencyPart {
  /** ISO code used for the flag chip. */
  currency: string;
  /** Raw subtotal, already formatted in its own currency (masked if needed). */
  rawText: string;
  /** Equivalent in the display currency; omit for display-currency parts. */
  convertedText?: string;
}

export function CurrencyBreakdown({
  label,
  parts,
  className = "",
}: {
  label?: string;
  parts: CurrencyPart[];
  className?: string;
}) {
  const { t } = useLanguage();
  if (parts.length <= 1) return null;
  return (
    <div
      className={`rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5 ${className}`}
      aria-label={t("curBreakdownAria")}
    >
      {label && (
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      )}
      <div className="space-y-1">
        {parts.map((p) => (
          <div key={p.currency} className="flex items-center gap-2 text-[11.5px] leading-4">
            <CurrencyFlag currency={p.currency} size={14} />
            <span className="w-9 shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">
              {p.currency}
            </span>
            <span className="figures min-w-0 truncate font-bold text-text">{p.rawText}</span>
            {p.convertedText && (
              <span className="figures ml-auto shrink-0 text-faint">≈&nbsp;{p.convertedText}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
