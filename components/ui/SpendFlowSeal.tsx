/**
 * SpendFlow brand mark — the app's "S" medallion, matching the mobile icon
 * and the tab favicon. Two renderings swap with the theme via the `dark:`
 * variant (class strategy): brass-on-parchment light, brass-on-navy dark.
 * Artwork: public/icons/brand-{light,dark}.png (scripts/generate-web-icons.cjs).
 */
export function SpendFlowSeal({ size = 72 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="SpendFlow mark"
      className="relative inline-block shrink-0 align-middle"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/brand-light.png"
        alt=""
        width={size}
        height={size}
        className="absolute inset-0 h-full w-full rounded-[22%] dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/brand-dark.png"
        alt=""
        width={size}
        height={size}
        className="absolute inset-0 hidden h-full w-full rounded-[22%] dark:block"
      />
    </span>
  );
}
