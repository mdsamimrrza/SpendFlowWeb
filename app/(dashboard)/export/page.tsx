"use client";

import { ExportStatement } from "@/components/export/ExportStatement";

/** Thin route wrapper — the statement lives at @/components/export/ExportStatement (preview harnesses pass inject there). */
export default function ExportPage() {
  return <ExportStatement />;
}
