"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useToast } from "@/store/ToastContext";
import { useRowConverter } from "@/hooks/useRates";
import { listExpenses } from "@/services/expenses";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, getCycleWindow, cycleDaysTotal, toISODate } from "@/utils/format";
import { resetAlertHistory } from "@/services/alerts";

interface MonthRow {
  key: string; // YYYY-MM
  label: string;
  income: number;
  expense: number;
  net: number;
}

/** Profit & Loss — monthly statement, budget editor, cycle configuration. */
export default function ProfitLossPage() {
  const { user, profile, saveProfile } = useAuth();
  const { locale } = useLanguage();
  const { mask } = usePrivacy();
  const { showToast } = useToast();
  const supabase = getSupabaseBrowserClient();

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const { convert } = useRowConverter(profile?.preferred_currency, rows);
  const [loading, setLoading] = useState(true);
  const [budgetInput, setBudgetInput] = useState("");
  const [cycleStart, setCycleStart] = useState("1");
  const [cycleEnd, setCycleEnd] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingCycle, setSavingCycle] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { rows: fresh } = await listExpenses(supabase, user.id, 0, {}, { field: "date", direction: "desc" }, 1000);
        if (!cancelled) setRows(fresh);
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
    const days = cycleDaysTotal(win);
    const fmtDay = (d: Date) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
    return {
      isValid: true as const,
      fromText: fmtDay(win.start),
      toText: fmtDay(win.end),
      days,
      isShort: endNum !== null && days < 28,
    };
  }, [cycleStart, cycleEnd, locale]);

  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const fmt = (n: number) => mask(formatMoney(n, displayCurrency, locale));

  const months = useMemo<MonthRow[]>(() => {
    const map = new Map<string, MonthRow>();
    for (const row of rows) {
      const key = row.date.slice(0, 7);
      const v = convert(row);
      const m =
        map.get(key) ??
        ({
          key,
          label: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
            new Date(`${key}-01T00:00:00`),
          ),
          income: 0,
          expense: 0,
          net: 0,
        } as MonthRow);
      if (row.type === "income") m.income += v;
      else m.expense += v;
      m.net = m.income - m.expense;
      map.set(key, m);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [rows, convert, locale]);

  const maxAbs = useMemo(
    () => Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1),
    [months],
  );

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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Month-by-month statement */}
            <Panel label="Month by month" className="lg:col-span-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-faint">
                      <th className="px-5 py-2.5">Month</th>
                      <th className="px-3 py-2.5 text-right">Income</th>
                      <th className="px-3 py-2.5 text-right">Expense</th>
                      <th className="px-3 py-2.5 text-right">Net</th>
                      <th className="px-5 py-2.5 text-right">Savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center">
                          <span className="caps">No entries yet</span>
                        </td>
                      </tr>
                    )}
                    {months.map((m) => {
                      const savings = m.income > 0 ? m.net / m.income : 0;
                      return (
                        <tr key={m.key} className="border-b border-border/50 last:border-0">
                          <td className="px-5 py-2.5">
                            <p className="text-sm font-semibold text-text">{m.label}</p>
                            {/* paired bars */}
                            <div className="mt-1 space-y-0.5">
                              <div className="h-1 bg-surface-elevated">
                                <div className="h-full bg-income" style={{ width: `${Math.round((m.income / maxAbs) * 100)}%` }} />
                              </div>
                              <div className="h-1 bg-surface-elevated">
                                <div className="h-full bg-danger" style={{ width: `${Math.round((m.expense / maxAbs) * 100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="numeric px-3 py-2.5 text-right font-bold text-income">{fmt(m.income)}</td>
                          <td className="numeric px-3 py-2.5 text-right font-bold text-danger">{fmt(m.expense)}</td>
                          <td className={`numeric px-3 py-2.5 text-right font-extrabold ${m.net >= 0 ? "text-income" : "text-danger"}`}>
                            {m.net >= 0 ? "+" : "−"}
                            {fmt(Math.abs(m.net)).replace(/^[^\d]*/, "")}
                          </td>
                          <td className="numeric px-5 py-2.5 text-right text-text-muted">
                            {m.income > 0 ? `${Math.round(savings * 100)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                  <p className="mt-2 text-[11px] text-faint">
                    Stored once in {displayCurrency}; every change is appended to your settings history so past
                    cycles stay truthful.
                  </p>
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

                  {cyclePreview.isValid ? (
                    <div
                      role="status"
                      className={`mt-3 rounded-md border px-3.5 py-2.5 ${
                        cyclePreview.isShort
                          ? "border-danger bg-rust-tint"
                          : "border-primary/40 bg-primary-light"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="caps !text-[9px] text-text-muted">Your cycle</span>
                        <span className="text-[11px] font-bold text-text-muted">{cyclePreview.days}d</span>
                      </div>
                      <p
                        className={`mt-0.5 text-[15px] font-extrabold ${
                          cyclePreview.isShort ? "text-danger" : "text-text"
                        }`}
                      >
                        {cyclePreview.fromText} – {cyclePreview.toText}
                      </p>
                      {cyclePreview.isShort && (
                        <p className="mt-1 text-[11px] font-semibold leading-snug text-danger">
                          End day earlier than start day makes this a short cycle — leave it blank for a
                          full month window.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] italic text-faint">
                      Preview updates as you type.
                    </p>
                  )}

                  <Button onClick={onSaveCycle} loading={savingCycle} variant="secondary" className="mt-3 w-full">
                    Save cycle
                  </Button>
                  <p className="mt-2 text-[11px] text-faint">
                    1 = calendar month. Days 29–31 are valid starts and never clamp to 28.
                  </p>
                </div>
              </Panel>
            </div>
          </div>

          <p className="text-[11px] text-faint">
            Figures convert at each entry&apos;s stored snapshot rate. Covers your latest 1,000 entries.
          </p>
        </div>
      )}
    </main>
  );
}
