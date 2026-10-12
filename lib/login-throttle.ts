import { database } from '@/lib/jobs';

// Shared by the website and the native app: 8 wrong passwords per IP per 15 minutes.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;
const currentWindow = () => Math.floor(Date.now() / WINDOW_MS);

export async function loginLocked(ip: string) {
  const db = database();
  await db.prepare('CREATE TABLE IF NOT EXISTS login_attempts(ip TEXT NOT NULL, window INTEGER NOT NULL, failures INTEGER NOT NULL, PRIMARY KEY(ip, window))').run();
  const row = await db.prepare('SELECT failures FROM login_attempts WHERE ip=? AND window=?').bind(ip, currentWindow()).first<{ failures: number }>();
  return (row?.failures ?? 0) >= MAX_FAILURES;
}

export async function recordLoginFailure(ip: string) {
  const db = database(), window = currentWindow();
  await db.prepare('INSERT INTO login_attempts(ip,window,failures) VALUES (?,?,1) ON CONFLICT(ip,window) DO UPDATE SET failures=failures+1').bind(ip, window).run();
  await db.prepare('DELETE FROM login_attempts WHERE window<?').bind(window - 1).run();
}
