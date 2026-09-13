"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  children: ReactNode;
}

/**
 * Ledger button: sharp rectangle, small-caps text. Primary is solid brand;
 * secondary is hairline-outline; danger is solid rust; ghost is text-only.
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
    primary: "bg-primary text-white border border-primary hover:bg-primary-strong",
    secondary: "bg-transparent text-text border border-border hover:border-text-muted",
    danger: "bg-danger text-white border border-danger hover:opacity-90",
    ghost: "bg-transparent text-primary border border-transparent hover:bg-primary-light",
  } as const;
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex h-10 items-center justify-center gap-2 px-5 text-xs font-bold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
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
