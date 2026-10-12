import { env } from 'cloudflare:workers';
import { sameOrigin } from '@/lib/owner-auth';
import { database } from '@/lib/jobs';
import { safeReturnPath, sessionCookie, signSession, verifyPassword } from '@/lib/session';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

type Settings = { DASHBOARD_PASSWORD_HASH?: string; SESSION_SECRET?: string; DASHBOARD_OWNER_EMAIL?: string; OWNER_USER_ID?: string };

async function failuresFor(ip: string, window: number) {
  const db = database();
  await db.prepare('CREATE TABLE IF NOT EXISTS login_attempts(ip TEXT NOT NULL, window INTEGER NOT NULL, failures INTEGER NOT NULL, PRIMARY KEY(ip, window))').run();
  return (await db.prepare('SELECT failures FROM login_attempts WHERE ip=? AND window=?').bind(ip, window).first<{ failures: number }>())?.failures ?? 0;
}

export async function POST(request: Request) {
  const settings = env as unknown as Settings;
  const { DASHBOARD_PASSWORD_HASH: hash, SESSION_SECRET: secret, DASHBOARD_OWNER_EMAIL: email, OWNER_USER_ID: userId } = settings;
  if (!hash || !secret || !email || !userId) return new Response('Login is not configured.', { status: 503 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const returnTo = safeReturnPath(String(form.get('return_to') ?? ''));
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const window = Math.floor(Date.now() / WINDOW_MS);
  const retry = (error: string) => new Response(null, { status: 303, headers: { location: `/login?error=${error}&return_to=${encodeURIComponent(returnTo)}` } });

  if (await failuresFor(ip, window) >= MAX_FAILURES) return retry('locked');
  if (!await verifyPassword(String(form.get('password') ?? ''), hash)) {
    await database().prepare('INSERT INTO login_attempts(ip,window,failures) VALUES (?,?,1) ON CONFLICT(ip,window) DO UPDATE SET failures=failures+1').bind(ip, window).run();
    await database().prepare('DELETE FROM login_attempts WHERE window<?').bind(window - 1).run();
    return retry('invalid');
  }

  const token = await signSession({ userId, email }, secret);
  return new Response(null, {
    status: 303,
    headers: { location: returnTo, 'set-cookie': sessionCookie(token, new URL(request.url).protocol === 'https:'), 'cache-control': 'no-store' },
  });
}
