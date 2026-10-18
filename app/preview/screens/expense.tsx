"use client";

/**
 * Static design-preview route for the expense form + record preview rail –
 * the real components inside the real AppShell, unauthenticated
 * (accounts/categories lists come back empty, so the rail shows its
 * placeholder states). Mock-data-only, like /preview-dash; not linked from
 * any navigation.
 */
import { AppShell } from "@/components/shell/AppShell";
import { ExpenseForm } from "@/components/expense/ExpenseForm";

export default function PreviewExpensePage() {
  return (
    <AppShell>
      <ExpenseForm />
    </AppShell>
  );
}
