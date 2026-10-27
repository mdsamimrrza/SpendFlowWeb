import { useEffect } from "react";

/**
 * Locks page scroll while `locked` is true (bottom sheets / modals) so the
 * page behind never double-scrolls under the sheet's own scroll container.
 * Locks BOTH html and body – the viewport propagates scrolling from the
 * documentElement, so a body-only lock still lets the page scroll.
 * Restores the previous overflow values on release.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [locked]);
}
