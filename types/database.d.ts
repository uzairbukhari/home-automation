// The small slice of a SQLite-style database API the app uses (prepare/bind/first/all/run/raw, batch, exec).
// lib/turso.ts implements it over Turso; tests implement it over node:sqlite.
interface DbMeta { changes: number; last_row_id: number; rows_written: number; duration: number }
interface DbResult<T = Record<string, unknown>> { success: true; results: T[]; meta: DbMeta }
interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  first<T = unknown>(column: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  run<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}
interface Db {
  prepare(sql: string): DbStatement;
  batch<T = Record<string, unknown>>(statements: DbStatement[]): Promise<DbResult<T>[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
}
