// Owner login: a password checked against a PBKDF2 hash, then a signed cookie.
// Pure Web Crypto so it runs in Workers and in tests; no framework imports.
export const SESSION_COOKIE = 'home_session';
export const SESSION_DAYS = 30;
const PBKDF2_PREFIX = 'pbkdf2-sha256';

const encoder = new TextEncoder();
const toHex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], b => parseInt(b, 16));
const toBase64Url = (text: string) => btoa(String.fromCharCode(...encoder.encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

export type SessionUser = { userId: string; email: string };

async function hmacKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

export async function signSession(user: SessionUser, secret: string, now = Date.now()): Promise<string> {
  const payload = toBase64Url(JSON.stringify({ uid: user.userId, email: user.email, exp: now + SESSION_DAYS * 86_400_000 }));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

export async function verifySession(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<SessionUser | null> {
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined || !/^[0-9a-f]+$/.test(signature) || signature.length % 2) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), fromHex(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(fromBase64Url(payload));
    if (typeof data.uid !== 'string' || typeof data.email !== 'string' || typeof data.exp !== 'number' || data.exp <= now) return null;
    return { userId: data.uid, email: data.email };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

// The native app sends its signed session as "Authorization: Bearer <token>".
export function bearerToken(header: string | null | undefined): string | undefined {
  const match = /^Bearer ([^\s]+)$/i.exec((header ?? '').trim());
  return match?.[1];
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure ? '; Secure' : ''}`;
}

export const clearedSessionCookie = (secure: boolean) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

// Workers cap PBKDF2 at 100000 iterations, so that is the iteration count used.
export async function hashPassword(password: string, iterations = 100_000, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `${PBKDF2_PREFIX}$${iterations}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [prefix, rounds, salt, hash] = (stored ?? '').split('$');
  const iterations = Number(rounds);
  if (prefix !== PBKDF2_PREFIX || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false;
  const actual = (await hashPassword(password, iterations, fromHex(salt))).split('$')[3];
  let difference = actual.length ^ hash.length;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  return difference === 0;
}

// Only same-site relative paths are allowed as a post-login destination.
const RESERVED_PATHS = new Set(['/login', '/logout']);
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local' || RESERVED_PATHS.has(url.pathname) || url.pathname.startsWith('/api/auth/')) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
