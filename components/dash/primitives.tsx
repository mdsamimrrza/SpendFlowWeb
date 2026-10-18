"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { FitText } from "@/components/ui/FitText";

/** Sage pill for in-card header actions ("View all" / "Analytics"). */
export const cardPillClass =
  "inline-flex h-7 items-center rounded-full bg-[var(--sf-primary-light)] px-3 text-[11.5px] font-semibold text-primary-strong transition-[filter] hover:brightness-95";

/** Card header action that navigates. */
export function CardPillLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cardPillClass}>
      {children}
    </Link>
  );
}

/**
 * Statement section (hairline rule + small-caps label, content directly on
 * the page). Still the structural device on the register-style pages; the
 * overview now composes DashCards instead.
 */
export function Section({
  label,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  label: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`border-t border-border pt-5 ${className}`}>
      <div className="mb-4 flex min-h-6 items-center justify-between gap-3">
        <h2 className="truncate text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">
          {label}
        </h2>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * Dashboard card (V5): a .panel tile with the title INSIDE the card and an
 * optional action on the right – the reference dashboard's card pattern.
 * `title` is optional for cards that carry their own header (calendar).
 */
export function DashCard({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel min-w-0 p-4 sm:p-5 ${className}`}>
      {title != null && (
        <div className="mb-4 flex min-h-7 items-center justify-between gap-3">
          <h2 className="truncate text-[14px] font-bold tracking-[-0.01em] text-text">
            {title}
          </h2>
          {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * Stat card – the reference's signature top row: a pastel circular icon
 * chip, a small label, the figure, and a caption line. tone picks the
 * chip tint (sage / beige / blue / rose).
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
  className = "",
}: {
  icon: typeof TrendingUp;
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone: "sage" | "beige" | "blue" | "rose";
  className?: string;
}) {
  const tones = {
    sage: "bg-[var(--sf-chip-sage-bg)] text-[var(--sf-chip-sage-ink)]",
    beige: "bg-[var(--sf-chip-beige-bg)] text-[var(--sf-chip-beige-ink)]",
    blue: "bg-[var(--sf-chip-blue-bg)] text-[var(--sf-chip-blue-ink)]",
    rose: "bg-[var(--sf-chip-rose-bg)] text-[var(--sf-chip-rose-ink)]",
  } as const;
  return (
    <div className={`panel min-w-0 p-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tones[tone]}`}>
          <Icon size={16} />
        </span>
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-text-muted">
          {label}
        </span>
      </div>
      <div className="figures mt-3 leading-6 text-text sm:leading-7">
        <FitText basePx={20} minPx={13} className="numeric font-semibold tracking-[-0.01em] sm:text-[24px]">
          {value}
        </FitText>
      </div>
      {caption != null && (
        <div className="mt-1.5 flex min-h-5 items-center gap-1.5 text-[11.5px] text-faint">
          {caption}
        </div>
      )}
    </div>
  );
}

/** Signed change pill (e.g. net vs the previous cycle). */
export function DeltaChip({ text, positive }: { text: string; positive: boolean }) {
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${
        positive
          ? "bg-[var(--sf-tint-success)] text-income"
          : "bg-[var(--sf-tint-danger)] text-danger"
      }`}
    >
      <Icon size={12} aria-hidden />
      {text}
    </span>
  );
}

/** Range chip for chart switchers. */
export function RangeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors ${
        active
          ? "bg-[var(--sf-primary-light)] text-primary-strong"
          : "text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
