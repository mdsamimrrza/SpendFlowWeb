"use client";

/**
 * Static design-preview route for the Cycle Report — the real page component
 * inside the real DashboardShell, unauthenticated (no entries load, so the
 * register shows its empty state; hero, graph and donut render with zero
 * data). Mock-data-only, like the other /preview screens.
 */
import { DashboardShell } from "@/components/layout/DashboardShell";
import CycleReportPage from "@/app/(dashboard)/profit-loss/cycle/page";

export default function PreviewCycleReportPage() {
  return (
    <DashboardShell>
      <CycleReportPage />
    </DashboardShell>
  );
}
