import { appDb } from './db';

type Counters = { rowsRead?: number; rowsWritten?: number };
const counters = () => (appDb() as unknown as { diagnostics?: () => Counters } | undefined)?.diagnostics?.() ?? {};

/** Rows Turso billed while `work` ran, added to today's total for `kind` (a job or route name). Counts overlap when two jobs run at once on one instance, which is fine for a budget. */
export async function trackUsage<T>(kind: string, work: () => Promise<T>): Promise<T> {
  const before = counters();
  try { return await work(); }
  finally {
    const after = counters(), read = (after.rowsRead ?? 0) - (before.rowsRead ?? 0), written = (after.rowsWritten ?? 0) - (before.rowsWritten ?? 0);
    if (read > 0 || written > 0) await recordUsage(kind, read, written).catch(() => { /* a failed note must never fail the job, and is not retried: it would cost reads itself */ });
  }
}
export async function recordUsage(kind: string, read: number, written: number) {
  const db = appDb(); if (!db) return;
  const date = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const r = Math.round(read), w = Math.round(written);
  await db.prepare("INSERT INTO operational_daily(date,kind,data) VALUES (?,?,json_object('read',?,'written',?,'runs',1)) ON CONFLICT(date,kind) DO UPDATE SET data=json_object('read',json_extract(operational_daily.data,'$.read')+?,'written',json_extract(operational_daily.data,'$.written')+?,'runs',json_extract(operational_daily.data,'$.runs')+1)")
    .bind(date, 'usage:' + kind, r, w, r, w).run();
}
/** Month-to-date billed rows by job, newest day first. */
export async function usageSummary(days = 31) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await appDb().prepare("SELECT date,substr(kind,7) job,data FROM operational_daily WHERE kind LIKE 'usage:%' AND date>=? ORDER BY date DESC").bind(since).all<{ date: string; job: string; data: string }>();
  return rows.results.map(r => ({ date: r.date, job: r.job, ...(JSON.parse(r.data) as { read: number; written: number; runs: number }) }));
}
