import { env } from 'cloudflare:workers';
import { loginLocked, recordLoginFailure } from '@/lib/login-throttle';
import { SESSION_DAYS, signSession, verifyPassword } from '@/lib/session';

type Settings = { DASHBOARD_PASSWORD_HASH?: string; SESSION_SECRET?: string; DASHBOARD_OWNER_EMAIL?: string; OWNER_USER_ID?: string };
const headers = { 'cache-control': 'no-store' };

// Native app sign-in: same owner password and lockout as the website, but returns the
// signed session as a bearer token for the app to keep in encrypted storage.
export async function POST(request: Request) {
  const { DASHBOARD_PASSWORD_HASH: hash, SESSION_SECRET: secret, DASHBOARD_OWNER_EMAIL: email, OWNER_USER_ID: userId } = env as unknown as Settings;
  if (!hash || !secret || !email || !userId) return Response.json({ error: 'Login is not configured.' }, { status: 503, headers });

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (await loginLocked(ip)) return Response.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429, headers });

  let password = '';
  try { password = String(((await request.json()) as { password?: unknown }).password ?? ''); } catch { /* treated as a wrong password */ }
  if (!await verifyPassword(password, hash)) {
    await recordLoginFailure(ip);
    return Response.json({ error: 'Wrong password.' }, { status: 401, headers });
  }
  return Response.json({ token: await signSession({ userId, email }, secret), expiresInDays: SESSION_DAYS }, { headers });
}
