"use client";

import BinStatement from "@/components/bin/BinStatement";

/** Thin route wrapper — the statement lives at @/components/bin/BinStatement
 *  (preview harnesses pass inject there). */
export default function BinPage() {
  return <BinStatement />;
}
