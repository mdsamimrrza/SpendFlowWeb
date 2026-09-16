"use client";

/**
 * Static design-preview route for the redesigned Categories page — the real
 * page component inside the real DashboardShell, unauthenticated (loads zero
 * categories, so the grid shows its empty state; the editor modal is still
 * fully renderable). Mock-data-only, like /preview-dash; not linked from any
 * navigation.
 */
import { DashboardShell } from "@/components/layout/DashboardShell";
import CategoriesPage from "@/app/(dashboard)/categories/page";

export default function PreviewCategoriesPage() {
  return (
    <DashboardShell>
      <CategoriesPage />
    </DashboardShell>
  );
}
