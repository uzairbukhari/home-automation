import { getOwnerUser } from '@/lib/owner-auth';
import { appAlertStatement, ensureAppAlerts } from '@/lib/app-alerts';

// Lets the app check the whole path (server feed, phone permission, notification) on demand.
export async function POST() {
  const user = await getOwnerUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  await ensureAppAlerts();
  const now = new Date();
  await appAlertStatement(user.userId, { eventId: `test:${crypto.randomUUID()}`, title: 'Photon · test', body: 'Alerts are working on this phone.', url: '/' }, now.toISOString()).run();
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
