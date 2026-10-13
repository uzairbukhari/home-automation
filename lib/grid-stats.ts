import { database } from './jobs';
import { localDate, normalizeMeasurement, shiftDate } from './measurements';
import { summarizeGrid, type GridDay, type GridPoint } from './grid-math';

type RawRow = { source_timestamp: string; data: string };
const GRID_GRANULARITY = 'grid';

function pointFrom(row: RawRow): GridPoint | null {
  const stamp = Date.parse(row.source_timestamp);
  if (!Number.isFinite(stamp)) return null;
  const fields = JSON.parse(row.data) as Record<string, { value: string; unit: string }>,
    read = (title: string, unit: string) => {
      const f = fields[title];
      return f ? normalizeMeasurement(f.value, f.unit, unit) : null;
    };
  return {
    stamp,
    voltage: read('grid voltage', 'V'),
    frequency: read('frequency of grid', 'Hz'),
    homeW: read('output active power', 'W'),
  };
}

/** Rebuilds and stores one day's grid summary from the saved raw inverter fields (additive: reuses the summaries table). */
export async function summarizeGridDay(entity: string, date: string) {
  const db = database(),
    rows = await db
      .prepare(
        'SELECT source_timestamp,data FROM solar_raw_fields WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<?',
      )
      .bind(
        entity,
        new Date(`${date}T00:00:00+05:00`).toISOString(),
        new Date(`${shiftDate(date, 1)}T00:00:00+05:00`).toISOString(),
      )
      .all<RawRow>(),
    points = rows.results.flatMap((r) => pointFrom(r) ?? []);
  if (!points.length) return null;
  const day = summarizeGrid(points, date);
  await db
    .prepare(
      "INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES ('dessmonitor',?,?,?,'',?,?,1) ON CONFLICT(source,entity_id,granularity,period,room) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    )
    .bind(entity, GRID_GRANULARITY, date, JSON.stringify(day), new Date().toISOString())
    .run();
  return day;
}

export async function gridDays(entity: string, from: string, to: string) {
  const rows = await database()
    .prepare(
      "SELECT data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity=? AND period>=? AND period<=? ORDER BY period",
    )
    .bind(entity, GRID_GRANULARITY, from, to)
    .all<{ data: string }>();
  return rows.results.map((r) => JSON.parse(r.data) as GridDay);
}

/** Maintenance: keep today and yesterday fresh, and work backwards through older stored days a few at a time. */
export async function gridRollupStep(entity: string, backfill = 4) {
  const today = localDate(),
    done: string[] = [];
  for (const date of [today, shiftDate(today, -1)]) if (await summarizeGridDay(entity, date)) done.push(date);
  const db = database(),
    first = await db
      .prepare('SELECT MIN(source_timestamp) stamp FROM solar_raw_fields WHERE entity_id=?')
      .bind(entity)
      .first<{ stamp: string | null }>();
  if (!first?.stamp) return { done };
  const oldest = localDate(first.stamp),
    have = new Set(
      (
        await db
          .prepare(
            "SELECT period FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity=?",
          )
          .bind(entity, GRID_GRANULARITY)
          .all<{ period: string }>()
      ).results.map((r) => r.period),
    );
  let date = shiftDate(today, -2),
    scanned = 0;
  while (date >= oldest && done.length < backfill + 2 && scanned < 400) {
    if (!have.has(date) && (await summarizeGridDay(entity, date))) done.push(date);
    date = shiftDate(date, -1);
    scanned++;
  }
  return { done };
}
