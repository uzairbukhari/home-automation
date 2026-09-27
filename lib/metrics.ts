// Pure calculation functions for the dashboard. Kept free of I/O so they are
// easy to unit test (see lib/metrics.test.ts).

export interface DailyEnergy {
  pvKwh: number;
  loadKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  battChargeKwh: number;
  battDischargeKwh: number;
}

export interface TariffSettings {
  currency: string;
  flatRatePerKwh: number | null;
  peakRatePerKwh: number | null;
  offPeakRatePerKwh: number | null;
  peakStartHour: number | null;
  peakEndHour: number | null;
  systemCostPkr: number | null;
  panelKwp: number;
  batteryKwh: number;
  gridCo2KgPerKwh: number;
}

/**
 * Self-sufficiency: the share of household load that was covered by
 * solar + battery, rather than pulled from the grid.
 * Returns a value in [0, 1]. Returns 0 if loadKwh is 0.
 */
export function selfSufficiency(day: DailyEnergy): number {
  if (day.loadKwh <= 0) return 0;
  const coveredByGrid = Math.max(0, day.gridImportKwh);
  const covered = Math.max(0, day.loadKwh - coveredByGrid);
  return clamp01(covered / day.loadKwh);
}

/**
 * Self-consumption: the share of solar production that was used directly
 * (not exported to the grid). Returns a value in [0, 1]. Returns 1 if
 * pvKwh is 0 (nothing produced, so nothing to waste).
 */
export function selfConsumption(day: DailyEnergy): number {
  if (day.pvKwh <= 0) return 1;
  const used = Math.max(0, day.pvKwh - day.gridExportKwh);
  return clamp01(used / day.pvKwh);
}

/** Specific yield in kWh produced per kWp of installed panel capacity. */
export function specificYield(pvKwh: number, panelKwp: number): number {
  if (panelKwp <= 0) return 0;
  return pvKwh / panelKwp;
}

/**
 * Estimated cost avoided today by not importing that energy from the grid.
 * Uses a flat rate if set, otherwise falls back to averaging peak/off-peak
 * (a rough approximation; per-interval calculation would need sub-daily data).
 */
export function estimatedSavingsPkr(day: DailyEnergy, tariff: TariffSettings): number {
  const rate = effectiveRate(tariff);
  if (rate == null) return 0;
  const solarUsedDirectly = Math.max(0, day.pvKwh - day.gridExportKwh);
  const solarFromBattery = Math.max(0, day.battDischargeKwh);
  // Avoid double counting: battery charge often comes from solar already
  // reflected in solarUsedDirectly via the daily balance, so we only add
  // discharge that displaced a grid import.
  const avoidedKwh = solarUsedDirectly + solarFromBattery;
  return avoidedKwh * rate;
}

function effectiveRate(tariff: TariffSettings): number | null {
  if (tariff.flatRatePerKwh != null) return tariff.flatRatePerKwh;
  if (tariff.peakRatePerKwh != null && tariff.offPeakRatePerKwh != null) {
    return (tariff.peakRatePerKwh + tariff.offPeakRatePerKwh) / 2;
  }
  return null;
}

/** Rate for a specific hour of day (0-23), respecting peak/off-peak windows. */
export function rateForHour(hour: number, tariff: TariffSettings): number | null {
  if (
    tariff.peakRatePerKwh != null &&
    tariff.offPeakRatePerKwh != null &&
    tariff.peakStartHour != null &&
    tariff.peakEndHour != null
  ) {
    const inPeak = isHourInRange(hour, tariff.peakStartHour, tariff.peakEndHour);
    return inPeak ? tariff.peakRatePerKwh : tariff.offPeakRatePerKwh;
  }
  return tariff.flatRatePerKwh;
}

function isHourInRange(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // Wraps past midnight, e.g. peak 18 -> 6.
  return hour >= start || hour < end;
}

/** Payback progress as a fraction [0, 1] given cumulative savings so far. */
export function paybackProgress(cumulativeSavingsPkr: number, systemCostPkr: number | null): number {
  if (!systemCostPkr || systemCostPkr <= 0) return 0;
  return clamp01(cumulativeSavingsPkr / systemCostPkr);
}

/**
 * Estimated time until the battery reaches empty (0%) or full (100%),
 * given current SOC, capacity, and current charge/discharge rate.
 * Returns null when the battery is idle (rate ~0) or already at the bound.
 */
export function batteryTimeToBoundMinutes(
  socPercent: number,
  capacityKwh: number,
  rateW: number // positive = charging, negative = discharging
): { direction: "charging" | "discharging"; minutes: number } | null {
  const EPSILON_W = 5; // treat anything under 5W as idle
  if (Math.abs(rateW) < EPSILON_W) return null;

  const capacityWh = capacityKwh * 1000;
  if (rateW > 0) {
    if (socPercent >= 100) return null;
    const remainingWh = ((100 - socPercent) / 100) * capacityWh;
    return { direction: "charging", minutes: (remainingWh / rateW) * 60 };
  } else {
    if (socPercent <= 0) return null;
    const remainingWh = (socPercent / 100) * capacityWh;
    return { direction: "discharging", minutes: (remainingWh / Math.abs(rateW)) * 60 };
  }
}

/**
 * Battery cycle count contribution for a single day, in equivalent full
 * cycles, based on total discharge energy relative to capacity.
 */
export function dailyBatteryCycles(dischargeKwh: number, capacityKwh: number): number {
  if (capacityKwh <= 0) return 0;
  return dischargeKwh / capacityKwh;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export interface EnergyDelta {
  hours: number;
  pvKwh: number;
  loadKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  battChargeKwh: number;
  battDischargeKwh: number;
}

/**
 * Trapezoidal integration between two power readings:
 * energyKwh = avgPowerW * hoursElapsed / 1000.
 * Returns null when there's no previous reading to integrate against, or the
 * gap is zero/negative or exceeds an hour (clock issues / long outage).
 */
export function computeEnergyDelta(params: {
  previousTs: Date | null;
  now: Date;
  pvW: number;
  loadW: number;
  gridW: number | null;
  batteryW: number;
  previousPvW: number;
  previousLoadW: number;
  previousGridW: number | null;
  previousBatteryW: number;
}): EnergyDelta | null {
  if (!params.previousTs) return null;
  const hours = (params.now.getTime() - params.previousTs.getTime()) / 3_600_000;
  if (hours <= 0 || hours > 1) return null;

  const avgPv = (params.pvW + params.previousPvW) / 2;
  const avgLoad = (params.loadW + params.previousLoadW) / 2;
  const avgGrid = ((params.gridW ?? 0) + (params.previousGridW ?? 0)) / 2;
  const avgBattery = (params.batteryW + params.previousBatteryW) / 2;

  return {
    hours,
    pvKwh: Math.max(0, (avgPv * hours) / 1000),
    loadKwh: Math.max(0, (avgLoad * hours) / 1000),
    gridImportKwh: Math.max(0, (avgGrid * hours) / 1000),
    gridExportKwh: Math.max(0, (-avgGrid * hours) / 1000),
    battChargeKwh: Math.max(0, (avgBattery * hours) / 1000),
    battDischargeKwh: Math.max(0, (-avgBattery * hours) / 1000),
  };
}

export interface DayRollup {
  daily: DailyEnergy;
  batteryHealth: { minSocPct: number; maxSocPct: number; chargeKwh: number; dischargeKwh: number };
  hourly: Map<number, { pvWh: number; loadWh: number; sampleCount: number }>;
}

/**
 * Rebuilds a full day's energy_daily / battery_health_daily / energy_hourly
 * rollup from a set of raw readings for that day, via the same trapezoidal
 * integration `computeEnergyDelta` uses for live polling. Used by backfill,
 * which has a whole day's readings up front rather than one at a time.
 * Returns null when there are fewer than 2 readings (nothing to integrate).
 */
export function rollupReadings(
  readings: Array<{ ts: Date; pvW: number; loadW: number; gridW: number | null; batteryW: number; batterySoc: number }>
): DayRollup | null {
  if (readings.length < 2) return null;

  const daily: DailyEnergy = {
    pvKwh: 0,
    loadKwh: 0,
    gridImportKwh: 0,
    gridExportKwh: 0,
    battChargeKwh: 0,
    battDischargeKwh: 0,
  };
  const hourly = new Map<number, { pvWh: number; loadWh: number; sampleCount: number }>();
  let minSoc = readings[0].batterySoc;
  let maxSoc = readings[0].batterySoc;

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const cur = readings[i];
    minSoc = Math.min(minSoc, cur.batterySoc);
    maxSoc = Math.max(maxSoc, cur.batterySoc);

    const delta = computeEnergyDelta({
      previousTs: prev.ts,
      now: cur.ts,
      pvW: cur.pvW,
      loadW: cur.loadW,
      gridW: cur.gridW,
      batteryW: cur.batteryW,
      previousPvW: prev.pvW,
      previousLoadW: prev.loadW,
      previousGridW: prev.gridW,
      previousBatteryW: prev.batteryW,
    });
    if (!delta) continue;

    daily.pvKwh += delta.pvKwh;
    daily.loadKwh += delta.loadKwh;
    daily.gridImportKwh += delta.gridImportKwh;
    daily.gridExportKwh += delta.gridExportKwh;
    daily.battChargeKwh += delta.battChargeKwh;
    daily.battDischargeKwh += delta.battDischargeKwh;

    const hour = cur.ts.getHours();
    const bucket = hourly.get(hour) ?? { pvWh: 0, loadWh: 0, sampleCount: 0 };
    bucket.pvWh += delta.pvKwh * 1000;
    bucket.loadWh += delta.loadKwh * 1000;
    bucket.sampleCount += 1;
    hourly.set(hour, bucket);
  }

  return {
    daily,
    batteryHealth: {
      minSocPct: minSoc,
      maxSocPct: maxSoc,
      chargeKwh: daily.battChargeKwh,
      dischargeKwh: daily.battDischargeKwh,
    },
    hourly,
  };
}

/** Lifetime battery cycle-equivalent across a set of daily discharge totals. */
export function cumulativeBatteryCycles(rows: { dischargeKwh: number }[], batteryKwh: number): number {
  return rows.reduce((sum, r) => sum + dailyBatteryCycles(r.dischargeKwh, batteryKwh), 0);
}

export interface HourlyPatternPoint {
  hour: number;
  avgPvW: number;
  avgLoadW: number;
  samples: number;
}

/**
 * Average PV/load power by hour-of-day (0-23) across all days with data.
 * Wh over a 1-hour bucket is numerically equal to avg W for that hour, so no
 * separate averaging step is needed beyond averaging across days.
 */
export function hourlyPattern(
  rows: { hourOfDay: number; pvWh: number; loadWh: number; sampleCount: number }[]
): HourlyPatternPoint[] {
  const buckets: { pvSum: number; loadSum: number; days: number }[] = Array.from(
    { length: 24 },
    () => ({ pvSum: 0, loadSum: 0, days: 0 })
  );
  for (const row of rows) {
    const b = buckets[row.hourOfDay];
    if (!b) continue;
    b.pvSum += row.pvWh;
    b.loadSum += row.loadWh;
    b.days += 1;
  }
  return buckets.map((b, hour) => ({
    hour,
    avgPvW: b.days > 0 ? b.pvSum / b.days : 0,
    avgLoadW: b.days > 0 ? b.loadSum / b.days : 0,
    samples: b.days,
  }));
}

export interface WeekdayHourPoint {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  hour: number;
  avgLoadW: number;
}

/** Average load power by (weekday, hour-of-day), for a time-of-day usage heatmap. */
export function weekdayHourPattern(rows: { date: string; hourOfDay: number; loadWh: number }[]): WeekdayHourPoint[] {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const weekday = new Date(`${row.date}T00:00:00`).getDay();
    const key = `${weekday}:${row.hourOfDay}`;
    const entry = sums.get(key) ?? { sum: 0, count: 0 };
    entry.sum += row.loadWh;
    entry.count += 1;
    sums.set(key, entry);
  }
  return Array.from(sums.entries()).map(([key, { sum, count }]) => {
    const [weekday, hour] = key.split(":").map(Number);
    return { weekday, hour, avgLoadW: sum / count };
  });
}

type EnergyTotals = DailyEnergy;

const ENERGY_KEYS: (keyof EnergyTotals)[] = [
  "pvKwh",
  "loadKwh",
  "gridImportKwh",
  "gridExportKwh",
  "battChargeKwh",
  "battDischargeKwh",
];

function sumEnergy(rows: EnergyTotals[]): EnergyTotals {
  const totals: EnergyTotals = {
    pvKwh: 0,
    loadKwh: 0,
    gridImportKwh: 0,
    gridExportKwh: 0,
    battChargeKwh: 0,
    battDischargeKwh: 0,
  };
  for (const row of rows) {
    for (const key of ENERGY_KEYS) totals[key] += row[key];
  }
  return totals;
}

/**
 * Compares the last `windowDays` days against the `windowDays` immediately
 * before that (rolling windows, not calendar week/month boundaries).
 * `changePct[key]` is null (not NaN/Infinity) when the previous window has
 * no baseline to compare against.
 */
export function trendComparison<T extends DailyEnergy & { date: string }>(
  rows: T[],
  windowDays: number,
  referenceDate: Date = new Date()
): {
  current: EnergyTotals;
  previous: EnergyTotals;
  changePct: Record<keyof EnergyTotals, number | null>;
} {
  const refDay = new Date(
    `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(
      referenceDate.getDate()
    ).padStart(2, "0")}T00:00:00`
  );
  const currentRows: T[] = [];
  const previousRows: T[] = [];
  for (const row of rows) {
    const rowDay = new Date(`${row.date}T00:00:00`);
    const diffDays = Math.round((refDay.getTime() - rowDay.getTime()) / 86_400_000);
    if (diffDays >= 0 && diffDays < windowDays) currentRows.push(row);
    else if (diffDays >= windowDays && diffDays < windowDays * 2) previousRows.push(row);
  }

  const current = sumEnergy(currentRows);
  const previous = sumEnergy(previousRows);
  const changePct = {} as Record<keyof EnergyTotals, number | null>;
  for (const key of ENERGY_KEYS) {
    changePct[key] = previous[key] > 0 ? (current[key] - previous[key]) / previous[key] : null;
  }

  return { current, previous, changePct };
}
