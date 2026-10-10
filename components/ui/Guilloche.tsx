import { useMemo } from "react";

/**
 * Engraved Banknote motif (2026-10-10 redesign): a layered polar-rose
 * rosette that reads like the guilloche engraving on a banknote. Pure
 * geometry, no assets. Stroke follows `currentColor` — place it absolutely
 * behind a hero figure and tint it with a token text color at low opacity.
 * Rule: one ornament per view (docs/DESIGN-TOKEN-BRIDGE.md §0).
 */
export function Guilloche({
  className,
  petals = 12,
  rings = 3,
}: {
  className?: string;
  petals?: number;
  rings?: number;
}) {
  const paths = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < rings; i++) {
      const k = petals + i * 6;
      const amp = 86 - i * 14;
      const pts: string[] = [];
      for (let s = 0; s <= 360; s++) {
        const t = (s / 360) * Math.PI * 2;
        const r = amp * Math.cos(k * t);
        const x = 100 + r * Math.cos(t);
        const y = 100 + r * Math.sin(t);
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      out.push(pts.join(" "));
    }
    return out;
  }, [petals, rings]);

  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
    >
      {paths.map((d, i) => (
        <polyline key={i} points={d} />
      ))}
    </svg>
  );
}
