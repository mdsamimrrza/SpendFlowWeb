import type { MetadataRoute } from "next";

// PWA manifest — icons are generated from the SpendFlow mobile app's
// brand artwork by scripts/generate-web-icons.cjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpendFlow — Your personal ledger",
    short_name: "SpendFlow",
    description:
      "Track expenses, income, budgets and transfers. Companion web app to the SpendFlow mobile app.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f19",
    theme_color: "#0b0f19",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
