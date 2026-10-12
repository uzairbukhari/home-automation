import { database } from '@/lib/jobs';

// Alerts for the native app. The app polls this feed (no Google push service needed).
// Created lazily like login_attempts so it needs no migration.
export type AppAlertInput = { eventId: string; title: string; body: string; url: string };

const RETENTION_MS = 30 * 86_400_000;

export async function ensureAppAlerts() {
  await database().prepare('CREATE TABLE IF NOT EXISTS app_alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, created_at TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL)').run();
}

export function appAlertStatement(userId: string, alert: AppAlertInput, createdAt: string) {
  return database().prepare('INSERT OR IGNORE INTO app_alerts(event_id,user_id,created_at,title,body,url) VALUES (?,?,?,?,?,?)').bind(alert.eventId, userId, createdAt, alert.title, alert.body, alert.url);
}

/** With no cursor this only reports the newest id, so a freshly installed app doesn't replay history. */
export async function appAlertFeed(userId: string, after: number | null, now = Date.now()) {
  await ensureAppAlerts();
  const db = database();
  await db.prepare('DELETE FROM app_alerts WHERE created_at<?').bind(new Date(now - RETENTION_MS).toISOString()).run();
  const latest = (await db.prepare('SELECT MAX(id) latest FROM app_alerts WHERE user_id=?').bind(userId).first<{ latest: number | null }>())?.latest ?? 0;
  if (after === null) return { alerts: [], latest };
  const rows = await db.prepare('SELECT id,created_at AS createdAt,title,body,url FROM app_alerts WHERE user_id=? AND id>? ORDER BY id LIMIT 20').bind(userId, after).all<{ id: number; createdAt: string; title: string; body: string; url: string }>();
  return { alerts: rows.results, latest };
}
