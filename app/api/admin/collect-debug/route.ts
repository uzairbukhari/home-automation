import { getOwnerUser } from '@/lib/owner-auth';
import { runCollection } from '@/lib/collection';
import { dbDiagnostics } from '@/lib/db';
// Where the function runs and which database host it talks to (hostname only, never the token): the distance between them is the cost of every query.
const where = () => { let tursoHost: string | null = null; try { tursoHost = process.env.TURSO_DATABASE_URL ? new URL(process.env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://')).hostname : null; } catch { /* malformed URL: leave null */ } return { vercelRegion: process.env.VERCEL_REGION ?? null, tursoHost }; };
// Hosts that cap function time (Vercel) get the full minute a collection can need.
export const maxDuration = 60;

// Owner-only: run one collection now and return the full outcome, including the error text a scheduler
// would only see as "502". Open it in the browser while signed in.
export async function GET() {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  try {
    const result = await runCollection(true);
    return Response.json({ ok: true, ms: Date.now() - started, result, db: { ...dbDiagnostics(), ...where() } }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ ok: false, ms: Date.now() - started, error: String(error), stack: error instanceof Error ? error.stack?.slice(0, 1500) : undefined, db: { ...dbDiagnostics(), ...where() } }, { status: 500, headers: { 'cache-control': 'private, no-store' } });
  }
}
