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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Stat icon={Repeat} label="Equivalent full cycles" value={lifetimeCycles.toFixed(1)} accent="var(--series-3)" />
      <Stat
        icon={BatteryCharging}
        label="SoC range, last 30 days"
        value={rangeMin != null && rangeMax != null ? `${Math.round(rangeMin)}–${Math.round(rangeMax)}%` : "—"}
        accent="var(--series-1)"
      />
      <Stat
        icon={ArrowDownUp}
        label="Average daily depth of discharge"
        value={avgDod != null ? `${Math.round(avgDod)}%` : "—"}
        accent="var(--series-7)"
      />
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
    <div className="tile flex items-center gap-3.5 p-4">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}
      >
        <Icon size={17} />
      </span>
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
}
