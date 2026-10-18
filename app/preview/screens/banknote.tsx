"use client";

import DashPage from "./dash";

/**
 * V6 PROPOSAL – "Professional" skin (design preview only, mock data).
 * The standard dashboard composition (./dash) rendered inside the
 * .skin-banknote token scope (app/globals.css): neutral canvas, white
 * cards, deep banking-green ink, no ornamentation. The live V5 Sage
 * Ledger skin is untouched – adopting this later is a token-level flip.
 */
export default function PreviewBanknotePage() {
  return (
    <div className="skin-banknote min-h-screen">
      <DashPage />
    </div>
  );
}
