import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Card header label rendered above the body. */
  label?: string;
  /** Right-aligned slot inside the header (e.g. currency chip, action). */
  action?: ReactNode;
}

/** Card: soft white tile with an optional header row. A flex column so a
 *  single body child can fill (and evenly consume) a stretched grid row. */
export function Panel({ label, action, className = "", children, ...rest }: PanelProps) {
  return (
    <div {...rest} className={`panel flex flex-col ${className}`}>
      {label && (
        <div className="panel-rule flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <span className="caps whitespace-nowrap">{label}</span>
          {action && (
            // Constrained slot: long actions shrink (min-w-0) and scroll or
            // truncate inside — they never push the masthead wider.
            <div className="flex min-w-0 items-center justify-end overflow-hidden">
              {action}
            </div>
          )}
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
