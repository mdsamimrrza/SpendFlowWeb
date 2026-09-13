import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Statement masthead label rendered in the panel's top rule. */
  label?: string;
  /** Right-aligned slot inside the masthead (e.g. currency chip, action). */
  action?: ReactNode;
}

/** Ledger panel: hairline box with an optional statement masthead. */
export function Panel({ label, action, className = "", children, ...rest }: PanelProps) {
  return (
    <div {...rest} className={`panel ${className}`}>
      {label && (
        <div className="panel-rule flex items-center justify-between px-5 py-2.5">
          <span className="caps">{label}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Label + stretched hairline — replaces "section title" headers. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="caps whitespace-nowrap">{children}</span>
      <span className="rule-after" />
      {action}
    </div>
  );
}
