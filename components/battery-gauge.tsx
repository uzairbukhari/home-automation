import { batteryTimeToBoundMinutes } from "@/lib/metrics";
import { LOW_SOC_ALERT_PCT } from "@/lib/insights";

function formatDuration(minutes: number): string {
  return minutes < 60 ? `${Math.round(minutes)} min` : `${(minutes / 60).toFixed(1)} h`;
}

/** Horizontal battery with the SoC fill, a dashed low-battery marker, and energy/flow readouts below. */
export function BatteryGauge({
  socPercent,
  capacityKwh,
  rateW,
  voltage,
}: {
  socPercent: number;
  capacityKwh: number;
  rateW: number;
  voltage: number | null;
}) {
  const soc = Math.min(100, Math.max(0, socPercent));
  const low = soc <= LOW_SOC_ALERT_PCT;
  const storedKwh = (soc / 100) * capacityKwh;
  const bound = batteryTimeToBoundMinutes(soc, capacityKwh, rateW);
  const flow = Math.abs(rateW) < 5 ? "Idle" : `${(Math.abs(rateW) / 1000).toFixed(2)} kW ${rateW > 0 ? "charging" : "discharging"}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-center pt-4">
        <div className="relative w-full max-w-[340px]">
          <div className="relative h-[124px] overflow-hidden rounded-[22px] border-[3px] border-[#3a4c68] bg-[var(--surface-2)]">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-700"
              style={{
                width: `${soc}%`,
                background: low
                  ? "linear-gradient(90deg, #6b3337, #b8625c)"
                  : "linear-gradient(90deg, #2c6b5c, #5fae93)",
              }}
            />
            <div
              className="absolute inset-y-0 border-l border-dashed border-[var(--status-critical)] opacity-80"
              style={{ left: `${LOW_SOC_ALERT_PCT}%` }}
              title={`Low-battery alert at ${LOW_SOC_ALERT_PCT}%`}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums text-white">{Math.round(soc)}%</span>
              <span className="mt-0.5 text-xs text-white/70">
                {bound ? `${bound.direction === "charging" ? "Full" : "Empty"} in ${formatDuration(bound.minutes)}` : "Holding steady"}
              </span>
            </div>
          </div>
          <div className="absolute -right-[11px] top-1/2 h-10 w-2.5 -translate-y-1/2 rounded-r-md bg-[#3a4c68]" />
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-[var(--border)] pt-5">
        <div className="pr-4">
          <p className="text-xs text-[var(--text-muted)]">Energy stored</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {storedKwh.toFixed(2)} kWh
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">of {capacityKwh.toFixed(1)} kWh capacity</p>
        </div>
        <div className="border-l border-[var(--border)] pl-5">
          <p className="text-xs text-[var(--text-muted)]">Battery flow</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">{flow}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{voltage != null ? `${voltage.toFixed(1)} V reported` : "Voltage not reported"}</p>
        </div>
      </div>
    </div>
  );
}
