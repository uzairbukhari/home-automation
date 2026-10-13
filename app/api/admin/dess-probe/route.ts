import { getOwnerUser } from '@/lib/owner-auth';
import { DessMonitorProvider } from '@/lib/providers/dessmonitor';
export const maxDuration = 60;

// Owner-only survey of what DessMonitor holds for the inverter: declared energy keys, a month of daily values for each, energy flow, parameters and control fields. Open it in the browser while signed in.
export async function GET() {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json({ ok: true, ...await new DessMonitorProvider().probe() }, { headers: { 'cache-control': 'private, no-store' } }); }
  catch (error) { return Response.json({ ok: false, error: String(error) }, { status: 500, headers: { 'cache-control': 'private, no-store' } }); }
}
