import { env } from '@/lib/env';
import { createTursoDatabase } from './turso';
import { wrapD1, type D1Binding } from './d1';

// The app stores everything in one database: a Cloudflare D1 binding when it runs as a Worker (the Worker entry in
// cloudflare/handler.mjs hands the binding over), otherwise Turso (libSQL), configured by TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
export const D1_BINDING = Symbol.for('home-automation.d1');
let cached: { key: string; db: Db } | undefined, cachedD1: { binding: D1Binding; db: Db } | undefined, injected: Db | undefined;
function d1(): Db | undefined {
  const binding = (globalThis as Record<symbol, unknown>)[D1_BINDING] as D1Binding | undefined;
  if (!binding) return undefined;
  if (cachedD1?.binding !== binding) cachedD1 = { binding, db: wrapD1(binding) };
  return cachedD1.db;
}
// Tests supply their own database; pass undefined to go back to Turso.
export function setTestDatabase(db: Db | undefined) { injected = db; }
// Returns undefined when no database is configured; callers keep their `if(!appDb())` guards.
export function appDb(): Db {
  if (injected) return injected;
  const bound = d1(); if (bound) return bound;
  const url = env.TURSO_DATABASE_URL?.trim(), token = env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !token) return undefined as unknown as Db;
  const key = `${url}|${token}`;
  if (cached?.key !== key) cached = { key, db: createTursoDatabase({ url, token }) };
  return cached.db;
}

export function dbDiagnostics() {
  const db = appDb() as unknown as { diagnostics?: () => unknown } | undefined;
  return db?.diagnostics ? { backend: d1() ? 'd1' : 'turso', ...(db.diagnostics() as object) } : { backend: db ? 'custom' : 'none' };
}
