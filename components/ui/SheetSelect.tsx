"use client";

import { ChevronDown } from "lucide-react";

/**
 * Native-select variant of FloatingSelect for use inside bottom sheets:
 * the OS renders the option list, so a dropdown inside the sheet's own
 * scroll container can never nest a second (menu) scrollbar or clip.
 * Styled to match the FloatingSelect trigger.
 */
export function SheetSelect({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[44px] w-full appearance-none rounded-lg border border-border bg-input px-3.5 pr-9 text-[13px] font-bold text-text outline-none transition-colors focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
        aria-hidden
      />
    </div>
  );
}
