import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-border px-6 py-12 text-center">
      <p className="caps">{title}</p>
      {message && <p className="mt-2 max-w-xs text-xs text-text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
