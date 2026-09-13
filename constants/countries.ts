/** Institution/wizard registry — mirrors mobile constants/countries.ts. */
import type { CurrencyCode } from "./app";

export interface CountryInfo {
  code: string;
  name: string;
  currency: CurrencyCode;
  flag: string;
}

/** Onboarding chip order matches mobile onboarding (flag + currency code only). */
export const WIZARD_COUNTRIES: CountryInfo[] = [
  { code: "NP", name: "Nepal", currency: "NPR", flag: "🇳🇵" },
  { code: "IN", name: "India", currency: "INR", flag: "🇮🇳" },
  { code: "QA", name: "Qatar", currency: "QAR", flag: "🇶🇦" },
  { code: "AE", name: "UAE", currency: "AED", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", flag: "🇸🇦" },
  { code: "US", name: "United States", currency: "USD", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", currency: "GBP", flag: "🇬🇧" },
  { code: "MY", name: "Malaysia", currency: "MYR", flag: "🇲🇾" },
  { code: "KR", name: "South Korea", currency: "KRW", flag: "🇰🇷" },
  { code: "JP", name: "Japan", currency: "JPY", flag: "🇯🇵" },
  { code: "AU", name: "Australia", currency: "AUD", flag: "🇦🇺" },
  { code: "CA", name: "Canada", currency: "CAD", flag: "🇨🇦" },
];

export const ONBOARDING_CURRENCY_KEY = "spendflow_onboarding_currency";
export const ONBOARDING_COMPLETE_KEY = "spendflow_onboarding_complete";
