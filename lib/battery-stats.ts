/** Everything the inverter and the grid meter tell us about one local day. */
export type DayStat = {
  date: string; coveredHours: number; partial: boolean;
  chargedKwh: number | null; dischargedKwh: number | null; homeKwh: number | null; directSolarKwh: number | null; inverterGridKwh: number | null;
  socMin: number | null; socMax: number | null; socStart: number | null; socEnd: number | null; peakSolarW: number | null;
  /** Grid import measured by the upstream Tuya meter (WiFi Smart Meter Pro). */
  meterGridKwh: number | null;
};
const sum = (values: (number | null)[]) => { const present = values.filter((n): n is number => n !== null); return present.length ? present.reduce((a, b) => a + b, 0) : null; };
export const sumDays = (days: DayStat[]) => ({
  homeKwh: sum(days.map(d => d.homeKwh)), directSolarKwh: sum(days.map(d => d.directSolarKwh)),
  chargedKwh: sum(days.map(d => d.chargedKwh)), dischargedKwh: sum(days.map(d => d.dischargedKwh)),
  meterGridKwh: sum(days.map(d => d.meterGridKwh)), inverterGridKwh: sum(days.map(d => d.inverterGridKwh)),
});

export const WARRANTY_CYCLES = 3000;
const EFFICIENCY = 0.97; // one-way LiFePO4 conversion, applied to terminal energy to estimate energy stored

export type BatteryStats = {
  capacityKwh: number; warrantyCycles: number; trackedDays: number; since: string | null;
  chargedKwh: number | null; dischargedKwh: number | null; cycles: number | null; cyclesLast30: number | null; cyclesPerDay: number | null;
  warrantyUsedPct: number | null; cyclesRemaining: number | null; yearsRemaining: number | null;
  avgDepthPct: number | null; deepestPct: number | null; throughputKwh: number | null;
  health: { pct: number; estimatedCapacityKwh: number; samples: number } | null; healthDays: number;
  daily: Array<{ date: string; chargedKwh: number | null; dischargedKwh: number | null; cycles: number | null; socMin: number | null; socMax: number | null }>;
};

export function batteryStats(days: DayStat[], capacityKwh: number): BatteryStats {
  const used = days.filter(d => d.dischargedKwh !== null || d.chargedKwh !== null);
  const charged = sum(used.map(d => d.chargedKwh)), discharged = sum(used.map(d => d.dischargedKwh)), cycles = discharged === null ? null : discharged / capacityKwh;
  const recent = used.slice(-30), recentDischarged = sum(recent.map(d => d.dischargedKwh)), cyclesLast30 = recentDischarged === null ? null : recentDischarged / capacityKwh;
  const cyclesPerDay = cyclesLast30 === null || !recent.length ? null : cyclesLast30 / recent.length;
  const depths = used.filter(d => d.socMin !== null && d.socMax !== null && d.coveredHours >= 12).map(d => d.socMax! - d.socMin!);
  // Capacity from energy per percent of charge: on days that swing the state of charge by 20 points or more,
  // (energy in − energy out, corrected for conversion losses) / ΔSOC is the battery's usable capacity.
  const estimates = used.filter(d => d.coveredHours >= 20 && d.socStart !== null && d.socEnd !== null && Math.abs(d.socEnd - d.socStart) >= 20 && d.chargedKwh !== null && d.dischargedKwh !== null)
    .map(d => (d.chargedKwh! * EFFICIENCY - d.dischargedKwh! / EFFICIENCY) / ((d.socEnd! - d.socStart!) / 100)).filter(v => v > 0.3 * capacityKwh && v < 2 * capacityKwh).sort((a, b) => a - b);
  const median = estimates.length ? estimates[Math.floor(estimates.length / 2)] : null;
  return {
    capacityKwh, warrantyCycles: WARRANTY_CYCLES, trackedDays: used.length, since: used[0]?.date ?? null,
    chargedKwh: charged, dischargedKwh: discharged, cycles, cyclesLast30, cyclesPerDay,
    warrantyUsedPct: cycles === null ? null : (cycles / WARRANTY_CYCLES) * 100, cyclesRemaining: cycles === null ? null : Math.max(0, WARRANTY_CYCLES - cycles),
    yearsRemaining: cycles !== null && cyclesPerDay ? Math.max(0, WARRANTY_CYCLES - cycles) / (cyclesPerDay * 365) : null,
    avgDepthPct: depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : null, deepestPct: depths.length ? Math.max(...depths) : null,
    throughputKwh: charged === null && discharged === null ? null : (charged ?? 0) + (discharged ?? 0),
    health: median === null || estimates.length < 3 ? null : { pct: Math.min(100, (median / capacityKwh) * 100), estimatedCapacityKwh: median, samples: estimates.length }, healthDays: estimates.length,
    daily: used.slice(-30).map(d => ({ date: d.date, chargedKwh: d.chargedKwh, dischargedKwh: d.dischargedKwh, cycles: d.dischargedKwh === null ? null : d.dischargedKwh / capacityKwh, socMin: d.socMin, socMax: d.socMax })),
  };
}
