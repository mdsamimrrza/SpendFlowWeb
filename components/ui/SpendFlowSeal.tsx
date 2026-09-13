/** SpendFlow brand seal — concentric-ring SVG mark (mobile SpendFlowSealLogo parity). */
export function SpendFlowSeal({ size = 72 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="SpendFlow seal"
      className="drop-shadow-sm"
    >
      <circle cx="48" cy="48" r="45" fill="var(--sf-surface)" stroke="var(--sf-brass)" strokeWidth="2.5" />
      <circle cx="48" cy="48" r="37" fill="none" stroke="var(--sf-brass)" strokeWidth="1" strokeDasharray="2.5 3.5" opacity="0.7" />
      <circle cx="48" cy="48" r="29" fill="var(--sf-primary-light)" stroke="var(--sf-primary)" strokeWidth="1.5" />
      <text
        x="48"
        y="60"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="32"
        fontWeight="700"
        fill="var(--sf-primary)"
      >
        S
      </text>
    </svg>
  );
}
