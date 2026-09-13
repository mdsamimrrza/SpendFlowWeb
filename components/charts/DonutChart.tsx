"use client";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
}

/** Category breakdown donut (mobile CategoryBreakdown, simplified — no flip cycle in v1). */
export function DonutChart({ slices, centerLabel, centerValue }: DonutChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;

  let offset = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total > 0 ? s.value / total : 0;
      const seg = { ...s, dash: frac * C, offset };
      offset += frac * C;
      return seg;
    });

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0 -rotate-90" role="img" aria-label="Category breakdown">
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--sf-surface-elevated)" strokeWidth="22" />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx="90"
            cy="90"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="22"
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="min-w-0 flex-1">
        {centerValue && (
          <p className="numeric mb-2 text-xl font-extrabold text-text">{centerValue}</p>
        )}
        {centerLabel && <p className="mb-2 text-xs text-text-muted">{centerLabel}</p>}
        <ul className="space-y-1.5">
          {segments.slice(0, 6).map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate text-text">{s.label}</span>
              <span className="numeric text-text-muted">
                {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "0%"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
