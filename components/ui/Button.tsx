"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  children: ReactNode;
}

/**
 * Neo button: rounded-full, sentence-case semibold. Primary is solid brand;
 * secondary is quiet filled; danger is solid; ghost is text-only.
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const VARIANTS = {
    primary:
      "bg-primary text-white shadow-soft hover:bg-primary-strong active:scale-[0.98]",
    secondary:
      "bg-surface-elevated text-text border border-transparent hover:border-border",
    danger:
      "bg-danger text-white shadow-soft hover:opacity-90 active:scale-[0.98]",
    ghost: "bg-transparent text-primary hover:bg-primary-light",
  } as const;
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
