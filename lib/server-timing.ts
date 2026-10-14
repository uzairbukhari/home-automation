import { dbDiagnostics } from './db';

const snapshot = () => { const d = dbDiagnostics() as { httpRequests?: number; totalMs?: number }; return { calls: d.httpRequests ?? 0, ms: d.totalMs ?? 0 }; };

/**
 * Starts timing a request. headers() returns a Server-Timing header with total time and the database calls made since the start.
 * The database client is shared by every request in an instance, so overlapping requests are counted too: the db figures are approximate.
 */
export function serverTiming() {
  const started = Date.now(), before = snapshot();
  return { headers: (): Record<string, string> => { const after = snapshot(); return { 'server-timing': `total;dur=${Date.now() - started}, db;dur=${after.ms - before.ms};desc="${after.calls - before.calls} calls"` }; } };
}
