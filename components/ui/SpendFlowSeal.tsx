/** SpendFlow brand mark — gradient tile with a flow curve (all themes). */
export function SpendFlowSeal({ size = 72 }: { size?: number }) {
  const id = `sf-mark-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="SpendFlow mark"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--sf-primary)" />
          <stop offset="1" stopColor="var(--sf-primary-strong)" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="88" height="88" rx="26" fill={`url(#${id})`} />
      <path
        d="M22 62c10-22 18-4 26-14s16-16 26-14"
        fill="none"
        stroke="#fff"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="70" cy="66" r="5" fill="#fff" opacity="0.85" />
    </svg>
  );
}
