import { env } from 'cloudflare:workers';
import { createTursoDatabase } from './turso';

// The app stores everything in Turso (libSQL) when TURSO_DATABASE_URL and
// TURSO_AUTH_TOKEN are set, and in the Cloudflare D1 binding otherwise.
let cached: { key: string; db: D1Database } | undefined;
// Returns undefined when no database is configured; callers keep their existing `if(!appDb())` guards.
export function appDb(): D1Database {
  const config = env as unknown as Record<string, string | undefined>, url = config.TURSO_DATABASE_URL?.trim(), token = config.TURSO_AUTH_TOKEN?.trim();
  if (url && token) {
    const key = `${url}|${token}`;
    if (cached?.key !== key) cached = { key, db: createTursoDatabase({ url, token }) };
    return cached.db;
  }
  return env.DB as D1Database;
}
