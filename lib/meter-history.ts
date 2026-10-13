import { database } from './jobs';
import { historyCallsLeft } from './history-budget';
import { lookbackDays } from './provider-sync';
import { localDate, shiftDate } from './measurements';
import { TuyaProvider } from './providers/tuya';
import { cachedDevices, storeTuyaLogs } from './tuya-store';
import { STATISTICS_SOURCE, deviceStatistics } from './device-statistics';

export type Meter = { id: string; name: string };

/** The Tuya device that sees everything the grid delivers: flagged upstream, else a smart meter, else any energy meter. */
export async function gridMeter(): Promise<Meter | null> {
  const row = await database().prepare(`SELECT c.id,COALESCE(NULLIF(d.alias,''),c.name) name FROM device_catalog c LEFT JOIN device_details d ON c.id=d.device_id
    WHERE c.source='tuya' AND (d.upstream=1 OR c.category='dlq' OR lower(c.name) LIKE '%smart meter%' OR lower(COALESCE(d.alias,'')) LIKE '%smart meter%')
    ORDER BY (COALESCE(d.upstream,0)=1 AND (lower(c.name) LIKE '%smart meter%' OR lower(COALESCE(d.alias,'')) LIKE '%smart meter%')) DESC,(lower(c.name) LIKE '%smart meter pro%') DESC,COALESCE(d.upstream,0) DESC LIMIT 1`).first<Meter>();
  return row ?? null;
}

// Cumulative registers are read as highest-minus-previous-day. Meters that only report add_ele (energy since the previous report)
// are summed instead; those increments are stored under their own code so the live status polling, which sees the same
// increment many times, cannot inflate the total.
const COUNTERS = ['forward_energy_total', 'total_forward_energy'];
const INCREMENT = 'add_ele', INCREMENT_LOG = 'add_ele_log';
export const METER_SOURCE = 'meter-counter';
const DAY = 86400000;

/** Daily kWh from a cumulative register: each day's highest reading minus the previous day's. Independent of how often the meter reports. */
export async function writeCounterDays(meterId: string, code: string, fromDate: string) {
  const db = database();
  if (code === INCREMENT) return writeIncrementDays(meterId, fromDate);
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

async function writeIncrementDays(meterId: string, fromDate: string) {
  const db = database();
  const rows = await db.prepare("SELECT date(source_timestamp,'+5 hours') day,SUM(numeric_value) total FROM tuya_device_state WHERE device_id=? AND code=? AND numeric_value IS NOT NULL AND numeric_value>=0 AND source_timestamp>=? GROUP BY day ORDER BY day")
    .bind(meterId, INCREMENT_LOG, new Date(`${fromDate}T00:00:00+05:00`).toISOString()).all<{ day: string; total: number }>();
  const statements = rows.results.map(row => db.prepare(`INSERT INTO solar_energy_periods (entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial,report_json) VALUES (?,'day',?,NULL,?,NULL,'missing',?,?,?,NULL)
      ON CONFLICT(entity_id,period_type,period) DO UPDATE SET grid_kwh=excluded.grid_kwh,grid_source=excluded.grid_source,covered_hours=excluded.covered_hours,partial=excluded.partial,updated_at=CURRENT_TIMESTAMP`)
    .bind(meterId, row.day, row.total, METER_SOURCE, row.day === localDate() ? 0 : 24, row.day === fromDate ? 1 : 0));
  for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
  return statements.length;
}

/** Daily grid import for the meter, by local date: Tuya's own statistics where it has them, else what the register or increment logs give. */
export async function counterDaily(meterId: string, from: string, to: string) {
  const rows = await database().prepare("SELECT period,grid_kwh,grid_source FROM solar_energy_periods WHERE entity_id=? AND period_type='day' AND grid_source IN (?,?) AND period>=? AND period<=?")
    .bind(meterId, METER_SOURCE, STATISTICS_SOURCE, from, to).all<{ period: string; grid_kwh: number | null; grid_source: string }>();
  const days = new Map<string, number>();
  for (const r of rows.results.filter(r => r.grid_kwh !== null && r.grid_source === METER_SOURCE)) days.set(r.period, r.grid_kwh!);
  for (const r of rows.results.filter(r => r.grid_kwh !== null && r.grid_source === STATISTICS_SOURCE)) days.set(r.period, r.grid_kwh!);
  return days;
}

/**
 * Pull the meter's energy register from Tuya's report logs, one day window at a time, and turn it into daily kWh.
 * Resumable: progress is kept in tuya_sync, and a run stops before the host's time limit.
 */
export async function meterHistoryStep(budgetMs = 25000) {
  const meter = await gridMeter(); if (!meter) return { status: 'no_meter' };
  const device = (await cachedDevices(true)).find(d => d.id === meter.id); if (!device) return { status: 'meter_not_cached' };
  const has = (c: string) => device.capabilities.some(cap => cap.code === c);
  const code = COUNTERS.find(has) ?? (has(INCREMENT) ? INCREMENT : null); if (!code) return { status: 'no_energy_register', codes: device.capabilities.map(c => c.code) };
  // Increment logs are stored as add_ele_log, decoded with add_ele's own scale and unit.
  const incrementCap = device.capabilities.find(c => c.code === INCREMENT), target = code === INCREMENT && incrementCap ? { ...device, capabilities: [...device.capabilities, { ...incrementCap, code: INCREMENT_LOG }] } : device;
  let left = await historyCallsLeft();
  if (left < 1) return { status: 'budget_reached', meter: meter.name, code };
  const statChunks = Math.min(2, left); left -= code === INCREMENT ? statChunks : 0;
  const statistics = code === INCREMENT ? await deviceStatistics(device, INCREMENT, statChunks).catch(e => ({ written: 0, oldest: null, error: String(e), sample: null })) : null;
  const db = database(), key = `meter:${meter.id}`, provider = new TuyaProvider(), now = Date.now(), started = Date.now();
  const row = await db.prepare('SELECT from_ms,to_ms,cursor,covered_through FROM tuya_sync WHERE device_id=?').bind(key).first<{ from_ms: number | null; to_ms: number | null; cursor: string | null; covered_through: string | null }>();
  const floor = now - Math.max(lookbackDays(), 90) * DAY, resume = row?.cursor && row.from_ms && row.to_ms ? row : null;
  let from = resume ? resume.from_ms! : row?.covered_through ? Math.max(floor, Date.parse(row.covered_through) - 3600_000) : floor, logs = 0, windows = 0, lastError: string | null = null, pending = resume?.cursor ?? '', pendingTo = resume?.to_ms ?? 0;
  const firstDate = localDate(from), save = (covered: number, cursor: string, windowTo: number) =>
    db.prepare('INSERT INTO tuya_sync(device_id,from_ms,to_ms,cursor,covered_through,error) VALUES (?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET from_ms=excluded.from_ms,to_ms=excluded.to_ms,cursor=excluded.cursor,covered_through=excluded.covered_through,error=excluded.error')
      .bind(key, cursor ? from : null, cursor ? windowTo : null, cursor || null, new Date(covered).toISOString(), lastError).run();
  while (from < now && left > 0 && Date.now() - started < budgetMs) {
    const to = pendingTo || Math.min(now, from + DAY);
    let cursor = pending, complete = false;
    pending = ''; pendingTo = 0;
    try {
      for (let page = 0; page < 60 && left > 0 && Date.now() - started < budgetMs; page++) {
        left--;
        const result = await provider.getLogPage(meter.id, [code], from, to, cursor);
        logs += await storeTuyaLogs(target, code === INCREMENT ? (result.logs ?? []).map(l => ({ ...l, code: INCREMENT_LOG })) : result.logs ?? []);
        if (!result.has_more || !result.last_row_key || result.last_row_key === cursor) { complete = true; break; }
        cursor = result.last_row_key;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Tuya keeps limited log history; a window that far back is simply not available, so move on rather than retry forever.
      complete = to < now - 8 * DAY; cursor = '';
    }
    if (!complete) { await save(from, cursor, to); break; }
    from = to; windows++;
    await save(from, '', to);
  }
  const days = await writeCounterDays(meter.id, code, firstDate);
  return { status: from >= now ? 'caught_up' : 'in_progress', meter: meter.name, code, windows, logs, days, coveredThrough: new Date(Math.min(from, now)).toISOString(), error: lastError, statistics };
}
