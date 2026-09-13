"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

interface FitTextProps {
  children: ReactNode;
  /** Starting font size in px; shrinks in 1px steps until the text fits. */
  basePx: number;
  /** Lower bound so figures never become unreadable. */
  minPx?: number;
  className?: string;
  title?: string;
}

/**
 * adjustsFontSizeToFit for the web: renders on one line and steps the font
 * size down (basePx → minPx) until the content fits its container. Re-fits on
 * text change and container resize, so long currency figures can never
 * overflow the panel column.
 *
 * Rendered as a block-level <span> so it is valid inside <p> elements too
 * (a <div> descendant of <p> causes React hydration errors).
 */
export function FitText({ children, basePx, minPx = 13, className = "", title }: FitTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    const fit = () => {
      el.style.fontSize = `${basePx}px`;
      const maxW = wrap.clientWidth;
      let size = basePx;
      // Guard against pathological loops.
      let guard = 0;
      while (el.scrollWidth > maxW && size > minPx && guard < 200) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        guard += 1;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [children, basePx, minPx]);

  return (
    <span
      ref={wrapRef}
      title={title}
      className={`block w-full overflow-hidden ${className}`}
    >
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap leading-[1.05]"
        style={{ fontSize: basePx }}
      >
        {children}
      </span>
    </span>
  );
}
