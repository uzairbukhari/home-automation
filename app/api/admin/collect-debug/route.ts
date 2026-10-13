import { getOwnerUser } from '@/lib/owner-auth';
import { runCollection } from '@/lib/collection';
import { dbDiagnostics } from '@/lib/db';

// Owner-only: run one collection now and return the full outcome, including the error text a scheduler
// would only see as "502". Open it in the browser while signed in.
export async function GET() {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  try {
    const result = await runCollection(true);
    return Response.json({ ok: true, ms: Date.now() - started, result, db: dbDiagnostics() }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ ok: false, ms: Date.now() - started, error: String(error), stack: error instanceof Error ? error.stack?.slice(0, 1500) : undefined, db: dbDiagnostics() }, { status: 500, headers: { 'cache-control': 'private, no-store' } });
  }
}
