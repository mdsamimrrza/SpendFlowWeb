/**
 * Locale-aware formatting + the budget/cycle math ported from mobile
 * utils/format.ts (see docs/00-EXISTING-APP-AUDIT.md §3 Profit & Loss).
 * These are parity-critical — see docs/TESTING.md §2.
 */
import { CURRENCY_DETAILS, type CurrencyCode } from "@/constants/app";

export type ThemePreference = "light" | "dark" | "system";
export type LanguageCode = "en" | "hi" | "ne";

export const LANGUAGE_LOCALES: Record<LanguageCode, string> = {
  en: "en-US",
  hi: "hi-IN",
  ne: "ne-NP",
};

export function formatMoney(
  amount: number,
  currency: string,
  locale = "en-US",
): string {
  // Intl.NumberFormat throws RangeError for any `currency` outside the
  // [A-Za-z]{3} shape. Stored currencies are validated on web writes but the
  // shared DB (mobile-authored rows, second-order) is lower-trust input here —
  // a single malformed row must not route a whole screen to the error
  // boundary. Non-conforming codes render as a plain number + code suffix.
  const code = (currency || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${code.slice(0, 8)}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: currencyDecimals(code),
    maximumFractionDigits: currencyDecimals(code),
  }).format(amount);
}

/** Minor-unit digits per currency (0 for the zero-decimal KRW/JPY). */
export function currencyDecimals(currency: string): number {
  return CURRENCY_DETAILS[currency as CurrencyCode]?.decimals ?? 2;
}

/**
 * Currency-consistency grouping (user request 2026-09-16): a totals figure
 * that spans multiple currencies must show its raw per-currency parts, never
 * only the converted blend. `converted` uses the caller's own convert() so
 * the parts sum EXACTLY to the screen's headline (same per-row own-date basis,
 * quantization included). Returns parts sorted by converted magnitude desc;
 * a length of 0/1 means nothing needs explaining (single currency).
 */
export function currencyTotals<T extends { currency: string; amount: number }>(
  rows: readonly T[],
  convert: (row: T) => number,
): { currency: string; raw: number; converted: number }[] {
  const by = new Map<string, { raw: number; converted: number }>();
  for (const r of rows) {
    const c = String(r.currency ?? "").toUpperCase() || "?";
    const p = by.get(c) ?? { raw: 0, converted: 0 };
    p.raw += Number(r.amount) || 0;
    p.converted += convert(r);
    by.set(c, p);
  }
  return [...by.entries()]
    .map(([currency, p]) => ({ currency, ...p }))
    .sort((a, b) => b.converted - a.converted);
}

/**
 * Round an FX-converted amount to the display currency's minor units. Called
 * at the conversion boundary so every aggregate is a sum of on-screen values:
 * derived lines (net = inflow − outflow, over/remaining = budget − spent) then
 * always reconcile with the displayed operands, in all 12 currencies.
 * Display-layer only — stored amounts, budgets, and FX snapshots are never
 * rewritten (docs/SYNC-STRATEGY.md §6).
 */
export function quantizeMoney(amount: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency);
  // Half away from zero (Math.round is half-toward-+∞).
  return amount >= 0
    ? Math.round(amount * factor) / factor
    : -Math.round(-amount * factor) / factor;
}

/**
 * Parse a date string as LOCAL time. Accepts bare YYYY-MM-DD (midnight) and
 * datetime strings ("YYYY-MM-DDTHH:mm" or space-separated). Appending
 * T00:00:00 blindly to a datetime string yields an Invalid Date, and
 * space-separated forms fail in Safari — normalize both here.
 */
function parseLocalDate(date: string): Date {
  const iso = date.replace(" ", "T");
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
}

export function formatDate(date: string | Date, locale = "en-US"): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatShortDate(date: string | Date, locale = "en-US"): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

/** Local-date ISO string (never shifts a day via UTC, unlike toISOString). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

/**
 * Cycle window for a reference date (mobile parity):
 * cycle_start_day 1 = standard calendar month sentinel; 2–31 custom start;
 * end day null = day before the next cycle start. Starts on 29–31 are valid —
 * never clamped to 28 (mobile rule).
 */
export interface CycleWindow {
  start: Date;
  end: Date;
}

/**
 * Total days in a cycle window, INCLUSIVE of both start and end (a 31 Aug –
 * 29 Sep cycle is 30 days: the start day plus every day after it). The naive
 * (end − start)/day division produces an exclusive count that under-counts
 * projections and daily allowances by ~1 day.
 */
export function cycleDaysTotal(window: CycleWindow): number {
  const ms = window.end.getTime() - window.start.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Days elapsed in the cycle as of a reference date, counting the start day
 * itself as day 1 (mobile parity: day 1 of a 30-day cycle means 1/30 elapsed).
 * Capped at the total so late-cycle references don't overflow.
 */
export function cycleDaysElapsed(window: CycleWindow, reference: Date): number {
  const total = cycleDaysTotal(window);
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const ms = ref.getTime() - window.start.getTime();
  return Math.min(total, Math.max(1, Math.floor(ms / 86_400_000) + 1));
}

/**
 * Previous cycle window: re-derives the cycle that ENDS the day before the
 * current one starts, using the same start/end day rule. Shifting the current
 * window back by its millisecond span lands on the wrong days whenever the
 * previous month is shorter (e.g. start 31 → prev month has 30/28 days).
 */
export function getPreviousCycleWindow(
  reference: Date,
  cycleStartDay: number,
  cycleEndDay: number | null,
): CycleWindow {
  const current = getCycleWindow(reference, cycleStartDay, cycleEndDay);
  const prevRef = new Date(
    current.start.getFullYear(),
    current.start.getMonth(),
    current.start.getDate() - 1,
  );
  return getCycleWindow(prevRef, cycleStartDay, cycleEndDay);
}

/**
 * Locale-independent statement number for a cycle: year + zero-padded month
 * of the cycle START (e.g. "2026-08"). Never derived from a formatted label —
 * those are locale-dependent and truncate mid-month-name in hi/ne.
 */
export function cycleStatementNo(window: CycleWindow): string {
  return `${window.start.getFullYear()}-${String(window.start.getMonth() + 1).padStart(2, "0")}`;
}

export function getCycleWindow(
  reference: Date,
  cycleStartDay: number,
  cycleEndDay: number | null,
): CycleWindow {
  const day = clampCycleDay(cycleStartDay);
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  // Mobile getSafeMonthDate parity: CLAMP to the month's last day, never let
  // JS Date roll over into the next month (new Date(y, 8, 31) === Oct 1).
  // Without clamping, a start day 31 in a 30-day month silently shifted every
  // window by one day vs. the mobile app.
  const safeDate = (year: number, month: number, targetDay: number) => {
    const maxDays = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(Math.max(targetDay, 1), maxDays));
  };

  // Mobile anchor rule: compare against the CLAMPED start date itself, not
  // the raw day number. ref.getDate() >= day mis-anchors when the month is
  // too short to hold the start day (e.g. start 29 on Feb 28: the clamped
  // Feb 28 IS this month's start, so the anchor is Feb, not the prior month).
  const thisMonthStart = safeDate(ref.getFullYear(), ref.getMonth(), day);
  const start = ref >= thisMonthStart
    ? thisMonthStart
    : safeDate(ref.getFullYear(), ref.getMonth() - 1, day);

  // Mobile currentMonthRange parity: a fixed end day is INCLUSIVE and falls in
  // the next calendar month when it is earlier in the month than the start day.
  let end: Date;
  if (cycleEndDay != null) {
    const endDay = clampCycleDay(cycleEndDay);
    end = endDay < day
      ? safeDate(start.getFullYear(), start.getMonth() + 1, endDay)
      : safeDate(start.getFullYear(), start.getMonth(), endDay);
  } else {
    // Dynamic end: day before the next cycle starts (mobile currentMonthRange
    // dynamic-end branch). Month-end (day 0 of next month) was WRONG for
    // custom starts — e.g. start 20 gave Aug 20–31 (12d) instead of
    // Aug 20 – Sep 19 (31d). Clamping keeps 29–31 starts correct in short
    // months (next start Sep 30-clamped → end Sep 29, matching mobile).
    const nextStart = safeDate(start.getFullYear(), start.getMonth() + 1, day);
    end = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
  }

  return { start, end };
}

function clampCycleDay(day: number): number {
  // 1 is the "standard calendar cycle" sentinel; 2–31 are custom starts.
  return Math.min(Math.max(Math.round(day), 1), 31);
}

/**
 * Display-only budget conversion (mobile getMonthlyBudget parity). NEVER
 * rewrite the stored monthly_budget — conversion happens here only.
 */
export function convertBudget(
  monthlyBudget: number,
  budgetCurrency: string,
  displayCurrency: string,
  getRate: (currency: string, date?: string) => number | null,
): number {
  if (budgetCurrency === displayCurrency) return monthlyBudget;
  const from = getRate(budgetCurrency);
  const to = getRate(displayCurrency);
  if (!from || !to) return monthlyBudget;
  // Rates are USD per unit: converting budget_currency → display means
  // amount × (USD per from) ÷ (USD per to) — same direction as row conversion.
  return (monthlyBudget * from) / to;
}
