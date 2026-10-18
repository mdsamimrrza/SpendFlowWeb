"use client";

/**
 * Static design-preview route for the redesigned Settings page – the real
 * page component rendered inside the real AppShell, unauthenticated
 * (profile fields fall back to placeholders). Mock-data-only, like
 * /preview and /preview-dash; not linked from any navigation.
 */
import { AppShell } from "@/components/shell/AppShell";
import SettingsPage from "@/app/(dashboard)/settings/page";

export default function PreviewSettingsPage() {
  return (
    <AppShell>
      <SettingsPage />
    </AppShell>
  );
}
