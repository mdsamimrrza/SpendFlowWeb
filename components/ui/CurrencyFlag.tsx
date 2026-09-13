import type { CurrencyCode } from "@/constants/app";

/**
 * Currency code → ISO 3166-1 alpha-2 (lowercase), matching the self-hosted
 * SVGs in /public/flags. We render images instead of the emoji `flag` field
 * from CURRENCY_DETAILS because Windows renders emoji flags as plain
 * regional-indicator letters ("IN"), never as a flag.
 */
const FLAG_COUNTRY: Record<CurrencyCode, string> = {
  NPR: "np",
  INR: "in",
  USD: "us",
  QAR: "qa",
  GBP: "gb",
  AED: "ae",
  SAR: "sa",
  MYR: "my",
  KRW: "kr",
  JPY: "jp",
  AUD: "au",
  CAD: "ca",
};

interface CurrencyFlagProps {
  currency: string;
  /** Box height in px; width follows a 4:3 ratio. */
  size?: number;
  className?: string;
}

/** Country flag chip for a currency code (mobile header/chip parity). */
export function CurrencyFlag({ currency, size = 14, className = "" }: CurrencyFlagProps) {
  const country = FLAG_COUNTRY[currency as CurrencyCode];
  if (!country) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local SVG, nothing to optimize
    <img
      src={`/flags/${country}.svg`}
      alt=""
      aria-hidden
      width={Math.round((size * 4) / 3)}
      height={size}
      className={`inline-block rounded-[2px] align-[-1px] object-contain ring-1 ring-border/60 ${className}`}
    />
  );
}
