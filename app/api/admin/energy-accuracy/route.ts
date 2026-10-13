import { getOwnerUser } from '@/lib/owner-auth';
import { energyAccuracy } from '@/lib/energy-accuracy';
import { DessMonitorProvider } from '@/lib/providers/dessmonitor';
export const maxDuration = 60;

// Owner-only: compare integrated five-minute solar power with the provider's daily solar total, per day. Open it in the browser while signed in.
export async function GET() {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { serial } = await new DessMonitorProvider().getIdentity();
    return Response.json({ ok: true, ...await energyAccuracy(serial) }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return Response.json({ ok: false, error: String(error) }, { status: 500, headers: { 'cache-control': 'private, no-store' } }); }
}
