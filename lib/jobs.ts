import { reserveProviderRequest } from './provider-policy';
import { env } from 'cloudflare:workers';

export function database() { if (!env.DB) throw new Error('Database is unavailable'); return env.DB; }
export const iso = (value: string) => new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z').toISOString();
export async function claimJob(id: string, intervalMs = 0, leaseMs = 240000, now = new Date(), force = false) {
  const db = database(), stamp = now.toISOString(), token = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO app_jobs(id,updated_at) VALUES (?,?)').bind(id, stamp).run();
  const row = await db.prepare('UPDATE app_jobs SET lease_token=?,lease_until=?,updated_at=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?) AND (? OR next_due IS NULL OR next_due<=?) RETURNING id').bind(token, new Date(+now + leaseMs).toISOString(), stamp, id, stamp, force ? 1 : 0, stamp).first();
  return row ? { id, token, intervalMs, startedAt:stamp } : null;
}
export async function finishJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>, error?: string, now = new Date()) {
  // Anchor intervals to acquisition, not completion: a slow run must not halve a cron cadence.
  await database().prepare('UPDATE app_jobs SET lease_token=NULL,lease_until=NULL,next_due=?,last_success=CASE WHEN ? IS NULL THEN ? ELSE last_success END,error=?,updated_at=? WHERE id=? AND lease_token=?').bind(new Date(error?+now+60000:Date.parse(job.startedAt)+Math.max(0,job.intervalMs-(job.intervalMs>=300000?15000:0))).toISOString(), error ?? null, now.toISOString(), error ?? null, now.toISOString(), job.id, job.token).run();
}
export async function dueWork(id: string, intervalMs: number, work: () => Promise<unknown>, force = false) {
  const job = await claimJob(id, intervalMs, 240000, new Date(), force); if (!job) return { status: 'already_running_or_not_due' };
  try { const result = await work(); await finishJob(job); return result; }
  catch (error) { await finishJob(job, error instanceof Error ? error.message : 'Job failed'); throw error; }
}
// Shared across workers. A provider throttle suppresses subsequent requests until its deadline.
export async function providerFetch(provider: 'tuya' | 'dessmonitor', purpose: string, url: string, init?: RequestInit) {
  const db = env.DB, now = new Date().toISOString();
  if (db) { const blocked = await db.prepare('SELECT next_due FROM app_jobs WHERE id=?').bind(`throttle:${provider}`).first<{next_due:string}>(); if (blocked?.next_due && blocked.next_due > now) throw new Error(`${provider} rate limit: waiting before retry`); }
  await reserveProviderRequest(provider,purpose);
  let status: number | null = null, error: string | null = null;
  try {
    const response = await fetch(url, init); status = response.status;
    if (status === 429 && db) {
      const retry = response.headers.get('retry-after'), seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 300;
      await db.prepare('INSERT INTO app_jobs(id,next_due,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET next_due=excluded.next_due,updated_at=excluded.updated_at').bind(`throttle:${provider}`, new Date(Date.now() + Math.max(60, Math.min(3600, seconds)) * 1000).toISOString(), now).run();
    }
    if (!response.ok) error = `HTTP ${status}`;
    return response;
  } catch (reason) { error = reason instanceof Error ? reason.name : 'Network error'; throw reason; }
  finally { if (db) await db.prepare('INSERT INTO provider_requests(provider,purpose,timestamp,status,error) VALUES (?,?,?,?,?)').bind(provider, purpose, now, status, error).run(); }
}
