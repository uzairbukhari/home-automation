import { database } from './jobs';
import { historyCallsLeft } from './history-budget';
import { localDate, shiftDate } from './measurements';
import { TuyaProvider, type TuyaDashboardDevice } from './providers/tuya';
import { decodeTuya } from './tuya-format';
import { cachedDevices } from './tuya-store';

const ENERGY_CODE = 'add_ele';
/** Hourly pulls only start while this many history calls remain, so the daily statistics keep priority. */
export const HOURLY_RESERVE = 60;
/** How many past days are fetched the first time; after that one new day per device per step. */
export const HOURLY_DAYS = 14;
const dataset = (day: string) => `energy-hours:${day}`;

/** Pull the hour values out of whatever shape Tuya answered with: `hours` map, or the map itself. */
export function parseHours(result: unknown): Record<string, number> {
  const root = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const map = root.hours && typeof root.hours === 'object' ? root.hours as Record<string, unknown> : root;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (/^\d{10}$/.test(k) && v !== null && v !== '' && Number.isFinite(Number(v))) out[k] = Number(v);
  return out;
}

/** Fetch one completed day of hourly energy for a device and keep it. Returns the raw answer so a surprise is visible. */
export async function deviceHourlyDay(device: TuyaDashboardDevice, day: string) {
  const cap = device.capabilities.find(c => c.code === ENERGY_CODE); if (!cap) return { day, hours: 0, error: 'no energy datapoint', raw: null as unknown };
  const compact = day.replaceAll('-', ''); let raw: unknown;
  try { raw = await new TuyaProvider().getStatisticsHours(device.id, ENERGY_CODE, `${compact}00`, `${compact}23`); } catch (e) { return { day, hours: 0, error: e instanceof Error ? e.message : String(e), raw: null as unknown }; }
  const hours: Record<string, number> = {};
  for (const [k, v] of Object.entries(parseHours(raw))) { const kwh = decodeTuya(v, { ...cap, metadataVerified: true }).numericValue; if (kwh !== null && kwh >= 0 && k.startsWith(compact)) hours[k.slice(8)] = kwh; }
  const now = new Date().toISOString();
  if (Object.keys(hours).length) await database().prepare(`INSERT INTO provider_documents (provider,entity_id,dataset,data,first_seen_at,updated_at) VALUES ('tuya',?,?,?,?,?)
    ON CONFLICT(provider,entity_id,dataset) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`).bind(device.id, dataset(day), JSON.stringify(hours), now, now).run();
  return { day, hours: Object.keys(hours).length, error: null as string | null, raw };
}

/** Each energy device gets at most one new day per step, oldest missing first, and only while the daily history budget has room. */
export async function deviceHourlyStep(budgetMs = 20000) {
  const started = Date.now(), db = database(), today = localDate(), yesterday = shiftDate(today, -1);
  const devices = (await cachedDevices(true)).filter(d => d.capabilities.some(c => c.code === ENERGY_CODE)), results: Array<{ id: string; name: string; day: string | null; hours: number; error: string | null }> = [];
  let left = await historyCallsLeft();
  for (const device of devices) {
    if (Date.now() - started > budgetMs || left <= HOURLY_RESERVE) break;
    const key = `devhours:${device.id}`, row = await db.prepare('SELECT covered_through FROM tuya_sync WHERE device_id=?').bind(key).first<{ covered_through: string | null }>();
    const day = row?.covered_through ? shiftDate(row.covered_through, 1) : shiftDate(today, -HOURLY_DAYS);
    if (day > yesterday) { results.push({ id: device.id, name: device.name, day: null, hours: 0, error: null }); continue; }
    left -= 1;
    const r = await deviceHourlyDay(device, day);
    // An empty day is still a day answered; an error is retried next step.
    if (!r.error) await db.prepare('INSERT INTO tuya_sync(device_id,from_ms,to_ms,cursor,covered_through,error) VALUES (?,NULL,NULL,NULL,?,NULL) ON CONFLICT(device_id) DO UPDATE SET covered_through=excluded.covered_through,error=NULL').bind(key, day).run();
    results.push({ id: device.id, name: device.name, day, hours: r.hours, error: r.error });
  }
  return { status: 'ok', devices: devices.length, results };
}

/** Stored hourly kWh for a device over a date range: date -> hour ("00".."23") -> kWh. */
export async function hourlyByDay(deviceId: string, from: string, to: string) {
  const rows = await database().prepare("SELECT dataset,data FROM provider_documents WHERE provider='tuya' AND entity_id=? AND dataset>=? AND dataset<=?").bind(deviceId, dataset(from), dataset(to)).all<{ dataset: string; data: string }>();
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows.results) { try { out[r.dataset.slice('energy-hours:'.length)] = JSON.parse(r.data); } catch { /* skip a damaged document */ } }
  return out;
}
