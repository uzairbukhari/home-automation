import { database } from '@/lib/jobs';
import { serverTiming } from '@/lib/server-timing';
import { getOwnerUser } from '@/lib/owner-auth';
import { cachedSnapshot } from '@/lib/solar-store';
import { localDate, shiftDate } from '@/lib/measurements';
import type { DailySummary } from '@/lib/telemetry';
import type { HeatmapDay } from '@/lib/trends';

// Average home, solar and grid power for every hour of each stored day (hourly rollups are kept 90 days).
export async function GET(request: Request) {
  const timing = serverTiming();
  const user = await getOwnerUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const requested = Number(new URL(request.url).searchParams.get('days') ?? 30),
      days = Number.isInteger(requested) && requested >= 1 && requested <= 90 ? requested : 30,
      snapshot = await cachedSnapshot(false, false);
    if (!snapshot) return Response.json({ error: 'No saved solar readings yet.' }, { status: 503 });
    const to = localDate(),
      from = shiftDate(to, -(days - 1)),
      rows = await database()
        .prepare(
          "SELECT period,data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity='day' AND period>=? AND period<=? ORDER BY period",
        )
        .bind(snapshot.device.serial, from, to)
        .all<{ period: string; data: string }>();
    const average = (cell?: { integral: number; hours: number }) =>
        cell && cell.hours >= 0.25 ? cell.integral / cell.hours : null,
      series: HeatmapDay[] = rows.results.flatMap((row) => {
        const day = JSON.parse(row.data) as DailySummary;
        if (!day.hours?.length) return [];
        const hours = (key: string) => Array.from({ length: 24 }, (_, h) => average(day.hours[h]?.[key]));
        return [{ date: row.period, home: hours('home'), solar: hours('solar'), grid: hours('grid') }];
      });
    return Response.json(
      { from, to, days: series, timeZone: 'Asia/Karachi', unit: 'W' },
      { headers: { 'cache-control': 'private, no-store', ...timing.headers() } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Heatmap data is unavailable' },
      { status: 502 },
    );
  }
}
