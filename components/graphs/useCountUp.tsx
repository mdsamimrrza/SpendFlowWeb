"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates toward `value` with an ease-out and returns it run through
 * `format` – the figure a CountUp renders. Re-animates from the previous
 * value whenever `value` changes; jumps straight there under reduced motion.
 */
export function useCountUp(
  value: number,
  format: (n: number) => string,
  duration = 750,
  fromZero = false,
): string {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromZero && !hasAnimatedRef.current ? 0 : fromRef.current;
    if (from === value) return;
    if (fromZero) hasAnimatedRef.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, fromZero]);

  return format(display);
}

export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  return <span className={className}>{useCountUp(value, format)}</span>;
}
