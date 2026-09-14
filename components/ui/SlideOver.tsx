"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/store/LanguageContext";

interface SlideOverProps {
  open: boolean;
  /** Caps masthead label (ledger style — e.g. "Transaction record"). */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional hairline-ruled footer (actions live here). */
  footer?: ReactNode;
}

/**
 * Right-docked record sheet — the web-only drill-in surface (more detail than
 * mobile's centered modals). Same portal/Escape semantics as Modal, docked to
 * the trailing edge with a full-height hairline panel and caps masthead.
 */
export function SlideOver({ open, title, onClose, children, footer }: SlideOverProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/50 max-sm:items-end"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sf-slide-over flex flex-col border-border bg-surface max-sm:max-h-[88vh] max-sm:w-full max-sm:border-t-2 max-sm:border-primary sm:h-full sm:w-full sm:max-w-[540px] sm:border-l"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-rule flex shrink-0 items-center justify-between px-5 py-3">
          <span className="caps">{title}</span>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t("close")}
            className="text-faint transition-colors hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="end-rule shrink-0 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
