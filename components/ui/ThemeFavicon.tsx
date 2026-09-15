"use client";

import { useEffect } from "react";
import { useTheme } from "@/store/ThemeContext";

const LIGHT = "#EDEAE0";
const DARK = "#0B0F19";

/**
 * Keeps the tab icon and browser theme color in sync with the IN-APP theme.
 * The metadata links in app/layout.tsx only follow the OS
 * `prefers-color-scheme`; we retarget every icon link to the theme's asset.
 *
 * Rules of engagement with Next 16's head manager:
 *  - NEVER remove() or append() head tags — Next tracks the exact nodes and
 *    detaching them throws "removeChild of null" at runtime.
 *  - Next streams some links (the /favicon.ico convention, metadata) AFTER
 *    hydration, so a one-shot effect misses them; a MutationObserver on
 *    <head> themes late arrivals too. apply() is idempotent (compare before
 *    write) so the observer can't loop.
 *  - Browsers key the favicon cache by full URL — the ?theme= suffix makes
 *    each swap a new resource and forces the tab to repaint.
 */
export function ThemeFavicon() {
  const { isDark } = useTheme();

  useEffect(() => {
    const apply = () => {
      const icon = isDark ? "/icons/tab-dark.png?theme=dark" : "/icons/tab-light.png?theme=light";
      const abs = new URL(icon, window.location.href).href;
      document
        .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
        .forEach((l) => {
          if (l.hasAttribute("media")) l.removeAttribute("media");
          if (l.href !== abs) l.href = icon;
        });
      const color = isDark ? DARK : LIGHT;
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
        if (m.hasAttribute("media")) m.removeAttribute("media");
        if (m.content !== color) m.content = color;
      });
    };

    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { childList: true, subtree: true, attributes: true });
    return () => mo.disconnect();
  }, [isDark]);

  return null;
}
