import { localDate, shiftDate } from './measurements';
import { energyReport, sortedPoints, type SolarPoint } from './solar-energy';
import type { DayStat } from './battery-stats';

/** What the inverter's own readings say about one local day: everything in DayStat except the upstream meter's figure. */
export type InverterDay = Omit<DayStat, 'meterGridKwh'>;

export function inverterDay(date: string, points: SolarPoint[]): InverterDay {
  const sorted = sortedPoints(points), report = energyReport(sorted), soc = sorted.map(p => p.battery).filter((n): n is number => n !== null && n >= 0 && n <= 100);
  return {
    date, coveredHours: report.coveredHours, partial: report.coveredHours < (date === localDate() ? 1 : 20),
    chargedKwh: report.batteryChargeKwh, dischargedKwh: report.batteryDischargeKwh, homeKwh: report.homeKwh, directSolarKwh: report.directSolarKwh, inverterGridKwh: report.gridKwh,
    socMin: report.socMin, socMax: report.socMax, socStart: soc[0] ?? null, socEnd: soc.at(-1) ?? null, peakSolarW: report.peakSolarW,
  };
}

// Finished days are kept in telemetry_summaries (additive: no new table) as one row per day, so a report reads one row instead of integrating a day of five-minute readings.
export const DAYSTAT_GRANULARITY = 'daystat';
/** Bump when inverterDay or energyReport change what a day adds up to: rows of another version are ignored and rebuilt. */
export const DAYSTAT_VERSION = 1;

/**
 * Whether a computed day is final enough to store. Never today. A day with at least 20 hours of readings is complete (what the old in-memory cache used).
 * A thinner day is stored only once it is more than two days old: collection re-reads the last two days, so anything older will not gain readings.
 * A day without any readings is never stored.
 */
export function storableDay(day: InverterDay, sampleCount: number, today = localDate()) {
  return sampleCount > 0 && day.date < today && (day.coveredHours >= 20 || day.date <= shiftDate(today, -2));
}

const UPSERT = "INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES ('dessmonitor',?,?,?,'',?,?,?) ON CONFLICT(source,entity_id,granularity,period,room) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,calculation_version=excluded.calculation_version";
export const daystatStatement = (db: Db, entity: string, day: InverterDay) => db.prepare(UPSERT).bind(entity, DAYSTAT_GRANULARITY, day.date, JSON.stringify(day), new Date().toISOString(), DAYSTAT_VERSION);
export async function writeDayStats(db: Db, entity: string, days: InverterDay[]) { for (let i = 0; i < days.length; i += 80) await db.batch(days.slice(i, i + 80).map(day => daystatStatement(db, entity, day))); }

/** The stored rows for [from,to] at the current version, by date. A row that does not parse counts as missing. */
export async function storedDayStats(db: Db, entity: string, from: string, to: string) {
  const rows = await db.prepare("SELECT period,data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity=? AND calculation_version=? AND period>=? AND period<=?").bind(entity, DAYSTAT_GRANULARITY, DAYSTAT_VERSION, from, to).all<{ period: string; data: string }>(), found = new Map<string, InverterDay>();
  for (const row of rows.results) { try { found.set(row.period, { ...(JSON.parse(row.data) as InverterDay), date: row.period }); } catch { /* rebuilt from the readings */ } }
  return found;
}
