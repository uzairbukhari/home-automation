import { database } from '@/lib/jobs';
import { serverTiming } from '@/lib/server-timing';
import { getOwnerUser } from '@/lib/owner-auth';
import { cachedSnapshot } from '@/lib/solar-store';
import { localDate, shiftDate } from '@/lib/measurements';
import type { DailySummary } from '@/lib/telemetry';
import type { SocDay } from '@/lib/battery-insights';

// Per-day battery range and the hours spent at each charge level, from the permanent daily summaries.
export async function GET(request: Request) {
  const timing = serverTiming();
  const user = await getOwnerUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const requested = Number(new URL(request.url).searchParams.get('days') ?? 30),
      days = Number.isInteger(requested) && requested >= 1 && requested <= 365 ? requested : 30,
      snapshot = await cachedSnapshot(false, false);
    if (!snapshot) return Response.json({ error: 'No saved solar readings yet.' }, { status: 503 });
    const to = localDate(),
      from = shiftDate(to, -(days - 1)),
      rows = await database()
        .prepare(
          "SELECT period,data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity='day' AND period>=? AND period<=? ORDER BY period",
        )
        .bind(snapshot.device.serial, from, to)
        .all<{ period: string; data: string }>(),
      series: SocDay[] = rows.results.map((row) => {
        const day = JSON.parse(row.data) as DailySummary,
          soc = day.metrics?.battery;
        return {
          date: row.period,
          socMin: soc?.min ?? null,
          socMax: soc?.max ?? null,
          socHours: Array.isArray(day.socHours) ? day.socHours.map((h) => Number(h.toFixed(3))) : null,
        };
      });
    return Response.json(
      { from, to, days: series, timeZone: 'Asia/Karachi' },
      { headers: { 'cache-control': 'private, no-store', ...timing.headers() } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Battery data is unavailable' },
      { status: 502 },
    );
  }
}
