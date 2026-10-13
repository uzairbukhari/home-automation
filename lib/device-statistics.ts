import { database } from './jobs';
import { historyCallsLeft } from './history-budget';
import { lookbackDays } from './provider-sync';
import { localDate, shiftDate } from './measurements';
import { TuyaProvider, type TuyaDashboardDevice } from './providers/tuya';
import { decodeTuya } from './tuya-format';
import { cachedDevices } from './tuya-store';

/** Daily energy kept per device in solar_energy_periods (entity = device id, grid_kwh = kWh that day). */
export const STATISTICS_SOURCE = 'device-statistics';
const ENERGY_CODE = 'add_ele';
const compact = (d: string) => d.replaceAll('-', '');

/**
 * Daily energy from Tuya's statistics endpoint, newest 31-day chunk first and then older ones. Returns what Tuya answered so a failure is visible.
 * Progress is the oldest chunk reached, kept in tuya_sync; the newest chunk is refreshed on every call.
 */
export async function deviceStatistics(device: TuyaDashboardDevice, code = ENERGY_CODE, maxChunks = 4) {
  const cap = device.capabilities.find(c => c.code === code); if (!cap) return { written: 0, oldest: null as string | null, error: 'no energy datapoint', sample: null };
  const db = database(), provider = new TuyaProvider(), key = `devstats:${device.id}`, today = localDate(), floor = shiftDate(today, -Math.max(lookbackDays(), 365));
  const row = await db.prepare('SELECT covered_through FROM tuya_sync WHERE device_id=?').bind(key).first<{ covered_through: string | null }>();
  const reached = row?.covered_through ?? today, chunks: Array<[string, string]> = [[shiftDate(today, -30), today]];
  for (let end = shiftDate(reached, -1), n = 0; end > floor && n < maxChunks - 1; n++) { const start = shiftDate(end, -30); chunks.push([start < floor ? floor : start, end]); end = shiftDate(end, -31); }
  let oldest = reached, written = 0, error: string | null = null, sample: Record<string, string | number> | null = null, empty = 0;
  for (const [start, end] of chunks) {
    let days: Record<string, string | number> = {};
    try { days = (await provider.getStatisticsDays(device.id, code, compact(start), compact(end))).days ?? {}; } catch (e) { error = e instanceof Error ? e.message : String(e); break; }
    sample ??= Object.keys(days).length ? days : null;
    const entries = Object.entries(days).flatMap(([d, v]) => {
      const kwh = decodeTuya(Number(v), { ...cap, metadataVerified: true }).numericValue;
      return kwh !== null && kwh >= 0 ? [[`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, kwh] as const] : [];
    });
    const statements = entries.map(([period, kwh]) => db.prepare(`INSERT INTO solar_energy_periods (entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial,report_json) VALUES (?,'day',?,NULL,?,NULL,'missing',?,?,0,NULL)
      ON CONFLICT(entity_id,period_type,period) DO UPDATE SET grid_kwh=excluded.grid_kwh,grid_source=excluded.grid_source,covered_hours=excluded.covered_hours,partial=0,updated_at=CURRENT_TIMESTAMP`).bind(device.id, period, kwh, STATISTICS_SOURCE, period === today ? 0 : 24));
    for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
    written += statements.length;
    if (start < oldest) oldest = start;
    empty = entries.length ? 0 : empty + 1;
    if (empty >= 2) { oldest = floor; break; }
  }
  if (!error) await db.prepare('INSERT INTO tuya_sync(device_id,from_ms,to_ms,cursor,covered_through,error) VALUES (?,NULL,NULL,NULL,?,NULL) ON CONFLICT(device_id) DO UPDATE SET covered_through=excluded.covered_through,error=NULL').bind(key, oldest).run();
  return { written, oldest, error, sample: sample ? Object.fromEntries(Object.entries(sample).slice(-3)) : null };
}

/** Every device that reports energy: fetch its statistics history, a few chunks each, stopping before the host's time limit. */
export async function deviceStatisticsStep(budgetMs = 25000) {
  const started = Date.now(), devices = (await cachedDevices(true)).filter(d => d.capabilities.some(c => c.code === ENERGY_CODE)), results: Array<{ id: string; name: string; written: number; oldest: string | null; error: string | null }> = [];
  let left = await historyCallsLeft();
  for (const device of devices) {
    if (Date.now() - started > budgetMs || left < 1) break;
    try { const chunks = Math.min(2, left); left -= chunks; const r = await deviceStatistics(device, ENERGY_CODE, chunks); results.push({ id: device.id, name: device.name, written: r.written, oldest: r.oldest, error: r.error }); }
    catch (e) { results.push({ id: device.id, name: device.name, written: 0, oldest: null, error: e instanceof Error ? e.message : String(e) }); }
  }
  return { status: 'ok', devices: devices.length, results };
}

/** Statistics-derived daily kWh by device then local date. */
export async function statisticsByDevice(from: string, to: string, deviceId?: string) {
  const rows = await database().prepare(`SELECT entity_id,period,grid_kwh FROM solar_energy_periods WHERE period_type='day' AND grid_source=? AND period>=? AND period<=?${deviceId ? ' AND entity_id=?' : ''}`)
    .bind(...[STATISTICS_SOURCE, from, to, ...(deviceId ? [deviceId] : [])]).all<{ entity_id: string; period: string; grid_kwh: number | null }>();
  const result = new Map<string, Map<string, number>>();
  for (const r of rows.results) if (r.grid_kwh !== null) { const days = result.get(r.entity_id) ?? new Map<string, number>(); days.set(r.period, r.grid_kwh); result.set(r.entity_id, days); }
  return result;
}
