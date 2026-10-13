import { env } from 'cloudflare:workers';
import { connectWorkerSocket, createTursoDatabase } from './turso';

// The app stores everything in Turso (libSQL) when TURSO_DATABASE_URL and
// TURSO_AUTH_TOKEN are set, and in the Cloudflare D1 binding otherwise.
let cached: { key: string; db: D1Database } | undefined;
// Returns undefined when no database is configured; callers keep their existing `if(!appDb())` guards.
export function appDb(): D1Database {
  const config = env as unknown as Record<string, string | undefined>, url = config.TURSO_DATABASE_URL?.trim(), token = config.TURSO_AUTH_TOKEN?.trim();
  if (url && token) {
    const key = `${url}|${token}`;
    if (cached?.key !== key) cached = { key, db: createTursoDatabase({ url, token, connect: config.TURSO_TRANSPORT === 'http' ? undefined : connectWorkerSocket }) };
    return cached.db;
  }
  return env.DB as D1Database;
}

export function dbDiagnostics() {
  const db = appDb() as unknown as { diagnostics?: () => unknown } | undefined;
  return db?.diagnostics ? { backend: 'turso', ...(db.diagnostics() as object) } : { backend: db ? 'd1' : 'none' };
}
