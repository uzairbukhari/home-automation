import { allocate, batteryWatts } from './energy-flow';
import type { SolarPoint } from './solar-energy';

export type MixPoint = {
  stamp: number;
  solarHome: number | null;
  batteryHome: number | null;
  gridHome: number | null;
  soc: number | null;
};

/** Splits each reading's home load into what solar, the battery and the grid supplied, in watts. */
export function sourceMix(points: Array<SolarPoint & { stamp: number }>): MixPoint[] {
  return points.map((p) => {
    const soc = p.battery;
    if (p.home === null || p.solar === null)
      return { stamp: p.stamp, solarHome: null, batteryHome: null, gridHome: null, soc };
    const routes = allocate(
      Math.max(0, p.solar),
      Math.max(0, p.home),
      batteryWatts(p.batteryVoltage, p.chargeCurrent, p.dischargeCurrent),
    );
    return {
      stamp: p.stamp,
      solarHome: routes.solarHome,
      batteryHome: routes.batteryHome,
      gridHome: routes.gridHome,
      soc,
    };
  });
}

/** kWh each source supplied to the home across the day, integrating watts between readings that are at most 15 min apart. */
export function mixEnergy(mix: MixPoint[], maxGapMs = 900000) {
  const total = { solarKwh: 0, batteryKwh: 0, gridKwh: 0 };
  for (let i = 1; i < mix.length; i++) {
    const a = mix[i - 1],
      b = mix[i],
      gap = b.stamp - a.stamp;
    if (gap <= 0 || gap > maxGapMs) continue;
    for (const [key, field] of [
      ['solarKwh', 'solarHome'],
      ['batteryKwh', 'batteryHome'],
      ['gridKwh', 'gridHome'],
    ] as const) {
      const x = a[field],
        y = b[field];
      if (x !== null && y !== null) total[key] += (((x + y) / 2) * gap) / 3_600_000_000;
    }
  }
  return { ...total, totalKwh: total.solarKwh + total.batteryKwh + total.gridKwh };
}

export function mixVerdict(energy: ReturnType<typeof mixEnergy>) {
  if (energy.totalKwh < 0.2) return null;
  const pct = (n: number) => Math.round((n / energy.totalKwh) * 100);
  return `Of the ${energy.totalKwh.toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} kWh the home used: ${pct(energy.solarKwh)}% came from solar, ${pct(energy.batteryKwh)}% from the battery and ${pct(energy.gridKwh)}% from the grid.`;
}
