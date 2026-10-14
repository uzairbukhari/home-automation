import { serverTiming } from '@/lib/server-timing';
import { getOwnerUser } from '@/lib/owner-auth';
import { cachedSnapshot } from '@/lib/solar-store';
import { savedSettings } from '@/lib/settings-store';
import { localDate } from '@/lib/measurements';
import { batteryStats, dayStats } from '@/lib/day-stats';

export async function GET() {
  const timing = serverTiming();
  const user = await getOwnerUser(); if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const snapshot = await cachedSnapshot(false, false); if (!snapshot) return Response.json({ error: 'No saved solar readings yet.' }, { status: 503 });
    const settings = await savedSettings(user.userId), { days } = await dayStats(snapshot.device.serial, '2000-01-01', localDate());
    return Response.json(batteryStats(days, settings.capacity), { headers: { 'cache-control': 'private, no-store', ...timing.headers() } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Battery statistics are unavailable' }, { status: 502 }); }
}
