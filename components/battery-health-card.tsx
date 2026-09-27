import { BatteryCharging, Repeat, ArrowDownUp } from "lucide-react";
import { cumulativeBatteryCycles } from "@/lib/metrics";

export interface BatteryHealthRow {
  date: string;
  minSocPct: number | null;
  maxSocPct: number | null;
  chargeKwh: number;
  dischargeKwh: number;
}

export function BatteryHealthCard({
  recentRows,
  allRows,
  batteryKwh,
}: {
  recentRows: BatteryHealthRow[];
  allRows: BatteryHealthRow[];
  batteryKwh: number;
}) {
  const lifetimeCycles = cumulativeBatteryCycles(allRows, batteryKwh);

  const socMins = recentRows.map((r) => r.minSocPct).filter((v): v is number => v != null);
  const socMaxes = recentRows.map((r) => r.maxSocPct).filter((v): v is number => v != null);
  const rangeMin = socMins.length ? Math.min(...socMins) : null;
  const rangeMax = socMaxes.length ? Math.max(...socMaxes) : null;

  const dodRows = recentRows.filter((r) => r.minSocPct != null && r.maxSocPct != null);
  const avgDod = dodRows.length
    ? dodRows.reduce((sum, r) => sum + (r.maxSocPct! - r.minSocPct!), 0) / dodRows.length
    : null;

  return (
    <div className="glass-card p-5 flex flex-col gap-3">
      <h2 className="text-sm font-medium text-[var(--text-primary)]">Battery health</h2>
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Repeat} label="Lifetime cycles" value={lifetimeCycles.toFixed(1)} accent="var(--series-3)" />
        <Stat
          icon={BatteryCharging}
          label="30d SoC range"
          value={rangeMin != null && rangeMax != null ? `${Math.round(rangeMin)}–${Math.round(rangeMax)}%` : "—"}
          accent="var(--series-1)"
        />
        <Stat
          icon={ArrowDownUp}
          label="Avg daily DoD"
          value={avgDod != null ? `${Math.round(avgDod)}%` : "—"}
          accent="var(--series-7)"
        />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Repeat;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="w-fit rounded-full p-1.5"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
      >
        <Icon size={14} />
      </span>
      <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{value}</span>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
