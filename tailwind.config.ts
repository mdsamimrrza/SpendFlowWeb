import type { Config } from "tailwindcss";

/**
 * Token values come from docs/DESIGN-TOKEN-BRIDGE.md (mirror of mobile
 * constants/theme.ts). Components must use these semantic names — never raw hex.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--sf-primary)",
        "primary-strong": "var(--sf-primary-strong)",
        "primary-light": "var(--sf-primary-light)",
        accent: "var(--sf-accent)",
        success: "var(--sf-success)",
        income: "var(--sf-income)",
        warning: "var(--sf-warning)",
        danger: "var(--sf-danger)",
        rust: "var(--sf-rust)",
        info: "var(--sf-info)",
        background: "var(--sf-background)",
        surface: "var(--sf-surface)",
        "surface-elevated": "var(--sf-surface-elevated)",
        text: "var(--sf-text)",
        "text-muted": "var(--sf-text-muted)",
        faint: "var(--sf-faint)",
        border: "var(--sf-border)",
        input: "var(--sf-input)",
        tab: "var(--sf-tab)",
        "accent-bg": "var(--sf-accent-bg)",
        brass: "var(--sf-brass)",
        "brass-tint": "var(--sf-brass-tint)",
        "rust-tint": "var(--sf-rust-tint)",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        brand: ["Georgia", "Times New Roman", "serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
        float: "float 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
