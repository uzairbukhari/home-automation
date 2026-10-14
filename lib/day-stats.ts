import { database } from './jobs';
import { actualSummary } from './actual-energy';
import { localDate, shiftDate } from './measurements';
import { inverterDay, storableDay, storedDayStats, writeDayStats, type InverterDay } from './day-inverter';
import { storedSamples } from './solar-store';
import { counterDaily, gridMeter, type Meter } from './meter-history';
export type { Meter };
import type { DailySummary } from './telemetry';
import { type DayStat } from './battery-stats';
export { sumDays, batteryStats, WARRANTY_CYCLES, BATTERY_INSTALLED, type DayStat, type BatteryStats } from './battery-stats';

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

const missingBatch = 6;

/**
 * Per-day statistics for [from,to]. Finished days are read from one stored row each (written when readings are saved);
 * today and any day without a row are integrated from the stored readings, and finished ones are stored for the next request.
 */
export async function dayStats(entity: string, from: string, to: string): Promise<{ days: DayStat[]; meter: Meter | null }> {
  const today = localDate(), [first, meter, stored] = await Promise.all([firstSampleDate(entity), gridMeter().catch(() => null), storedDayStats(database(), entity, from, to)]);
  const start = first && first > from ? first : from, dates: string[] = [];
  for (let d = start; d <= to; d = shiftDate(d, 1)) dates.push(d);
  const inverter = new Map<string, InverterDay>(), fresh: InverterDay[] = [];
  for (const d of dates) if (d !== today && stored.has(d)) inverter.set(d, stored.get(d)!);
  const missing = dates.filter(d => !inverter.has(d));
  for (let i = 0; i < missing.length; i += missingBatch) await Promise.all(missing.slice(i, i + missingBatch).map(async d => {
    const points = await storedSamples(entity, d, d), day = inverterDay(d, points);
    if (storableDay(day, points.length, today)) fresh.push(day);
    inverter.set(d, day);
  }));
  if (fresh.length) await writeDayStats(database(), entity, fresh).catch(() => { /* the next request computes them again */ });
  const grid = meter && dates.length ? await meterDaily(meter, start, to).catch(() => new Map<string, number>()) : new Map<string, number>();
  const days = dates.map(d => ({ ...inverter.get(d)!, meterGridKwh: grid.get(d) ?? null }));
  return { days, meter };
}

/** Maintenance: store the finished days that have no row yet, newest first, a few per run. Days without readings are skipped. */
export async function dayStatBackfillStep(entity: string, backfill = 5) {
  const today = localDate(), first = await firstSampleDate(entity);
  if (!first) return { done: [] as string[] };
  const have = await storedDayStats(database(), entity, first, shiftDate(today, -1)), fresh: InverterDay[] = [];
  let date = shiftDate(today, -1), scanned = 0, attempts = 0;
  while (date >= first && fresh.length < backfill && scanned < 400 && attempts < backfill * 3) {
    if (!have.has(date)) { attempts++; const points = await storedSamples(entity, date, date), day = inverterDay(date, points); if (storableDay(day, points.length, today)) fresh.push(day); }
    date = shiftDate(date, -1); scanned++;
  }
  await writeDayStats(database(), entity, fresh);
  return { done: fresh.map(d => d.date) };
}
