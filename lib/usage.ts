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

// Turso Free allows 500M rows read a month; going over blocks every query until the month resets.
export const MONTHLY_READ_QUOTA = 500_000_000;
/** Share of the monthly quota (counted as used or projected) at which background work backs off: backfills and imports first, then all maintenance, then everything but live collection, automations and alerts. */
export const ECONOMY_STEPS = [0.7, 0.85, 0.95] as const;
export const ALERT_STEPS = [0.5, 0.75, 0.9] as const;

const karachi = (now: number) => new Date(now + 5 * 3600000);
export function projectMonth(read: number, now = Date.now()) {
  const local = karachi(now), year = local.getUTCFullYear(), month = local.getUTCMonth(), days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedDays = Math.max(1, local.getUTCDate() - 1 + (local.getUTCHours() * 60 + local.getUTCMinutes()) / 1440);
  const projected = Math.round(read / elapsedDays * days), ratio = Math.max(read, projected) / MONTHLY_READ_QUOTA;
  return { read, projected, ratio, level: ECONOMY_STEPS.filter(step => ratio >= step).length, month: local.toISOString().slice(0, 7) };
}
/** Month-to-date rows read and written by the jobs that report usage (collection and maintenance, which is nearly all of it), plus the projection to month end. */
export async function monthBudget(now = Date.now()) {
  const start = karachi(now).toISOString().slice(0, 7) + '-01';
  const row = await appDb().prepare("SELECT COALESCE(SUM(json_extract(data,'$.read')),0) read,COALESCE(SUM(json_extract(data,'$.written')),0) written FROM operational_daily WHERE kind LIKE 'usage:%' AND date>=?").bind(start).first<{ read: number; written: number }>();
  return { ...projectMonth(Number(row?.read ?? 0), now), written: Number(row?.written ?? 0), quota: MONTHLY_READ_QUOTA };
}
let cached: { at: number; level: number } | undefined;
/** 0 = normal, 1 = pause backfills and imports, 2 = pause all maintenance, 3 = live collection, automations and alerts only. Cached for ten minutes. */
export async function economyLevel(now = Date.now()) {
  if (cached && now - cached.at < 600000) return cached.level;
  const { level } = await monthBudget(now); cached = { at: now, level }; return level;
}
export const resetEconomyCache = () => { cached = undefined; };
/** Tells the app when the month's reads pass 50%, 75% and 90% of the quota (counted or projected), once per step per month. */
export async function usageAlerts(now = Date.now()) {
  const { ensureAppAlerts, appAlertStatement } = await import('./app-alerts'), b = await monthBudget(now), db = appDb();
  const reached = ALERT_STEPS.filter(step => b.ratio >= step); if (!reached.length) return { sent: 0 };
  await ensureAppAlerts();
  const users = (await db.prepare('SELECT DISTINCT user_id FROM notification_rules').all<{ user_id: string }>()).results, stamp = new Date(now).toISOString(), statements: DbStatement[] = [];
  for (const step of reached) for (const u of users) statements.push(appAlertStatement(u.user_id, {
    eventId: `usage:${b.month}:${Math.round(step * 100)}`, title: 'Photon · database usage',
    body: `Turso reads this month: ${(b.read / 1e6).toFixed(0)}M of 500M, heading for ${(b.projected / 1e6).toFixed(0)}M. ${b.level ? 'Background jobs are slowing down to stay under the limit.' : 'No action needed yet.'}`, url: '/settings',
  }, stamp));
  if (statements.length) await db.batch(statements);
  return { sent: statements.length, level: b.level };
}
