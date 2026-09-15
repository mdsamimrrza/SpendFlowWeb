"use client";

/**
 * Mobile-chrome primitives — exact ports of the shared RN components the
 * pushed mobile screens use (components/ui/ConfirmDialog.tsx, EmptyState.tsx)
 * and the per-screen header bar pattern (app/bin.tsx, app/categories.tsx,
 * app/accounts.tsx, app/bullion.tsx, app/export.tsx, app/profit-loss.tsx).
 * These give the web sub-pages the same card language as the APK.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, X, type LucideIcon } from "lucide-react";

/**
 * Sub-page context strip — the web counterpart of the APK's pushed-screen
 * header, deliberately demoted so it never competes with the app header above
 * it: a 44px quiet row on the page background, a 28px back chip, the screen
 * name in small caps with its caption inline, and the screen's own action on
 * the right. It sits flush against the shell header (`-mt-6` cancels the
 * shell's top padding) with a full-bleed hairline beneath, while the row
 * itself stays aligned to the 560px column the mirrored screens use.
 */
export function MobileHeaderBar({
  title,
  caption,
  right,
}: {
  title: string;
  caption?: ReactNode;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="relative left-1/2 -mt-6 mb-3 h-11 w-screen -translate-x-1/2 border-b border-border">
      <div className="mx-auto flex h-full w-full max-w-[560px] items-center gap-2 px-4 sm:px-5">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-text-muted transition hover:text-text active:opacity-70"
        >
          <ArrowLeft size={14} aria-hidden />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h1 className="truncate text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-text">
            {title}
          </h1>
          {caption ? (
            <p className="truncate text-[11px] font-semibold text-text-muted">· {caption}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end">{right}</div>
      </div>
    </header>
  );
}

/** Mobile ui/ConfirmDialog: rounded-24 card, danger chip, h-50 button pair. */
export function MobileConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/[0.68] p-5"
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="sf-pop w-full max-w-[420px] rounded-[24px] border border-border bg-surface p-5 shadow-[0_10px_18px_rgb(0_0_0/0.28)]"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[15px] bg-[var(--sf-set-danger-bg)]">
            <AlertTriangle size={21} className="text-danger" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold leading-6 text-text">{title}</p>
            <p className="mt-1 text-[15px] leading-5 text-text-muted">{message}</p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="shrink-0 p-1 text-text-muted transition active:opacity-70"
          >
            <X size={19} aria-hidden />
          </button>
        </div>
        <div className="mt-[18px] flex w-full gap-2.5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="h-[50px] min-w-0 flex-1 rounded-[10px] bg-surface-elevated text-[13px] font-bold text-text transition active:scale-[0.96] disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={loading}
            className="h-[50px] min-w-0 flex-1 rounded-[10px] bg-danger text-[13px] font-bold text-white transition active:scale-[0.96] disabled:opacity-60"
          >
            {loading ? (
              <span
                aria-hidden
                className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Mobile ui/EmptyState: rounded-20 paper card, 60px teal icon circle. */
export function MobileEmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="my-3 flex flex-col items-center gap-3.5 rounded-[20px] border-[1.5px] border-border bg-surface px-6 py-9 text-center shadow-[0_2px_10px_var(--sf-set-card-shadow)]">
      <span className="mb-0.5 grid h-[60px] w-[60px] place-items-center rounded-full bg-primary-light">
        <Icon size={30} className="text-primary" aria-hidden />
      </span>
      <div className="max-w-[280px]">
        <p className="text-lg font-extrabold leading-6 text-text">{title}</p>
        <p className="mt-1 text-[13px] leading-[18px] text-text-muted">{message}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className="mt-1 h-11 rounded-[10px] bg-primary px-6 text-[13px] font-bold text-white transition active:scale-[0.96]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Mobile Button (primary/secondary/destructive/ghost) as a web button. */
export function MobileButton({
  children,
  variant = "primary",
  loading = false,
  disabled = false,
  className = "",
  onClick,
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const tone =
    variant === "primary"
      ? "bg-primary text-white"
      : variant === "destructive"
        ? "bg-danger text-white"
        : variant === "secondary"
          ? "bg-surface-elevated text-text"
          : "bg-transparent text-text";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex min-h-[46px] max-w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-bold transition active:scale-[0.96] disabled:opacity-60 ${tone} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden
          className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        children
      )}
    </button>
  );
}
