"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Styled dropdown (the Analytics FloatingSelect, extracted for shared use).
 * Native <select> option lists are OS-rendered and cannot be themed - this
 * renders the open list as a token-styled popover instead. Anchor with a
 * relative-positioned parent; the list is absolutely positioned below.
 */
export function FloatingSelect({
  className = "",
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  className?: string;
  icon?: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex min-h-[44px] w-full items-center justify-between gap-1 rounded-lg border bg-surface px-3.5 py-2.5 transition-colors ${
          open ? "border-primary" : "border-border"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {icon}
          <span className="truncate text-[13px] font-bold text-text">{label}</span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open ? "rotate-180 text-primary" : "text-text-muted"}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="sf-pop absolute left-0 right-0 top-[52px] z-50 space-y-[3px] rounded-xl border border-border bg-surface p-[5px] shadow-pop"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function SelectRow({
  selected,
  label,
  leading,
  onSelect,
}: {
  selected: boolean;
  label: string;
  leading?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition active:scale-[0.99]"
      style={{ backgroundColor: selected ? "var(--sf-select-tint)" : "transparent" }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {leading}
        <span className={`truncate text-[12.5px] ${selected ? "font-extrabold text-primary" : "font-semibold text-text"}`}>
          {label}
        </span>
      </span>
      {selected && <Check size={14} className="shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
