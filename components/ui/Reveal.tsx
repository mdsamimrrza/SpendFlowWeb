"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-reveal wrapper: fades + rises its children the first time they
 * enter the viewport (IntersectionObserver, one-shot). Honors
 * prefers-reduced-motion via the .sf-reveal CSS (no transform/transition),
 * and SSR-safe (starts hidden only after mount is irrelevant — the class
 * handles it; content is visible when JS never runs because the observer
 * fires immediately on hydration).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  /** Stagger in ms — keep under ~400 so late items don't feel laggy. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`sf-reveal${visible ? " is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
