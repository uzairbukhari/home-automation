// Minimal SQLite-style client for Turso (libSQL) over its Hrana protocol.
// It implements only what the app uses from Db (prepare/bind/first/all/run/batch). No dependencies: it only needs fetch.
//
// Transport: plain HTTP (/v2/pipeline), one request per statement or batch. Turso's cloud does not accept
// WebSockets. Each call is an outbound fetch, so run it on a host without a small per-request subrequest cap
// (Vercel).

type HranaValue = { type: 'null' } | { type: 'integer'; value: string } | { type: 'float'; value: number } | { type: 'text'; value: string } | { type: 'blob'; base64: string };
type HranaResult = { cols: Array<{ name: string }>; rows: HranaValue[][]; affected_row_count: number; last_insert_rowid: string | null; rows_read?: number; rows_written?: number };
type HranaError = { message: string; code?: string };
type HranaStmt = { sql: string; args?: HranaValue[]; want_rows?: boolean };
type HranaRequest = { type: 'execute'; stmt: HranaStmt } | { type: 'batch'; batch: { steps: unknown[] } };
type BatchResult = { step_results: Array<HranaResult | null>; step_errors: Array<HranaError | null> };

export type TursoConfig = { url: string; token: string; fetch?: typeof fetch };

const toBase64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const fromBase64 = (text: string) => { const s = atob(text), bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); return bytes.buffer; };

export function encodeArg(value: unknown): HranaValue {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  if (typeof value === 'bigint') return { type: 'integer', value: value.toString() };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { type: 'integer', value: String(value) } : Number.isFinite(value) ? { type: 'float', value } : { type: 'null' };
  if (value instanceof ArrayBuffer) return { type: 'blob', base64: toBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { type: 'blob', base64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  return { type: 'text', value: String(value) };
}
export function decodeValue(value: HranaValue): unknown {
  switch (value.type) {
    case 'null': return null;
    case 'integer': return Number(value.value);
    case 'float': return value.value;
    case 'blob': return fromBase64(value.base64);
    default: return value.value;
  }
}
function rowsOf(result: HranaResult) {
  const names = result.cols.map(c => c.name);
  return result.rows.map(row => { const out: Record<string, unknown> = {}; row.forEach((cell, i) => { out[names[i]] = decodeValue(cell); }); return out; });
}
const metaOf = (result: HranaResult) => ({ changes: result.affected_row_count ?? 0, last_row_id: result.last_insert_rowid === null || result.last_insert_rowid === undefined ? 0 : Number(result.last_insert_rowid), rows_written: result.affected_row_count ?? 0, duration: 0 });
const wrap = (result: HranaResult) => ({ success: true as const, results: rowsOf(result), meta: metaOf(result) });

const REQUEST_TIMEOUT_MS = 25_000;

// Turso answers every query with a BLOCKED error once the plan's monthly quota is used up.
const blocked = (code: unknown, message: string) => /blocked/i.test(String(code ?? '')) || /\bblocked\b/i.test(message);
export const isDatabaseBlocked = (error: unknown) => Boolean((error as { blocked?: boolean })?.blocked) || (error instanceof Error && /\bblocked\b/i.test(error.message));

export function createTursoDatabase(config: TursoConfig): Db {
  const base = config.url.replace(/^libsql:\/\//, 'https://').replace(/^wss?:\/\//, 'https://').replace(/\/+$/, '');
  const doFetch = config.fetch ?? fetch;
  // Visible through /api/admin/collect-debug so the database traffic of a run can be inspected.
  // rowsRead / rowsWritten are the figures Turso bills: it reports them with every result.
  const stats = { httpRequests: 0, totalMs: 0, rowsRead: 0, rowsWritten: 0 };
  const count = (result: HranaResult | null | undefined) => { stats.rowsRead += result?.rows_read ?? 0; stats.rowsWritten += result?.rows_written ?? 0; };

  // Cumulative wall-clock time spent inside send() (retries included); concurrent calls overlap, so it can exceed elapsed time.
  async function send(request: HranaRequest): Promise<unknown> {
    stats.httpRequests++;
    const started = Date.now();
    try { return await sendOnce(request); } finally { stats.totalMs += Date.now() - started; }
  }
  async function sendOnce(request: HranaRequest): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await doFetch(`${base}/v2/pipeline`, {
          method: 'POST',
          headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ requests: [request, { type: 'close' }] }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.status >= 500 || response.status === 429) lastError = new Error(`Turso HTTP ${response.status}`);
        else if (!response.ok) { const text = (await response.text()).slice(0, 200); throw Object.assign(new Error(`Turso HTTP ${response.status}: ${text}`), { final: true, blocked: blocked(response.status, text) }); }
        else {
          const [first] = (await response.json() as { results: Array<{ type: 'ok'; response: { result: unknown } } | { type: 'error'; error: HranaError }> }).results;
          if (first.type === 'error') throw Object.assign(new Error(first.error.message), { final: true, blocked: blocked(first.error.code, first.error.message) });
          const result = first.response.result as HranaResult | BatchResult;
          if ('step_results' in result) result.step_results.forEach(count); else count(result);
          return result;
        }
      } catch (error) {
        if ((error as { final?: boolean }).final) throw error;
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
    throw lastError instanceof Error ? lastError : new Error('Turso request failed');
  }

  class Statement {
    constructor(readonly sql: string, readonly args: unknown[] = []) {}
    bind(...values: unknown[]) { return new Statement(this.sql, values) as unknown as DbStatement; }
    stmt(): HranaStmt { return { sql: this.sql, args: this.args.map(encodeArg), want_rows: true }; }
    private async execute() { return await send({ type: 'execute', stmt: this.stmt() }) as HranaResult; }
    async run() { return wrap(await this.execute()); }
    async all() { return wrap(await this.execute()); }
    async first(column?: string) { const rows = rowsOf(await this.execute()); const row = rows[0]; if (!row) return null; return column ? row[column] ?? null : row; }
    async raw() { return (await this.execute()).rows.map(row => row.map(decodeValue)); }
  }

  const database = {
    prepare: (sql: string) => new Statement(sql) as unknown as DbStatement,
    // A batch is one transaction: all statements apply or none do.
    async batch(statements: DbStatement[]) {
      if (!statements.length) return [];
      const items = statements as unknown as Statement[], n = items.length;
      const steps: unknown[] = [{ stmt: { sql: 'BEGIN' } }];
      items.forEach((item, i) => steps.push({ stmt: item.stmt(), condition: { type: 'ok', step: i } }));
      steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: n } });
      steps.push({ stmt: { sql: 'ROLLBACK' }, condition: { type: 'not', cond: { type: 'ok', step: n + 1 } } });
      const { step_results, step_errors } = await send({ type: 'batch', batch: { steps } }) as BatchResult;
      const failed = step_errors.find((error, i) => error && i <= n + 1);
      if (failed) throw new Error(failed.message);
      return step_results.slice(1, n + 1).map(result => { if (!result) throw new Error('Turso batch step did not run'); return wrap(result); });
    },
    diagnostics: () => ({ ...stats }),
    async exec(sql: string) { await (new Statement(sql) as unknown as { run(): Promise<unknown> }).run(); return { count: 1, duration: 0 }; },
  };
  return database as unknown as Db;
}
