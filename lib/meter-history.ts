import { database } from './jobs';
import { lookbackDays } from './provider-sync';
import { localDate, shiftDate } from './measurements';
import { TuyaProvider } from './providers/tuya';
import { cachedDevices, storeTuyaLogs } from './tuya-store';

export type Meter = { id: string; name: string };

/** The Tuya device that sees everything the grid delivers: flagged upstream, else a smart meter, else any energy meter. */
export async function gridMeter(): Promise<Meter | null> {
  const row = await database().prepare(`SELECT c.id,COALESCE(NULLIF(d.alias,''),c.name) name FROM device_catalog c LEFT JOIN device_details d ON c.id=d.device_id
    WHERE c.source='tuya' AND (d.upstream=1 OR c.category='dlq' OR lower(c.name) LIKE '%smart meter%' OR lower(COALESCE(d.alias,'')) LIKE '%smart meter%')
    ORDER BY (COALESCE(d.upstream,0)=1 AND (lower(c.name) LIKE '%smart meter%' OR lower(COALESCE(d.alias,'')) LIKE '%smart meter%')) DESC,(lower(c.name) LIKE '%smart meter pro%') DESC,COALESCE(d.upstream,0) DESC LIMIT 1`).first<Meter>();
  return row ?? null;
}

// Cumulative energy registers; add_ele reports increments and cannot be summed from sparse logs.
const COUNTERS = ['forward_energy_total', 'total_forward_energy'];
export const METER_SOURCE = 'meter-counter';
const DAY = 86400000;

/** Daily kWh from a cumulative register: each day's highest reading minus the previous day's. Independent of how often the meter reports. */
export async function writeCounterDays(meterId: string, code: string, fromDate: string) {
  const db = database();
  const rows = await db.prepare("SELECT date(source_timestamp,'+5 hours') day,MAX(numeric_value) high,MIN(numeric_value) low,COUNT(*) n FROM tuya_device_state WHERE device_id=? AND code=? AND numeric_value IS NOT NULL AND source_timestamp>=? GROUP BY day ORDER BY day")
    .bind(meterId, code, new Date(`${shiftDate(fromDate, -1)}T00:00:00+05:00`).toISOString()).all<{ day: string; high: number; low: number; n: number }>();
  const days = rows.results, statements = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i], previous = i > 0 && days[i - 1].day === shiftDate(day.day, -1) ? days[i - 1] : null;
    if (day.day < fromDate) continue;
    let kwh = previous ? day.high - previous.high : day.high - day.low, partial = !previous;
    if (kwh < 0) { kwh = day.high - day.low; partial = true; }
    statements.push(db.prepare(`INSERT INTO solar_energy_periods (entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial,report_json) VALUES (?,'day',?,NULL,?,NULL,'missing',?,?,?,NULL)
      ON CONFLICT(entity_id,period_type,period) DO UPDATE SET grid_kwh=excluded.grid_kwh,grid_source=excluded.grid_source,covered_hours=excluded.covered_hours,partial=excluded.partial,updated_at=CURRENT_TIMESTAMP`)
      .bind(meterId, day.day, Math.max(0, kwh), METER_SOURCE, day.day === localDate() ? 0 : 24, partial ? 1 : 0));
  }
  for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
  return statements.length;
}

/** Daily grid import the meter's register has produced, by local date. */
export async function counterDaily(meterId: string, from: string, to: string) {
  const rows = await database().prepare("SELECT period,grid_kwh FROM solar_energy_periods WHERE entity_id=? AND period_type='day' AND grid_source=? AND period>=? AND period<=?")
    .bind(meterId, METER_SOURCE, from, to).all<{ period: string; grid_kwh: number | null }>();
  return new Map(rows.results.filter(r => r.grid_kwh !== null).map(r => [r.period, r.grid_kwh!]));
}

/**
 * Pull the meter's energy register from Tuya's report logs, one day window at a time, and turn it into daily kWh.
 * Resumable: progress is kept in tuya_sync, and a run stops before the host's time limit.
 */
export async function meterHistoryStep(budgetMs = 25000) {
  const meter = await gridMeter(); if (!meter) return { status: 'no_meter' };
  const device = (await cachedDevices(true)).find(d => d.id === meter.id); if (!device) return { status: 'meter_not_cached' };
  const code = COUNTERS.find(c => device.capabilities.some(cap => cap.code === c)); if (!code) return { status: 'no_energy_register', codes: device.capabilities.map(c => c.code) };
  const db = database(), key = `meter:${meter.id}`, provider = new TuyaProvider(), now = Date.now(), started = Date.now();
  const row = await db.prepare('SELECT covered_through FROM tuya_sync WHERE device_id=?').bind(key).first<{ covered_through: string | null }>();
  const floor = now - Math.max(lookbackDays(), 90) * DAY;
  let from = row?.covered_through ? Math.max(floor, Date.parse(row.covered_through) - 3600_000) : floor, logs = 0, windows = 0, lastError: string | null = null;
  const firstDate = localDate(from);
  while (from < now && Date.now() - started < budgetMs) {
    const to = Math.min(now, from + DAY);
    let cursor = '', complete = false;
    try {
      for (let page = 0; page < 15 && Date.now() - started < budgetMs; page++) {
        const result = await provider.getLogPage(meter.id, [code], from, to, cursor);
        logs += await storeTuyaLogs(device, result.logs ?? []);
        if (!result.has_more || !result.last_row_key || result.last_row_key === cursor) { complete = true; break; }
        cursor = result.last_row_key;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Tuya keeps limited log history; a window that far back is simply not available, so move on rather than retry forever.
      complete = to < now - 8 * DAY;
    }
    if (!complete) break;
    from = to; windows++;
    await db.prepare('INSERT INTO tuya_sync(device_id,from_ms,to_ms,cursor,covered_through,error) VALUES (?,NULL,NULL,NULL,?,?) ON CONFLICT(device_id) DO UPDATE SET covered_through=excluded.covered_through,error=excluded.error').bind(key, new Date(from).toISOString(), lastError).run();
  }
  const days = await writeCounterDays(meter.id, code, firstDate);
  return { status: from >= now ? 'caught_up' : 'in_progress', meter: meter.name, code, windows, logs, days, coveredThrough: new Date(Math.min(from, now)).toISOString(), error: lastError };
}
