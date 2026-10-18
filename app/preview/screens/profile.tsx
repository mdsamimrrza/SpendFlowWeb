"use client";

/**
 * Static design-preview route for Profile & security – the real page
 * component rendered inside the real AppShell, unauthenticated
 * (profile fields fall back to placeholders). Mock-data-only, like
 * /preview-settings; not linked from any navigation.
 */
import { AppShell } from "@/components/shell/AppShell";
import ProfilePage from "@/app/(dashboard)/profile/page";

export default function PreviewProfilePage() {
  return (
    <AppShell>
      <ProfilePage />
    </AppShell>
  );
}
