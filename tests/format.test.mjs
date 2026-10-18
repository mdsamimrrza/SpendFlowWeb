/**
 * Parity tests for the pure money/cycle math in utils/format.ts - the
 * riskiest web/mobile divergence surface (docs/TESTING.md §2). Run:
 *   npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  currencyDecimals,
  quantizeMoney,
  currencyTotals,
  getCycleWindow,
  getPreviousCycleWindow,
  cycleDaysTotal,
  cycleDaysElapsed,
  cycleStatementNo,
  convertBudget,
} from "@/utils/format";

// Local-date string - toISOString would shift local midnights into UTC and
// misreport every boundary day on this +05:45 machine.
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Intl separates code and amount with a non-breaking space; compare ASCII.
const ascii = (s) => s.replace(/ /g, " ");

/* ---- formatMoney ---- */

test("formatMoney renders NPR with code symbol and 2 decimals", () => {
  assert.equal(ascii(formatMoney(300100, "NPR", "en-US")), "NPR 300,100.00");
});

test("formatMoney uses zero decimals for KRW/JPY", () => {
  assert.equal(currencyDecimals("KRW"), 0);
  assert.equal(currencyDecimals("JPY"), 0);
  assert.equal(ascii(formatMoney(15000, "KRW", "en-US")), "₩15,000");
});

test("formatMoney falls back to plain number + code for malformed codes", () => {
  assert.equal(ascii(formatMoney(12.5, "not-a-code!", "en-US")), "12.50 NOT-A-CO");
});

test("formatMoney survives an empty currency (defaults to USD shape)", () => {
  assert.match(formatMoney(1, "", "en-US"), /1\.00/);
});

/* ---- quantizeMoney ---- */

test("quantizeMoney rounds half away from zero (not toward +inf)", () => {
  assert.equal(quantizeMoney(2.005, "NPR"), 2.01);
  assert.equal(quantizeMoney(-2.005, "NPR"), -2.01);
});

test("quantizeMoney honors zero-decimal currencies", () => {
  assert.equal(quantizeMoney(1234.56, "KRW"), 1235);
});

/* ---- currencyTotals ---- */

test("currencyTotals groups raw + converted parts, biggest first", () => {
  const rows = [
    { currency: "NPR", amount: 500 },
    { currency: "USD", amount: 10 },
    { currency: "NPR", amount: 250 },
  ];
  const parts = currencyTotals(rows, (r) => (r.currency === "USD" ? 1320 : r.amount));
  assert.deepEqual(
    parts.map((p) => [p.currency, p.raw, p.converted]),
    [
      ["USD", 10, 1320],
      ["NPR", 750, 750],
    ],
  );
});

/* ---- cycle windows (mobile getSafeMonthDate / currentMonthRange parity) ---- */

test("start day 1 = calendar-month sentinel", () => {
  const w = getCycleWindow(new Date(2026, 9, 11), 1, null);
  assert.equal(iso(w.start), "2026-10-01");
  assert.equal(iso(w.end), "2026-10-31");
});

test("custom start 20 gives Aug 20 - Sep 19, not Aug 20 - Aug 31", () => {
  const w = getCycleWindow(new Date(2026, 7, 25), 20, null);
  assert.equal(iso(w.start), "2026-08-20");
  assert.equal(iso(w.end), "2026-09-19");
});

test("start day 31 in a 30-day month anchors on the clamped start", () => {
  // Sep 5 with start day 31: Sep 31 does not exist -> this month's clamped
  // start is Sep 30, but ref (Sep 5) is before it, so the window is
  // Aug 31 - Sep 29 (prev month clamped), never rolled into Oct.
  const w = getCycleWindow(new Date(2026, 8, 5), 31, null);
  assert.equal(iso(w.start), "2026-08-31");
  assert.equal(iso(w.end), "2026-09-29");
});

test("fixed end day earlier than the start day falls in the next month", () => {
  // Start 25, end 5 -> Sep 25 - Oct 5.
  const w = getCycleWindow(new Date(2026, 8, 30), 25, 5);
  assert.equal(iso(w.start), "2026-09-25");
  assert.equal(iso(w.end), "2026-10-05");
});

test("previous cycle window re-derives from the day before the start", () => {
  const prev = getPreviousCycleWindow(new Date(2026, 9, 11), 1, null);
  assert.equal(iso(prev.start), "2026-09-01");
  assert.equal(iso(prev.end), "2026-09-30");
});

test("cycle day totals and elapsed caps", () => {
  const w = getCycleWindow(new Date(2026, 9, 11), 1, null);
  assert.equal(cycleDaysTotal(w), 31);
  assert.equal(cycleDaysElapsed(w, new Date(2026, 9, 5)), 5);
  // Late-cycle reference never overflows the total.
  assert.equal(cycleDaysElapsed(w, new Date(2026, 10, 15)), 31);
});

test("statement number is year + zero-padded start month", () => {
  const w = getCycleWindow(new Date(2026, 9, 11), 20, null);
  assert.equal(cycleStatementNo(w), "2026-09");
});

/* ---- convertBudget (display-only; never rewrites the stored budget) ---- */

test("convertBudget is identity when currencies match", () => {
  assert.equal(convertBudget(14000, "NPR", "NPR", () => 0.0075), 14000);
});

test("convertBudget crosses rates as USD-per-unit in both directions", () => {
  const rates = { NPR: 1 / 133.5, USD: 1 };
  const getRate = (c) => rates[c] ?? null;
  // 14000 NPR -> USD: 14000 * (1/133.5) / 1 = 104.87...
  assert.equal(convertBudget(14000, "NPR", "USD", getRate).toFixed(2), "104.87");
  // Missing rate keeps the stored figure rather than zeroing it.
  assert.equal(convertBudget(14000, "NPR", "EUR", getRate), 14000);
});
