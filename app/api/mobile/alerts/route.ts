import { getOwnerUser } from '@/lib/owner-auth';
import { appAlertFeed } from '@/lib/app-alerts';

export async function GET(request: Request) {
  const user = await getOwnerUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  const raw = new URL(request.url).searchParams.get('after');
  const after = raw === null ? null : Number(raw);
  if (after !== null && (!Number.isSafeInteger(after) || after < 0)) return Response.json({ error: 'Invalid cursor' }, { status: 400 });
  return Response.json(await appAlertFeed(user.userId, after), { headers: { 'cache-control': 'private, no-store' } });
}
