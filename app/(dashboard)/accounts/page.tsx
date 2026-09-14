"use client";

import { AccountsStatement } from "@/components/accounts/AccountsStatement";

/** Thin route wrapper — the statement lives at @/components/accounts/AccountsStatement (preview harnesses pass inject there). */
export default function AccountsPage() {
  return <AccountsStatement />;
}
