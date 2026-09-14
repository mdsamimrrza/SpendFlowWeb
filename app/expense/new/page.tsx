import type { Metadata } from "next";
import { ExpenseForm } from "@/components/expense/ExpenseForm";

export const metadata: Metadata = { title: "Add Transaction — SpendFlow" };

/** Form owns the APK-style header bar; the page is just the 1080px canvas. */
export default function NewExpensePage() {
  return (
    <main className="mx-auto w-full max-w-[1080px]">
      <ExpenseForm />
    </main>
  );
}
