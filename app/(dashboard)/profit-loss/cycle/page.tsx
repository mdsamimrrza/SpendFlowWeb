"use client";

/**
 * Cycle report – opened by tapping a Month-by-Month card on /profit-loss
 * (?from=&to=, inclusive both ends). Data plumbing only: auth, params,
 * fetch, and the in-force budget converted at the cycle end date; the
 * presentation lives in CycleReportStatement (console redesign 2026-10-27,
 * /preview/cycle-report renders it with mocks). Mobile mirror: APK
 * app/cycle-report.tsx.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { listExpenses } from "@/services/expenses";
import { listSettingsHistory } from "@/services/settingsHistory";
import { getRateSnapshot } from "@/services/exchange";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { CycleReportStatement } from "@/components/profit-loss/CycleReportStatement";
import { MobileEmptyState } from "@/components/ui/MobileChrome";
import { Skeleton } from "@/components/ui/Skeleton";

export default function CycleReportPage() {
  // Suspense boundary required: useSearchParams opts the page out of static
  // prerendering, and the shell must stay renderable while params resolve.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-[560px] p-0.5"><Skeleton className="h-[420px] w-full rounded-xl" /></main>}>
      <CycleReportInner />
    </Suspense>
  );
}

function CycleReportInner() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Router-sourced params: window.location.search is stale during client-side
  // navigation (router.push), which made every tap land on the invalid branch.
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const currency = profile?.preferred_currency ?? "NPR";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listExpenses>>["rows"]>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listSettingsHistory>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !valid) {
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
          setHistory(hist);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase, valid]);

  // Budget IN FORCE for this cycle (newest settings row effective on/before
  // the cycle end), converted at the end date – never today's figure
  // retro-projected onto a past cycle.
  const rawBudget = profile?.monthly_budget ?? 0;
  const budgetCurrency = (profile?.budget_currency || profile?.preferred_currency || "NPR").toUpperCase();
  const [budget, setBudget] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!valid) {
        setBudget(null);
        return;
      }
      // history arrives effective_from-desc: first row on/before `to` is in force.
      const inForce = history.find((h) => h.effective_from <= to);
      const amount = inForce ? inForce.monthly_budget : rawBudget;
      const cur = (inForce?.budget_currency || budgetCurrency).toUpperCase();
      if (!amount || amount <= 0) {
        if (!cancelled) setBudget(null);
        return;
      }
      if (cur === currency) {
        if (!cancelled) setBudget(Math.round(amount));
        return;
      }
      try {
        const [fromRate, dispRate] = await Promise.all([
          getRateSnapshot(supabase, cur, to),
          getRateSnapshot(supabase, currency, to),
        ]);
        if (!cancelled && fromRate && dispRate) {
          setBudget(Math.round((amount * fromRate.exchange_rate_to_usd) / dispRate.exchange_rate_to_usd));
        }
      } catch {
        if (!cancelled) setBudget(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [history, rawBudget, budgetCurrency, currency, supabase, to, valid]);

  if (!valid) {
    return (
      <main className="mx-auto w-full max-w-[560px] space-y-4 p-0.5">
        <MobileEmptyState icon={Scale} title={t("plCycleReportTitle")} message={t("plCycleEmptyTx")} />
      </main>
    );
  }

  return (
    <CycleReportStatement
      loading={loading}
      rows={rows}
      from={from}
      to={to}
      currency={currency}
      budget={budget}
      onBack={() => router.back()}
    />
  );
}
