"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/store/PrivacyContext";

/** Global privacy-mode toggle (mobile PrivacyEyeButton parity). */
export function PrivacyEyeButton() {
  const { isPrivacyMode, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      aria-label={isPrivacyMode ? "Show amounts" : "Hide amounts"}
      aria-pressed={isPrivacyMode}
      className="rounded-md p-2 text-text-muted transition hover:bg-surface-elevated active:scale-[0.97]"
    >
      {isPrivacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
