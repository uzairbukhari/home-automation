import { env } from 'cloudflare:workers';
import { getOwnerUser } from '@/lib/owner-auth';
import { runCollection } from '@/lib/collection';
import { dbDiagnostics } from '@/lib/db';

// Owner-only: run one collection now and return the full outcome, including the error text a scheduler
// would only see as "502". Open it in the browser while signed in.
export async function GET(request: Request) {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // ?probe=1 only tries the Turso WebSocket upgrade a few ways and reports what came back (no collection).
  if (new URL(request.url).searchParams.get('probe')) {
    const base = String(env.TURSO_DATABASE_URL ?? '').trim().replace(/^libsql:\/\//, 'https://').replace(/^wss?:\/\//, 'https://').replace(/\/+$/, '');
    const results: Record<string, unknown> = {};
    for (const [name, path, protocol] of [['hrana3 /', '/', 'hrana3'], ['hrana2 /', '/', 'hrana2'], ['hrana1 /', '/', 'hrana1'], ['none /', '/', ''], ['hrana3 /v3', '/v3', 'hrana3'], ['hrana3 /v2', '/v2', 'hrana3']]) {
      try {
        const response = await fetch(base + path, { headers: protocol ? { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': protocol } : { Upgrade: 'websocket' } });
        const socket = (response as unknown as { webSocket?: { accept(): void; close(): void } }).webSocket;
        results[name] = { status: response.status, websocket: Boolean(socket), body: socket ? '' : (await response.text().catch(() => '')).slice(0, 150) };
        if (socket) { socket.accept(); socket.close(); }
      } catch (error) { results[name] = { error: String(error) }; }
    }
    return Response.json({ results }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const started = Date.now();
  try {
    const result = await runCollection(true);
    return Response.json({ ok: true, ms: Date.now() - started, result, db: dbDiagnostics() }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ ok: false, ms: Date.now() - started, error: String(error), stack: error instanceof Error ? error.stack?.slice(0, 1500) : undefined, db: dbDiagnostics() }, { status: 500, headers: { 'cache-control': 'private, no-store' } });
  }
}
