/**
 * Recurring — route entry for the plan register. All rendering lives in
 * components/recurring/RecurringRegister.tsx so the mock seam can also be
 * composed by the /preview-recurring design harness (route files may only
 * export the default component, so the props seam cannot live here).
 */
import { RecurringRegister } from "@/components/recurring/RecurringRegister";

export default function RecurringPage() {
  return <RecurringRegister />;
}
