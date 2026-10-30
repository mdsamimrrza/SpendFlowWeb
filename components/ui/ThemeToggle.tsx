"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/store/ThemeContext";

/** Cycles light ↔ dark. */
export function ThemeToggle({ className = "p-2" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const next = preference === "light" ? "dark" : "light";
  const Icon = preference === "dark" ? Moon : Sun;
  const label = `Theme: ${preference} (click for ${next})`;
  return (
    <button
      onClick={() => setPreference(next)}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-md text-text-muted transition hover:bg-surface-elevated active:scale-[0.97] ${className}`}
    >
      <Icon size={18} />
    </button>
  );
}
