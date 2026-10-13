import { env } from '@/lib/env';
import { sameOrigin } from '@/lib/owner-auth';
import { loginLocked, recordLoginFailure } from '@/lib/login-throttle';
import { safeReturnPath, sessionCookie, signSession, verifyPassword } from '@/lib/session';

type Settings = { DASHBOARD_PASSWORD_HASH?: string; SESSION_SECRET?: string; DASHBOARD_OWNER_EMAIL?: string; OWNER_USER_ID?: string };

export async function POST(request: Request) {
  const settings = env as unknown as Settings;
  const { DASHBOARD_PASSWORD_HASH: hash, SESSION_SECRET: secret, DASHBOARD_OWNER_EMAIL: email, OWNER_USER_ID: userId } = settings;
  if (!hash || !secret || !email || !userId) return new Response('Login is not configured.', { status: 503 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const returnTo = safeReturnPath(String(form.get('return_to') ?? ''));
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const retry = (error: string) => new Response(null, { status: 303, headers: { location: `/login?error=${error}&return_to=${encodeURIComponent(returnTo)}` } });

  if (await loginLocked(ip)) return retry('locked');
  if (!await verifyPassword(String(form.get('password') ?? ''), hash)) {
    await recordLoginFailure(ip);
    return retry('invalid');
  }

  const token = await signSession({ userId, email }, secret);
  return new Response(null, {
    status: 303,
    headers: { location: returnTo, 'set-cookie': sessionCookie(token, new URL(request.url).protocol === 'https:'), 'cache-control': 'no-store' },
  });
}
