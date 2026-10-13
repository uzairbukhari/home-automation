import { getOwnerUser } from '@/lib/owner-auth';
import { cachedSnapshot } from '@/lib/solar-store';
import { localDate, shiftDate } from '@/lib/measurements';
import { gridDays } from '@/lib/grid-stats';

// Outages and voltage health per day, rolled up from the saved inverter fields.
export async function GET(request: Request) {
  const user = await getOwnerUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const requested = Number(new URL(request.url).searchParams.get('days') ?? 30),
      days = Number.isInteger(requested) && requested >= 1 && requested <= 365 ? requested : 30,
      snapshot = await cachedSnapshot(false, false);
    if (!snapshot) return Response.json({ error: 'No saved solar readings yet.' }, { status: 503 });
    const to = localDate(),
      from = shiftDate(to, -(days - 1));
    return Response.json(
      { from, to, days: await gridDays(snapshot.device.serial, from, to), timeZone: 'Asia/Karachi' },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Grid data is unavailable' },
      { status: 502 },
    );
  }
}
