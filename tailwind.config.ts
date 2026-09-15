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
        "card-highlight": "var(--sf-card-highlight)",
        brass: "var(--sf-brass)",
        "brass-tint": "var(--sf-brass-tint)",
        "rust-tint": "var(--sf-rust-tint)",
        "hue-amber": "var(--sf-hue-amber)",
        "hue-sky": "var(--sf-hue-sky)",
        "hue-sky-ink": "var(--sf-hue-sky-ink)",
        "hue-emerald": "var(--sf-hue-emerald)",
        "hue-indigo": "var(--sf-hue-indigo)",
        "hue-violet": "var(--sf-hue-violet)",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(10 14 12 / 0.05), 0 8px 24px rgb(10 14 12 / 0.06)",
        pop: "0 4px 12px rgb(10 14 12 / 0.10), 0 16px 40px rgb(10 14 12 / 0.14)",
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
        brand: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
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
