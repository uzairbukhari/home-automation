import { database } from './jobs';
import { env } from '@/lib/env';

/** Tuya's Trial plan allows ~26,000 calls a month; history backfill may use only a small daily slice so live collection and commands keep their share. */
export const HISTORY_DAILY_CALLS = Math.max(0, Number((env as unknown as Record<string, string | undefined>).TUYA_HISTORY_DAILY_CALLS ?? 150) || 150);

/** Tuya history calls still available in the rolling 24 hours. */
export async function historyCallsLeft(now = Date.now()) {
  const since = new Date(now - 86_400_000).toISOString();
  const row = await database().prepare("SELECT COUNT(*) n FROM provider_requests WHERE provider='tuya' AND purpose='history' AND timestamp>=?").bind(since).first<{ n: number }>();
  return Math.max(0, HISTORY_DAILY_CALLS - Number(row?.n ?? 0));
}
