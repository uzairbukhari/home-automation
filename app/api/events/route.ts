import { getOwnerUser } from '@/lib/owner-auth';
import { eventsTimeline } from '@/lib/events-timeline';

export async function GET(request: Request) {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) return Response.json({ error: 'Choose between 1 and 365 days' }, { status: 400 });
  try { return Response.json({ days, events: await eventsTimeline(days) }, { headers: { 'cache-control': 'private, no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Events are unavailable' }, { status: 502, headers: { 'cache-control': 'private, no-store' } }); }
}
