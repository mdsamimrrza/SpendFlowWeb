"use client";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Cycle spending mix, built for dominant-slice reality (rent ≈ 85% of a
 * month is normal): the ring carries a center readout with the top
 * category's share + name, and every legend row pairs a proportional
 * mini-bar with % and amount – so a 1% sliver stays meaningful next to an
 * 85% sweep. Tiny slices draw with butt caps so rounded ends can't bleed
 * into neighbours. Returns null with no data so the card vanishes cleanly.
 */
export function MixCard({
  slices,
  format,
  otherLabel,
}: {
  slices: DonutSlice[];
  format: (n: number) => string;
  otherLabel: string;
}) {
  // Fold everything past the top 6 slices into "Other".
  const top = slices.slice(0, 6);
  const tail = slices.slice(6).reduce((s, x) => s + x.value, 0);
  const shown =
    tail > 0
      ? [...top, { label: otherLabel, value: tail, color: "var(--sf-hue-indigo)" }]
      : top;
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0 || shown.length === 0) return null;

  const R = 15.9155; // radius for a circumference of 100 – dasharray in %
  const C = 100;
  const gap = shown.length > 1 ? 1.2 : 0;
  let acc = 0;
  const segments = shown.map((s) => {
    const frac = (s.value / total) * C;
    const dash = Math.max(0.8, frac - gap);
    const seg = { ...s, dash, offset: acc, round: dash > 5 };
    acc += frac;
    return seg;
  });

  const lead = shown[0];
  const leadPct = Math.round((lead.value / total) * 100);
  // When one category dominates (rent ≈ 85% is normal), a multi-slice
  // donut turns to sliver soup – the ring becomes a single progress arc
  // for the top category on a neutral track instead. Balanced months keep
  // the full donut.
  const dominant = leadPct >= 50;

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 42 42"
          className="h-40 w-40 -rotate-90"
          role="img"
          aria-label="Spending mix"
        >
          <circle
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke="var(--sf-surface-elevated)"
            strokeWidth="5.5"
          />
          {dominant ? (
            <>
              <circle
                cx="21"
                cy="21"
                r={R}
                fill="none"
                stroke={lead.color}
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(leadPct - 1.5, 1)} ${C - Math.max(leadPct - 1.5, 1)}`}
                className="sweep"
              >
                <title>{`${lead.label} · ${format(lead.value)}`}</title>
              </circle>
              {/* the remaining categories follow as clean butt-capped ticks */}
              {segments.slice(1).map((s) => (
                <circle
                  key={s.label}
                  cx="21"
                  cy="21"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="5.5"
                  strokeLinecap="butt"
                  strokeDasharray={`${Math.max(s.dash, 1)} ${C - Math.max(s.dash, 1)}`}
                  strokeDashoffset={-s.offset}
                  className="sweep"
                >
                  <title>{`${s.label} · ${format(s.value)}`}</title>
                </circle>
              ))}
            </>
          ) : (
            segments.map((s) => (
              <circle
                key={s.label}
                cx="21"
                cy="21"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="5.5"
                strokeLinecap={s.round ? "round" : "butt"}
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.offset}
                className="sweep"
              >
                <title>{`${s.label} · ${format(s.value)}`}</title>
              </circle>
            ))
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="figures text-[22px] leading-6 tracking-[-0.01em] text-text">
            {leadPct}%
          </span>
          <span className="mt-0.5 w-full truncate text-[10.5px] font-medium text-text-muted">
            {lead.label || otherLabel}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {shown.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          return (
            <li
              key={seg.label}
              className="flex items-center gap-2.5"
              title={`${seg.label} · ${format(seg.value)}`}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-[var(--sf-border)]"
                style={{ background: seg.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text">
                {seg.label || otherLabel}
              </span>
              <span
                aria-hidden
                className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--sf-track)] sm:w-24"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    minWidth: pct > 0 ? 3 : 0,
                    background: seg.color,
                  }}
                />
              </span>
              <span className="numeric w-8 shrink-0 text-right text-[11px] text-faint">
                {pct}%
              </span>
              <span className="numeric w-24 shrink-0 text-right text-[12.5px] text-text">
                {format(seg.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
