"use client";

/**
 * Static design-preview route for the redesigned Profit & Loss page — the
 * real page component inside the real DashboardShell, unauthenticated (no
 * entries load, so the statement shows its empty state; the cycle band and
 * paycheck calendar render fully). Mock-data-only, like /preview-dash; not
 * linked from any navigation.
 */
import { DashboardShell } from "@/components/layout/DashboardShell";
import ProfitLossPage from "@/app/(dashboard)/profit-loss/page";

export default function PreviewProfitLossPage() {
  return (
    <DashboardShell>
      <ProfitLossPage />
    </DashboardShell>
  );
}
