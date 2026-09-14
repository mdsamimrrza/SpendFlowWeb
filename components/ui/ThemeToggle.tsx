"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "@/store/ThemeContext";

/** Cycles light → dark → system (mobile ThemeToggle parity). */
export function ThemeToggle({ className = "p-2" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const next = preference === "light" ? "dark" : preference === "dark" ? "system" : "light";
  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : SunMoon;
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
