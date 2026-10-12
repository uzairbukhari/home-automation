export type Reading = { metric: string; value: number | null };
export type EnergySnapshot = {
  at: string; fresh: boolean;
  solar: number; home: number; grid: number; battery: number; soc: number | null;
  gridDown: boolean; mode: string | null;
  detail: Record<string, number | null>;
};
export type Routes = { solarHome: number; solarBattery: number; batteryHome: number; gridHome: number; gridBattery: number };

const DETAIL = ['pv_voltage', 'pv_current', 'grid_voltage', 'grid_frequency', 'battery_voltage', 'battery_charge_current',
  'battery_discharge_current', 'output_voltage', 'output_frequency', 'output_load', 'inverter_temperature', 'output_apparent_power', 'solar_today'] as const;

/** Positive while charging, negative while discharging. */
export function batteryWatts(voltage: number | null, charge: number | null, discharge: number | null) {
  if (voltage === null || (charge === null && discharge === null)) return 0;
  return voltage * ((charge ?? 0) - (discharge ?? 0));
}

export function toSnapshot(readings: Reading[], at: string, fresh: boolean, mode: string | null): EnergySnapshot {
  const map = new Map(readings.map(r => [r.metric, r.value]));
  const v = (metric: string) => map.get(metric) ?? null;
  const gridVoltage = v('grid_voltage');
  return {
    at, fresh, mode,
    solar: Math.max(0, v('solar_power') ?? 0),
    home: Math.max(0, v('home_power') ?? 0),
    grid: Math.max(0, v('grid_power') ?? 0),
    battery: batteryWatts(v('battery_voltage'), v('battery_charge_current'), v('battery_discharge_current')),
    soc: v('battery_soc'),
    gridDown: gridVoltage !== null && gridVoltage < 100,
    detail: Object.fromEntries(DETAIL.map(metric => [metric, v(metric)])),
  };
}

/** Solar serves the home first, then the battery; the battery covers the next share of the home; the grid covers the rest. */
export function allocate(solar: number, home: number, battery: number): Routes {
  const charge = Math.max(0, battery), discharge = Math.max(0, -battery);
  const solarHome = Math.min(solar, home);
  const solarBattery = Math.min(solar - solarHome, charge);
  const batteryHome = Math.min(discharge, home - solarHome);
  const gridHome = Math.max(0, home - solarHome - batteryHome);
  const gridBattery = Math.max(0, charge - solarBattery);
  return { solarHome, solarBattery, batteryHome, gridHome, gridBattery };
}

export const ACTIVE_W = 20;
export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
/** Pixels per second along a conduit. */
export const particleSpeed = (w: number) => 28 + 60 * Math.log1p(Math.abs(w) / 100);
export const particleCount = (w: number) => Math.min(14, 1 + Math.sqrt(Math.abs(w) / 150));
export const particleRadius = (w: number) => 2.2 + 1.8 * Math.log1p(Math.abs(w) / 500);
/** Seconds per breath of a node ring; busier nodes breathe faster. */
export const ringPeriod = (w: number) => 3.2 - 1.8 * smoothstep(0, 4000, Math.abs(w));

/** Next read lands a little after the 5 minute collection; never sooner than a minute. */
export function nextPollDelay(updatedAt: string | null | undefined, now = Date.now(), cadenceMs = 300_000) {
  const stamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(stamp)) return 60_000;
  return Math.max(60_000, Math.min(cadenceMs, stamp + cadenceMs + 20_000 - now));
}
