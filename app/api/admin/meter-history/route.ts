import { getOwnerUser } from '@/lib/owner-auth';
import { meterHistoryStep } from '@/lib/meter-history';
export const maxDuration = 60;

// Owner-only: pull more of the grid meter's history now and report what Tuya returned. Open it in the browser while signed in; repeat until status is caught_up.
export async function GET() {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json({ ok: true, result: await meterHistoryStep(50000) }, { headers: { 'cache-control': 'private, no-store' } }); }
  catch (error) { return Response.json({ ok: false, error: String(error) }, { status: 500, headers: { 'cache-control': 'private, no-store' } }); }
}
