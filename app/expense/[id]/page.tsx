import type { Metadata } from "next";
import { ExpenseForm } from "@/components/expense/ExpenseForm";

export const metadata: Metadata = { title: "Edit Transaction — SpendFlow" };

/** Form owns the header bar (ref + recorded subline render inside it). */
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-[1080px]">
      <ExpenseForm expenseId={id} />
    </main>
  );
}
