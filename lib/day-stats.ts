import { database } from './jobs';
import { actualSummary } from './actual-energy';
import { localDate, shiftDate } from './measurements';
import { energyReport, sortedPoints, type SolarPoint } from './solar-energy';
import { storedSamples } from './solar-store';
import { counterDaily, gridMeter, type Meter } from './meter-history';
export type { Meter };
import type { DailySummary } from './telemetry';
import { type DayStat } from './battery-stats';
export { sumDays, batteryStats, WARRANTY_CYCLES, type DayStat, type BatteryStats } from './battery-stats';

const cache = new Map<string, DayStat>();

/** Daily kWh: the meter's cumulative register first (immune to sparse reporting), then the per-day summaries for days it does not cover. */
export async function meterDaily(meter: Meter, from: string, to: string) {
  const days = await counterDaily(meter.id, from, to).catch(() => new Map<string, number>());
  const rows = await database().prepare("SELECT period,data,calculation_version FROM telemetry_summaries WHERE source='tuya' AND entity_id=? AND granularity='day' AND period>=? AND period<=? ORDER BY period")
    .bind(meter.id, from, to).all<{ period: string; data: string; calculation_version: number }>();
  const fromSummaries = new Map<string, number>();
  for (const row of rows.results) {
    if (days.has(row.period)) continue;
    const raw = JSON.parse(row.data) as DailySummary, data = actualSummary(raw, row.calculation_version);
    let kwh = data.energyKwh;
    if (kwh === null) { const power = raw.metrics.cur_power; if (power?.unit === 'W' && power.hours > 0) kwh = power.integral / 1000; }
    if (kwh !== null) fromSummaries.set(row.period, (fromSummaries.get(row.period) ?? 0) + kwh);
  }
  return new Map([...fromSummaries, ...days]);
}

export async function firstSampleDate(entity: string) {
  const row = await database().prepare('SELECT MIN(source_timestamp) stamp FROM solar_samples WHERE entity_id=?').bind(entity).first<{ stamp: string | null }>();
  return row?.stamp ? localDate(row.stamp) : null;
}

function inverterDay(date: string, points: SolarPoint[]): Omit<DayStat, 'meterGridKwh'> {
  const sorted = sortedPoints(points), report = energyReport(sorted), soc = sorted.map(p => p.battery).filter((n): n is number => n !== null && n >= 0 && n <= 100);
  return {
    date, coveredHours: report.coveredHours, partial: report.coveredHours < (date === localDate() ? 1 : 20),
    chargedKwh: report.batteryChargeKwh, dischargedKwh: report.batteryDischargeKwh, homeKwh: report.homeKwh, directSolarKwh: report.directSolarKwh, inverterGridKwh: report.gridKwh,
    socMin: report.socMin, socMax: report.socMax, socStart: soc[0] ?? null, socEnd: soc.at(-1) ?? null, peakSolarW: report.peakSolarW,
  };
}

/** Per-day statistics for [from,to]. Finished days are cached for the life of the server instance; today is always recomputed. */
export async function dayStats(entity: string, from: string, to: string): Promise<{ days: DayStat[]; meter: Meter | null }> {
  const today = localDate(), first = await firstSampleDate(entity), start = first && first > from ? first : from, meter = await gridMeter().catch(() => null);
  const dates: string[] = [];
  for (let d = start; d <= to; d = shiftDate(d, 1)) dates.push(d);
  const inverter = new Map<string, Omit<DayStat, 'meterGridKwh'>>();
  const missing = dates.filter(d => d === today || !cache.has(entity + d));
  for (let i = 0; i < missing.length; i += 6) await Promise.all(missing.slice(i, i + 6).map(async d => {
    const day = inverterDay(d, await storedSamples(entity, d, d));
    if (d !== today && day.coveredHours >= 20) cache.set(entity + d, { ...day, meterGridKwh: null });
    inverter.set(d, day);
  }));
  const grid = meter && dates.length ? await meterDaily(meter, start, to).catch(() => new Map<string, number>()) : new Map<string, number>();
  const days = dates.map(d => {
    const base = inverter.get(d) ?? cache.get(entity + d)!;
    return { ...base, meterGridKwh: grid.get(d) ?? null };
  });
  return { days, meter };
}

