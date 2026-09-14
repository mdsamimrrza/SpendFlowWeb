import { AnalyticsStatement } from "@/components/analytics/AnalyticsStatement";

/**
 * Analytics — one continuous ANALYTICAL STATEMENT sheet (ledger aesthetic).
 * All rendering lives in components/analytics/AnalyticsStatement.tsx so the
 * statement can also be composed by the /preview-analytics design harness.
 */
export default function AnalyticsPage() {
  return <AnalyticsStatement />;
}
