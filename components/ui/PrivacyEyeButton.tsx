"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/store/PrivacyContext";

/** Global privacy-mode toggle (mobile PrivacyEyeButton parity). */
export function PrivacyEyeButton({ className = "p-2" }: { className?: string }) {
  const { isPrivacyMode, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      aria-label={isPrivacyMode ? "Show amounts" : "Hide amounts"}
      aria-pressed={isPrivacyMode}
      className={`grid place-items-center rounded-md text-text-muted transition hover:bg-surface-elevated active:scale-[0.97] ${className}`}
    >
      {isPrivacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
