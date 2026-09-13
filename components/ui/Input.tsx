"use client";

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  leftAdornment?: ReactNode;
}

/** Ledger input: small-caps label, sharp hairline box, brand underline focus. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, leftAdornment, className = "", id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="caps mb-1.5 block">
          {label}
        </label>
      )}
      <div className="relative">
        {leftAdornment && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-text-muted">
            {leftAdornment}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={`h-10 w-full border bg-input px-3 text-sm text-text placeholder:text-faint focus:border-primary focus:outline-none ${
            error ? "border-danger" : "border-border"
          } ${leftAdornment ? "pl-9" : ""} ${className}`}
          {...rest}
        />
      </div>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string | null;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className = "", children, id, ...rest },
  ref,
) {
  const selectId = id ?? rest.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="caps mb-1.5 block">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={!!error}
        className={`h-10 w-full border bg-input px-2.5 text-sm text-text focus:border-primary focus:outline-none ${
          error ? "border-danger" : "border-border"
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
});
