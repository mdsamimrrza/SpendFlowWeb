"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Ledger confirm: sharp panel, caps masthead with brand/danger rule. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="panel w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className={`border-b px-5 py-2.5 ${destructive ? "border-b-2 border-danger" : "border-b-2 border-primary"}`}
        >
          <span className="caps">{title}</span>
        </div>
        <div className="p-5">
          {body && <p className="text-sm text-text-muted">{body}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="h-9 border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-text-muted"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={`h-9 border px-4 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors ${
                destructive ? "border-danger bg-danger hover:opacity-90" : "border-primary bg-primary hover:opacity-90"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

/** Ledger modal: sharp panel with caps masthead rule. */
export function Modal({ open, title, onClose, children, maxWidth = "max-w-lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`panel w-full ${maxWidth} max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ paddingBottom: 0 }}
      >
        <div className="panel-rule sticky top-0 z-10 flex items-center justify-between bg-surface px-5 py-2.5">
          <span className="caps">{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-faint transition-colors hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <div style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
