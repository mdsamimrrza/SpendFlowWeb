import { ExpenseForm } from "@/components/expense/ExpenseForm";

export default function NewExpensePage() {
  return (
    <main className="mx-auto w-full max-w-[880px]">
      <header className="mb-5">
        <p className="caps !text-primary-strong">New entry</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Record a transaction</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>
      <ExpenseForm />
    </main>
  );
}
