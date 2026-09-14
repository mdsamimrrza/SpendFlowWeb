/**
 * History — route entry for the register. All rendering lives in
 * components/history/HistoryRegister.tsx so the seam can also be composed
 * by the /preview-history design harness (route files may only export the
 * default component, so the props seam cannot live here).
 */
import { HistoryRegister } from "@/components/history/HistoryRegister";

export default function HistoryPage() {
  return <HistoryRegister />;
}
