// Wraps a Cloudflare D1 binding as the app's Db and adds up the rows D1 reports reading and writing,
// so the usage figures (Settings > Storage) work the same as they do on Turso.

interface D1Meta { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number; duration?: number }
interface D1Result { success?: boolean; results?: unknown[]; meta?: D1Meta }
export interface D1Statement { bind(...values: unknown[]): D1Statement; all(): Promise<D1Result>; run(): Promise<D1Result>; raw(): Promise<unknown[][]> }
export interface D1Binding { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result[]>; exec(sql: string): Promise<{ count: number; duration: number }> }

export function wrapD1(binding: D1Binding): Db {
  const stats = { rowsRead: 0, rowsWritten: 0 };
  const count = (result: D1Result) => { stats.rowsRead += result.meta?.rows_read ?? 0; stats.rowsWritten += result.meta?.rows_written ?? 0; return result; };
  const shape = (result: D1Result) => ({ success: true as const, results: (result.results ?? []) as Record<string, unknown>[], meta: { changes: result.meta?.changes ?? 0, last_row_id: result.meta?.last_row_id ?? 0, rows_written: result.meta?.rows_written ?? 0, duration: result.meta?.duration ?? 0 } });

  class Statement {
    constructor(readonly inner: D1Statement) {}
    bind(...values: unknown[]) { return new Statement(this.inner.bind(...values)) as unknown as DbStatement; }
    async run() { return shape(count(await this.inner.run())); }
    async all() { return shape(count(await this.inner.all())); }
    // Goes through all() so the rows scanned are counted: D1's first() returns the row without its meta.
    async first(column?: string) { const row = (await this.all()).results[0]; if (!row) return null; return column ? row[column] ?? null : row; }
    async raw() { return await this.inner.raw(); }
  }
  const database = {
    prepare: (sql: string) => new Statement(binding.prepare(sql)) as unknown as DbStatement,
    // D1 runs a batch as one transaction, like the Turso client.
    async batch(statements: DbStatement[]) {
      if (!statements.length) return [];
      return (await binding.batch(statements.map(statement => (statement as unknown as Statement).inner))).map(result => shape(count(result)));
    },
    async exec(sql: string) { return await binding.exec(sql); },
    diagnostics: () => ({ ...stats }),
  };
  return database as unknown as Db;
}
