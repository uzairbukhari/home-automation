import { env } from '@/lib/env';
import { createTursoDatabase } from './turso';

// The app stores everything in Turso (libSQL), configured by TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
let cached: { key: string; db: Db } | undefined, injected: Db | undefined;
// Tests supply their own database; pass undefined to go back to Turso.
export function setTestDatabase(db: Db | undefined) { injected = db; }
// Returns undefined when no database is configured; callers keep their `if(!appDb())` guards.
export function appDb(): Db {
  if (injected) return injected;
  const url = env.TURSO_DATABASE_URL?.trim(), token = env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !token) return undefined as unknown as Db;
  const key = `${url}|${token}`;
  if (cached?.key !== key) cached = { key, db: createTursoDatabase({ url, token }) };
  return cached.db;
}

export function dbDiagnostics() {
  const db = appDb() as unknown as { diagnostics?: () => unknown } | undefined;
  return db?.diagnostics ? { backend: 'turso', ...(db.diagnostics() as object) } : { backend: db ? 'custom' : 'none' };
}
