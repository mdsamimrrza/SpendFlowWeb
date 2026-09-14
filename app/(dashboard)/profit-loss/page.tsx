"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { useRowConverter, useDisplayRate } from "@/hooks/useRates";
import { listExpenses } from "@/services/expenses";
import { getRate } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, getCycleWindow, cycleDaysTotal, toISODate, quantizeMoney } from "@/utils/format";
import { resetAlertHistory } from "@/services/alerts";
import { listSettingsHistory, type SettingsHistoryRow } from "@/services/settingsHistory";

interface Bucket {
  key: string; // cycle start ISO (or YYYY-MM in calendar fallback)
  label: string;
  fromISO: string;
  toISO: string;
  income: number;
  expense: number;
  net: number;
}

/** Dates before this year are storage sentinels ("forever ago"), not real. */
const SENTINEL_ISO = "1971-01-01";

/**
 * Profit & Loss — statement aligned to the user's PAYCHECK CYCLE (the
 * "custom month"), not the calendar month: every bucket is one cycle window
 * (e.g. Aug 31 – Sep 29), with the budget that was in force for it. Mobile
 * reads as cycle cards; ≥lg as the full 7-column table. The paycheck editor
 * is a 1–31 day-chip calendar with a live window preview.
 */
export default function ProfitLossPage() {
  const { user, profile, saveProfile } = useAuth();
  const { t, locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const [loading, setLoading] = useState(true);
  // Append-only settings trail: per-cycle in-force budget + changes log.
  const [settingsHistory, setSettingsHistory] = useState<Awaited<ReturnType<typeof listSettingsHistory>>>([]);
  const [budgetRates, setBudgetRates] = useState<Record<string, number>>({});
  const displayRate = useDisplayRate(profile?.preferred_currency);
  const [budgetInput, setBudgetInput] = useState("");
  const [cycleStart, setCycleStart] = useState("1");
  const [cycleEnd, setCycleEnd] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingCycle, setSavingCycle] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [exp, hist] = await Promise.all([
          listExpenses(supabase, user.id, 0, {}, { field: "date", direction: "desc" }, 5000),
          listSettingsHistory(supabase, user.id).catch(() => []),
        ]);
        if (!cancelled) {
          setRows(exp.rows);
          setSettingsHistory(hist);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  useEffect(() => {
    if (profile) {
      setBudgetInput(profile.monthly_budget != null ? String(profile.monthly_budget) : "");
      setCycleStart(String(profile.cycle_start_day ?? 1));
      setCycleEnd(profile.cycle_end_day != null ? String(profile.cycle_end_day) : "");
    }
  }, [profile]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));
  const shortDay = (d: Date) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);

  // Live paycheck-cycle preview — mirrors exactly what Save produces (same
  // getCycleWindow the dashboards use), fed with the editor's in-progress
  // values. A fixed end day that collapses the window under 4 weeks is
  // highlighted: usually unintentional (e.g. start 20 + end 29 = Aug 20–29).
  const cyclePreview = useMemo(() => {
    const startNum = Number(cycleStart.trim());
    if (!cycleStart.trim() || !Number.isFinite(startNum) || startNum < 1 || startNum > 31) {
      return { isValid: false as const };
    }
    const endTrim = cycleEnd.trim();
    const endNum = endTrim === "" ? null : Number(endTrim);
    if (endNum !== null && (!Number.isFinite(endNum) || endNum < 1 || endNum > 31)) {
      return { isValid: false as const };
    }
    const win = getCycleWindow(new Date(), startNum, endNum);
    return {
      isValid: true as const,
      fromText: shortDay(win.start),
      toText: shortDay(win.end),
      days: cycleDaysTotal(win),
      isShort: endNum !== null && cycleDaysTotal(win) < 28,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shortDay depends only on locale
  }, [cycleStart, cycleEnd, locale]);

  // The cycle config actually in force — null falls back to calendar months.
  const cycleConfig = useMemo<{ start: number; end: number | null } | null>(() => {
    const s = Number(profile?.cycle_start_day ?? 1);
    const e = profile?.cycle_end_day ?? null;
    if (!Number.isFinite(s) || s < 1 || s > 31) return null;
    if (e !== null && (e < 1 || e > 31)) return null;
    return { start: s, end: e };
  }, [profile?.cycle_start_day, profile?.cycle_end_day]);

  // Buckets follow the paycheck cycle: walk backwards window-by-window from
  // the current one until the oldest entry is covered. Each bucket is one
  // "custom month" (e.g. Aug 31 – Sep 29), so the Budget column lines up
  // with the cycle the money was actually spent in.
  const buckets = useMemo<Bucket[]>(() => {
    if (rows.length === 0) return [];
    const earliest = rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date);

    const makeBucket = (key: string, fromISO: string, toISO: string, label: string): Bucket => ({
      key,
      fromISO,
      toISO,
      label,
      income: 0,
      expense: 0,
      net: 0,
    });

    const list: Bucket[] = [];
    if (cycleConfig) {
      let cursor = new Date();
      for (let i = 0; i < 240; i++) {
        const win = getCycleWindow(cursor, cycleConfig.start, cycleConfig.end);
        const fromISO = toISODate(win.start);
        list.push(makeBucket(fromISO, fromISO, toISODate(win.end), `${shortDay(win.start)} – ${shortDay(win.end)}`));
        if (fromISO <= earliest) break;
        cursor = new Date(win.start.getFullYear(), win.start.getMonth(), win.start.getDate() - 1);
      }
    } else {
      // Fallback: no valid cycle config — plain calendar months.
      const monthLabel = (key: string) =>
        new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
          new Date(`${key}-01T00:00:00`),
        );
      for (const row of rows) {
        const key = row.date.slice(0, 7);
        if (list.some((b) => b.key === key)) continue;
        const [y, mo] = key.split("-").map(Number);
        list.push(makeBucket(key, `${key}-01`, toISODate(new Date(y, mo, 0)), monthLabel(key)));
      }
      list.sort((a, b) => b.key.localeCompare(a.key));
    }

    for (const row of rows) {
      const b = list.find((x) => row.date >= x.fromISO && row.date <= x.toISO);
      if (!b) continue;
      const v = convert(row);
      if (row.type === "income") b.income += v;
      else b.expense += v;
      b.net = b.income - b.expense;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shortDay depends only on locale
  }, [rows, cycleConfig, convert, locale]);

  const maxAbs = useMemo(
    () => Math.max(...buckets.map((m) => Math.max(m.income, m.expense)), 1),
    [buckets],
  );

  // Rates for any budget_currency appearing in the trail (today's rates —
  // useBudget parity: past budgets display at CURRENT conversion).
  useEffect(() => {
    const curs = Array.from(
      new Set(settingsHistory.map((h) => h.budget_currency).filter((c): c is string => !!c)),
    );
    const need = curs.filter((c) => c !== displayCurrency && budgetRates[c] === undefined);
    if (need.length === 0) return;
    let cancelled = false;
    void Promise.all(need.map(async (c) => [c, await getRate(supabase, c)] as const)).then((entries) => {
      if (!cancelled) {
        setBudgetRates((prev) => {
          const next = { ...prev };
          for (const [c, r] of entries) next[c] = r;
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settingsHistory, displayCurrency, budgetRates, supabase]);

  // Budget in force per bucket: newest history row effective on/before the
  // bucket's last day (the cycle is one "custom month" — same rule the
  // calendar version applied to month end).
  const budgetByBucket = useMemo(() => {
    const map = new Map<string, number | null>();
    const inForce = (toISO: string): SettingsHistoryRow | null =>
      settingsHistory.find((h) => h.effective_from <= toISO) ?? null;
    for (const b of buckets) {
      const row = inForce(b.toISO);
      if (!row || row.monthly_budget == null) {
        map.set(b.key, null);
        continue;
      }
      const cur = row.budget_currency ?? displayCurrency;
      if (cur === displayCurrency) {
        map.set(b.key, row.monthly_budget);
      } else {
        const fromRate = budgetRates[cur];
        map.set(
          b.key,
          fromRate && displayRate
            ? quantizeMoney((row.monthly_budget * fromRate) / displayRate, displayCurrency)
            : null,
        );
      }
    }
    return map;
  }, [buckets, settingsHistory, budgetRates, displayCurrency, displayRate]);

  const current = buckets[0] ?? null;
  const currentBudget = current ? budgetByBucket.get(current.key) ?? null : null;
  const currentPct =
    current && currentBudget && currentBudget > 0 ? (current.expense / currentBudget) * 100 : null;

  // Calendar pickers (input type=date) set the start/end DAY-OF-MONTH: the
  // picked date contributes its day number to the cycle config. Values are
  // rendered in the current month, clamped to 28 so the picker stays valid
  // for days 29–31 in shorter months.
  const pickerBase = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const startPickerValue = `${pickerBase}-${String(
    Math.min(Math.max(Number(cycleStart) || 1, 1), 28),
  ).padStart(2, "0")}`;
  const endPickerValue =
    cycleEnd.trim() === ""
      ? ""
      : `${pickerBase}-${String(Math.min(Math.max(Number(cycleEnd) || 1, 1), 28)).padStart(2, "0")}`;

  const onSaveBudget = async () => {
    const numeric = Number(budgetInput);
    if (!Number.isFinite(numeric) || numeric < 0) {
      showToast("Enter a valid budget", "error");
      return;
    }
    setSavingBudget(true);
    try {
      // Budget is stored once in its own currency; history is appended so past
      // cycles reconstruct correctly (mobile parity).
      await saveProfile({ monthly_budget: numeric });
      await supabase.from("user_settings_history").insert({
        user_id: user!.id,
        effective_from: toISODate(new Date()),
        monthly_budget: numeric,
        cycle_start_day: profile?.cycle_start_day ?? 1,
        cycle_end_day: profile?.cycle_end_day ?? null,
        budget_currency: displayCurrency,
      });
      showToast("Budget saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save budget", "error");
    } finally {
      setSavingBudget(false);
    }
  };

  const onSaveCycle = async () => {
    const start = Math.min(Math.max(Number(cycleStart) || 1, 1), 31);
    const endRaw = cycleEnd.trim();
    const end = endRaw === "" ? null : Math.min(Math.max(Number(endRaw), 1), 31);
    setSavingCycle(true);
    try {
      await saveProfile({ cycle_start_day: start, cycle_end_day: end });
      await supabase.from("user_settings_history").insert({
        user_id: user!.id,
        effective_from: toISODate(new Date()),
        monthly_budget: profile?.monthly_budget ?? null,
        cycle_start_day: start,
        cycle_end_day: end,
        budget_currency: displayCurrency,
      });
      showToast("Cycle saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save cycle", "error");
    } finally {
      setSavingCycle(false);
    }
  };

  const vsBudgetCell = (pct: number | null) => {
    if (pct == null) return <span className="text-faint">—</span>;
    const tone =
      pct >= 100 ? "var(--sf-danger)" : pct >= 75 ? "var(--sf-brass)" : "var(--sf-income)";
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="numeric text-xs font-bold" style={{ color: tone }}>
          {Math.min(999, Math.round(pct))}%
        </span>
        <span className="block h-1 w-14 bg-surface-elevated">
          <span className="block h-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: tone }} />
        </span>
      </span>
    );
  };

  return (
    <main className="mx-auto w-full max-w-[1100px]">
      <header className="mb-5">
        <p className="caps !text-primary-strong">Statement</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Profit &amp; Loss</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="space-y-4">
          {/* ── Current cycle band — the "custom month" in one inline strip ── */}
          <div className="panel grid grid-cols-3 divide-x divide-border">
            <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
              <p className="caps truncate">{t("plThisCycle")}</p>
              <p className="figures mt-1.5 text-sm font-bold text-text sm:text-base">
                {current ? current.label : "—"}
              </p>
              {current && (
                <p className="stamp mt-0.5">
                  {cycleDaysTotal({
                    start: new Date(`${current.fromISO}T00:00:00`),
                    end: new Date(`${current.toISO}T00:00:00`),
                  })}
                  d
                </p>
              )}
            </div>
            <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
              <p className="caps truncate">
                <span className="hidden sm:inline">{t("plInForce")}</span>
                <span className="sm:hidden">{t("budget")}</span>
              </p>
              <p className="figures mt-1.5 text-lg font-bold text-text sm:text-2xl">
                {currentBudget != null ? fmt(currentBudget) : <span className="text-faint">—</span>}
              </p>
              <p className="stamp mt-0.5 truncate">{displayCurrency}</p>
            </div>
            <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
              <p className="caps truncate">{t("spent")}</p>
              <p
                className={`figures mt-1.5 text-lg font-bold sm:text-2xl ${
                  currentPct != null && currentPct >= 100 ? "text-danger" : "text-text"
                }`}
              >
                {current ? fmt(current.expense) : "—"}
              </p>
              {currentPct != null && (
                <p
                  className="numeric mt-0.5 text-[11px] font-bold"
                  style={{
                    color:
                      currentPct >= 100
                        ? "var(--sf-danger)"
                        : currentPct >= 75
                          ? "var(--sf-brass)"
                          : "var(--sf-income)",
                  }}
                >
                  {Math.round(currentPct)}% · {t("plCycle")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* ── Cycle-by-cycle statement ── */}
            <Panel
              label={cycleConfig ? t("plCycleByCycle") : t("category")}
              className="lg:col-span-2 lg:self-start"
              action={
                cycleConfig ? (
                  <span className="caps-faint">
                    {cycleConfig.start}
                    {cycleConfig.end ? ` → ${cycleConfig.end}` : ""}
                  </span>
                ) : undefined
              }
            >
              {buckets.length === 0 ? (
                <p className="border border-dashed border-border px-3 py-10 text-center">
                  <span className="caps">{t("plNoEntries")}</span>
                </p>
              ) : (
                <>
                  {/* Mobile-first: cycle cards */}
                  <div className="divide-y divide-border/60 lg:hidden">
                    {buckets.map((b) => {
                      const bud = budgetByBucket.get(b.key) ?? null;
                      const usedPct = bud && bud > 0 ? (b.expense / bud) * 100 : null;
                      const savings = b.income > 0 ? Math.round((b.net / b.income) * 100) : null;
                      return (
                        <div key={b.key} className="px-4 py-3.5 sm:px-5">
                          <Link
                            href={`/history?from=${b.fromISO}&to=${b.toISO}&sort=date_asc`}
                            className="flex items-baseline justify-between gap-2"
                            title="Open this cycle in History"
                          >
                            <span className="text-sm font-bold text-text underline-offset-2 hover:text-primary hover:underline">
                              {b.label}
                            </span>
                            <span
                              className={`numeric text-sm font-extrabold ${
                                b.net >= 0 ? "text-income" : "text-danger"
                              }`}
                            >
                              {b.net >= 0 ? "+" : "−"}
                              {fmt(Math.abs(b.net)).replace(/^[^\d]*/, "")}
                            </span>
                          </Link>
                          {/* paired bars */}
                          <div className="mt-2 space-y-0.5">
                            <div className="h-1 bg-surface-elevated">
                              <div className="h-full bg-income" style={{ width: `${Math.round((b.income / maxAbs) * 100)}%` }} />
                            </div>
                            <div className="h-1 bg-surface-elevated">
                              <div className="h-full bg-danger" style={{ width: `${Math.round((b.expense / maxAbs) * 100)}%` }} />
                            </div>
                          </div>
                          <div className="numeric mt-2.5 grid grid-cols-4 gap-2 text-right">
                            <div>
                              <p className="caps !text-[9px]">{t("income")}</p>
                              <p className="mt-0.5 text-xs font-bold text-income">{fmt(b.income)}</p>
                            </div>
                            <div>
                              <p className="caps !text-[9px]">{t("expenses")}</p>
                              <p className="mt-0.5 text-xs font-bold text-danger">{fmt(b.expense)}</p>
                            </div>
                            <div>
                              <p className="caps !text-[9px]">{t("budget")}</p>
                              <p className="mt-0.5 text-xs font-bold text-text-muted">
                                {bud != null ? fmt(bud) : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="caps !text-[9px]">vs</p>
                              <p className="mt-0.5 text-xs font-bold">
                                {usedPct != null ? `${Math.min(999, Math.round(usedPct))}%` : "—"}
                              </p>
                            </div>
                          </div>
                          {savings != null && (
                            <p className="stamp mt-1.5">
                              {t("savings")}: {savings}%
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: full table */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-faint">
                          <th className="px-5 py-2.5">{t("plCycle")}</th>
                          <th className="px-3 py-2.5 text-right">{t("income")}</th>
                          <th className="px-3 py-2.5 text-right">{t("expenses")}</th>
                          <th className="px-3 py-2.5 text-right">{t("budget")}</th>
                          <th className="px-3 py-2.5 text-right">vs</th>
                          <th className="px-3 py-2.5 text-right">Net</th>
                          <th className="px-5 py-2.5 text-right">{t("savings")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buckets.map((b) => {
                          const bud = budgetByBucket.get(b.key) ?? null;
                          const usedPct = bud && bud > 0 ? (b.expense / bud) * 100 : null;
                          const savings = b.income > 0 ? Math.round((b.net / b.income) * 100) : null;
                          return (
                            <tr key={b.key} className="border-b border-border/50 last:border-0">
                              <td className="px-5 py-2.5">
                                <Link
                                  href={`/history?from=${b.fromISO}&to=${b.toISO}&sort=date_asc`}
                                  className="text-sm font-semibold text-text underline-offset-2 hover:text-primary hover:underline"
                                  title="Open this cycle in History"
                                >
                                  {b.label}
                                </Link>
                                <div className="mt-1 space-y-0.5">
                                  <div className="h-1 bg-surface-elevated">
                                    <div className="h-full bg-income" style={{ width: `${Math.round((b.income / maxAbs) * 100)}%` }} />
                                  </div>
                                  <div className="h-1 bg-surface-elevated">
                                    <div className="h-full bg-danger" style={{ width: `${Math.round((b.expense / maxAbs) * 100)}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="numeric px-3 py-2.5 text-right font-bold text-income">{fmt(b.income)}</td>
                              <td className="numeric px-3 py-2.5 text-right font-bold text-danger">{fmt(b.expense)}</td>
                              <td className="numeric px-3 py-2.5 text-right text-text-muted">
                                {bud != null ? fmt(bud) : <span className="text-faint">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right">{vsBudgetCell(usedPct)}</td>
                              <td className={`numeric px-3 py-2.5 text-right font-extrabold ${b.net >= 0 ? "text-income" : "text-danger"}`}>
                                {b.net >= 0 ? "+" : "−"}
                                {fmt(Math.abs(b.net)).replace(/^[^\d]*/, "")}
                              </td>
                              <td className="numeric px-5 py-2.5 text-right text-text-muted">
                                {savings != null ? `${savings}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>

            {/* Budget editor */}
            <div className="space-y-4">
              <Panel label="Monthly budget">
                <div className="p-5">
                  <Input
                    label={`Budget (${displayCurrency})`}
                    type="number"
                    min="0"
                    step="any"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    leftAdornment={displayCurrency === "NPR" ? "रू" : ""}
                  />
                  <Button onClick={onSaveBudget} loading={savingBudget} className="mt-3 w-full">
                    Set budget
                  </Button>
                  <button
                    onClick={() => {
                      const n = resetAlertHistory(user!.id);
                      showToast(n > 0 ? `Reset ${n} alert(s)` : "No alerts to reset", "info");
                    }}
                    className="mt-2 w-full text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-text"
                  >
                    Reset alert suppression history
                  </button>
                </div>
              </Panel>

              <Panel label="Paycheck cycle">
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Start day (1–31)"
                      type="number"
                      min="1"
                      max="31"
                      value={cycleStart}
                      onChange={(e) => setCycleStart(e.target.value)}
                    />
                    <Input
                      label="End day (opt.)"
                      type="number"
                      min="1"
                      max="31"
                      value={cycleEnd}
                      onChange={(e) => setCycleEnd(e.target.value)}
                      placeholder="—"
                    />
                  </div>

                  {/* Calendar pickers — choosing a date sets that cycle day
                      (its day-of-month) into the matching input above. */}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      aria-label="Pick start date from calendar"
                      value={startPickerValue}
                      onChange={(e) => {
                        if (e.target.value) setCycleStart(String(Number(e.target.value.slice(8, 10))));
                      }}
                      className="h-10 w-full border border-border bg-input px-2.5 text-sm text-text focus:border-primary focus:outline-none"
                    />
                    <input
                      type="date"
                      aria-label="Pick end date from calendar"
                      value={endPickerValue}
                      onChange={(e) => {
                        setCycleEnd(e.target.value ? String(Number(e.target.value.slice(8, 10))) : "");
                      }}
                      className="h-10 w-full border border-border bg-input px-2.5 text-sm text-text focus:border-primary focus:outline-none"
                    />
                  </div>

                  {cyclePreview.isValid ? (
                    <div
                      role="status"
                      className={`mt-3 border px-3.5 py-2.5 ${
                        cyclePreview.isShort ? "border-danger bg-rust-tint" : "border-primary/40 bg-primary-light"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="caps !text-[9px] text-text-muted">{t("plThisCycle")}</span>
                        <span className="text-[11px] font-bold text-text-muted">{cyclePreview.days}d</span>
                      </div>
                      <p className={`mt-0.5 text-[15px] font-extrabold ${cyclePreview.isShort ? "text-danger" : "text-text"}`}>
                        {cyclePreview.fromText} – {cyclePreview.toText}
                      </p>
                      {cyclePreview.isShort && (
                        <p className="mt-1 text-[11px] font-semibold leading-snug text-danger">
                          End day earlier than start day makes this a short cycle — leave it blank for a full
                          month window.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] italic text-faint">Preview updates as you type.</p>
                  )}

                  <Button onClick={onSaveCycle} loading={savingCycle} variant="secondary" className="mt-3 w-full">
                    Save cycle
                  </Button>
                </div>
              </Panel>

              <Panel label="Changes log">
                <div className="p-5">
                  {settingsHistory.length === 0 ? (
                    <p className="border border-dashed border-border px-3 py-6 text-center">
                      <span className="caps">No budget or cycle changes yet</span>
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {settingsHistory.slice(0, 8).map((h) => (
                        <li key={h.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                          <span className="shrink-0 text-xs font-bold text-text">
                            {h.effective_from < SENTINEL_ISO
                              ? t("plStartOfRecords")
                              : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                                  new Date(`${h.effective_from}T00:00:00`),
                                )}
                          </span>
                          <span className="min-w-0 text-right">
                            <span className="numeric block text-xs font-bold text-text-muted">
                              {h.monthly_budget != null
                                ? mask(
                                    formatMoney(h.monthly_budget, h.budget_currency ?? displayCurrency, locale),
                                  )
                                : "No budget"}
                            </span>
                            <span className="block text-[10px] text-faint">
                              {t("plCycle")} {h.cycle_start_day}
                              {h.cycle_end_day ? ` → ${h.cycle_end_day}` : ` → ${t("plMonthEnd")}`}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-[11px] text-faint">
                    Append-only — the Budget column reads whichever figure was in force that cycle.
                  </p>
                </div>
              </Panel>
            </div>
          </div>

          <p className="text-[11px] text-faint">
            Buckets follow your paycheck cycle ({cycleConfig ? `${cycleConfig.start} → ${cycleConfig.end ?? t("plMonthEnd")}` : "calendar months"}),
            so spending lines up with the budget that was in force. Figures convert at each entry&apos;s stored
            snapshot rate; the Budget column converts each cycle&apos;s figure at today&apos;s rates. Covers your
            latest 5,000 entries. Cycle names open that window in History.
          </p>
        </div>
      )}
    </main>
  );
}
