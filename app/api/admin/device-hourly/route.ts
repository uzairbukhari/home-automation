import { getOwnerUser } from '@/lib/owner-auth';
import { deviceHourlyDay, hourlyByDay } from '@/lib/device-hourly';
import { cachedDevices } from '@/lib/tuya-store';
import { localDate, shiftDate } from '@/lib/measurements';
export const maxDuration = 60;

// Owner-only. Without parameters: what is stored so far per device. With ?fetch=1[&day=YYYY-MM-DD]: spends ONE Tuya history call on that day (default yesterday) and shows the raw answer.
export async function GET(request: Request) {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url), today = localDate(), headers = { 'cache-control': 'private, no-store' };
  try {
    const devices = (await cachedDevices(true)).filter(d => d.capabilities.some(c => c.code === 'add_ele'));
    if (url.searchParams.get('fetch')) {
      const day = url.searchParams.get('day') ?? shiftDate(today, -1), device = devices.find(d => d.id === url.searchParams.get('device')) ?? devices[0];
      if (!device) return Response.json({ ok: false, error: 'No energy devices' }, { status: 404, headers });
      return Response.json({ ok: true, device: device.name, ...await deviceHourlyDay(device, day) }, { headers });
    }
    const stored = await Promise.all(devices.map(async d => { const days = await hourlyByDay(d.id, shiftDate(today, -400), today); return { id: d.id, name: d.name, days: Object.keys(days).length, newest: Object.keys(days).sort().at(-1) ?? null }; }));
    return Response.json({ ok: true, stored }, { headers });
  } catch (error) { return Response.json({ ok: false, error: String(error) }, { status: 500, headers }); }
}
