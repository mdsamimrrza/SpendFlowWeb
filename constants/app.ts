/**
 * Single source of truth for the 12-currency system — mirrors mobile
 * constants/app.ts (see docs/00-EXISTING-APP-AUDIT.md §4). Never hardcode
 * currency option lists elsewhere; Settings/currency pickers derive from this.
 */

export type CurrencyCode =
  | "NPR"
  | "INR"
  | "USD"
  | "QAR"
  | "GBP"
  | "AED"
  | "SAR"
  | "MYR"
  | "KRW"
  | "JPY"
  | "AUD"
  | "CAD";

export const CURRENCIES: CurrencyCode[] = [
  "NPR",
  "INR",
  "USD",
  "QAR",
  "GBP",
  "AED",
  "SAR",
  "MYR",
  "KRW",
  "JPY",
  "AUD",
  "CAD",
];

/**
 * Public Android APK distribution — free hosting via GitHub Releases.
 *
 * The URL deliberately uses GitHub's /releases/latest/download/ redirect,
 * which always serves the asset named `spendflow-latest.apk` from the NEWEST
 * release of the mobile repo. CONTRACT: every future release that should be
 * publicly downloadable must include an asset named exactly
 * `spendflow-latest.apk` (upload the new build under that name — the
 * versioned filename can live in the release notes instead). Nothing here
 * needs editing between releases.
 */
export const ANDROID_DOWNLOAD_URL =
  "https://github.com/mdsamimrrza/SpendFlow/releases/latest/download/spendflow-latest.apk";

export interface CurrencyDetail {
  code: CurrencyCode;
  label: string;
  symbol: string;
  flag: string;
  /** Zero-decimal currencies (KRW, JPY) format without fraction digits. */
  decimals: number;
}

export const CURRENCY_DETAILS: Record<CurrencyCode, CurrencyDetail> = {
  NPR: { code: "NPR", label: "Nepalese Rupee", symbol: "रू", flag: "🇳🇵", decimals: 2 },
  INR: { code: "INR", label: "Indian Rupee", symbol: "₹", flag: "🇮🇳", decimals: 2 },
  USD: { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸", decimals: 2 },
  QAR: { code: "QAR", label: "Qatari Riyal", symbol: "﷼", flag: "🇶🇦", decimals: 2 },
  GBP: { code: "GBP", label: "British Pound", symbol: "£", flag: "🇬🇧", decimals: 2 },
  AED: { code: "AED", label: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪", decimals: 2 },
  SAR: { code: "SAR", label: "Saudi Riyal", symbol: "﷼", flag: "🇸🇦", decimals: 2 },
  MYR: { code: "MYR", label: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾", decimals: 2 },
  KRW: { code: "KRW", label: "South Korean Won", symbol: "₩", flag: "🇰🇷", decimals: 0 },
  JPY: { code: "JPY", label: "Japanese Yen", symbol: "¥", flag: "🇯🇵", decimals: 0 },
  AUD: { code: "AUD", label: "Australian Dollar", symbol: "A$", flag: "🇦🇺", decimals: 2 },
  CAD: { code: "CAD", label: "Canadian Dollar", symbol: "C$", flag: "🇨🇦", decimals: 2 },
};

export const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Mobile's quick tags (ExpenseForm). */
export const EXPENSE_QUICK_TAGS = [
  "Lunch",
  "Coffee",
  "Groceries",
  "Fuel",
  "Uber",
  "Dinner",
  "Medicine",
  "Utilities",
] as const;

export const INCOME_QUICK_TAGS = [
  "Salary",
  "Freelance",
  "Dividend",
  "Rental",
  "Bonus",
  "Cashback",
  "Client",
] as const;
