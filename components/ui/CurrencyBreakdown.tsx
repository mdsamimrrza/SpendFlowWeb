"use client";

/**
 * Currency-consistency breakdown (user request 2026-09-16): a totals figure
 * that merges multiple currencies never renders as one converted number alone —
 * this lists the raw per-currency subtotals (own flag + already-formatted,
 * already-masked strings supplied by the caller) with the converted equivalent
 * for foreign currencies. Renders nothing when every amount is already in one
 * currency. Callers format via formatMoney + mask() so privacy mode keeps
 * working exactly like every other figure on the screen.
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
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-text-muted ${className}`}
      aria-label={t("curBreakdownAria")}
    >
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{label}</span>
      )}
      {parts.map((p, i) => (
        <span key={p.currency} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 && (
            <span aria-hidden className="text-faint">
              ·
            </span>
          )}
          <CurrencyFlag currency={p.currency} size={11} />
          <span className="figures whitespace-nowrap text-text">{p.rawText}</span>
          {p.convertedText && (
            <span className="figures whitespace-nowrap text-faint">≈ {p.convertedText}</span>
          )}
        </span>
      ))}
    </div>
  );
}
