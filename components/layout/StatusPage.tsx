"use client";

import type { ReactNode } from "react";
import { SpendFlowSeal } from "@/components/ui/SpendFlowSeal";

interface StatusPageProps {
  /** Lucide icon rendered inside the tone chip. */
  icon: ReactNode;
  tone: "brand" | "danger";
  /** Big display figure, e.g. "404". Omitted on runtime-error pages. */
  figure?: string;
  title: string;
  body: string;
  actions: ReactNode;
}

/**
 * Shared full-screen status layout (404 / error / global-error).
 * Mobile-first: stacks actions on phones, centers in a 420 px column,
 * no horizontal overflow at 390 px. All copy comes from the caller
 * (i18n `t()`), never hardcoded here.
 */
export function StatusPage({ icon, tone, figure, title, body, actions }: StatusPageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] text-center">
        <div className="flex items-center justify-center gap-2">
          <SpendFlowSeal size={30} />
          <span className="font-brand text-lg font-bold text-text">SpendFlow</span>
        </div>

        <div
          className={`mx-auto mt-9 flex h-14 w-14 items-center justify-center rounded-full ${
            tone === "danger" ? "bg-rust-tint text-danger" : "bg-primary-light text-primary-strong"
          }`}
        >
          {icon}
        </div>

        {figure && (
          <p className="mt-6 font-brand text-[64px] font-extrabold leading-none tracking-tight text-text">
            {figure}
          </p>
        )}
        <h1 className={`font-extrabold tracking-tight text-text ${figure ? "mt-3" : "mt-5"} text-xl`}>
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-text-muted">{body}</p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">{actions}</div>
      </div>
    </main>
  );
}
