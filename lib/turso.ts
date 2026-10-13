// Minimal D1-compatible client for Turso (libSQL) over its Hrana protocol.
// It implements only what the app uses from D1Database (prepare/bind/first/all/run/batch),
// so every existing query keeps working unchanged. No dependencies: it only needs fetch.
//
// Why a WebSocket: on the Workers free plan a request may make at most 50 outbound fetch()
// subrequests, and one collection run issues well over 100 queries. D1 bindings do not count
// against that limit, but an HTTP call to Turso does. So the client opens ONE WebSocket per
// busy period and sends every query over it (an upgrade is a single subrequest). If the
// WebSocket cannot be used it falls back to plain HTTP requests.

type HranaValue = { type: 'null' } | { type: 'integer'; value: string } | { type: 'float'; value: number } | { type: 'text'; value: string } | { type: 'blob'; base64: string };
type HranaResult = { cols: Array<{ name: string }>; rows: HranaValue[][]; affected_row_count: number; last_insert_rowid: string | null };
type HranaError = { message: string; code?: string };
type HranaStmt = { sql: string; args?: HranaValue[]; want_rows?: boolean };
type HranaRequest = { type: 'execute'; stmt: HranaStmt } | { type: 'batch'; batch: { steps: unknown[] } };
type BatchResult = { step_results: Array<HranaResult | null>; step_errors: Array<HranaError | null> };

export type SocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message' | 'close' | 'error', listener: (event: { data?: unknown }) => void): void;
};
export type TursoConfig = {
  url: string;
  token: string;
  fetch?: typeof fetch;
  // Opens a WebSocket to the given wss:// URL. Omit to use plain HTTP.
  connect?: (url: string) => Promise<SocketLike>;
  // A connection unused for this long is replaced, so one connection never outlives the request that opened it.
  idleMs?: number;
};

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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

const REQUEST_TIMEOUT_MS = 25_000, READY_TIMEOUT_MS = 8_000, WS_COOLDOWN_MS = 60_000;

// One WebSocket speaking Hrana 3 (JSON) with a single stream, so statements run in the order they are sent.
class SocketConnection {
  private nextId = 1;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  closed = false;
  lastUsed = Date.now();
  ready: Promise<void>;
  constructor(private socket: SocketLike, token: string) {
    socket.addEventListener('message', event => this.onMessage(event.data));
    socket.addEventListener('close', () => this.fail(new Error('Turso connection closed')));
    socket.addEventListener('error', () => this.fail(new Error('Turso connection error')));
    socket.send(JSON.stringify({ type: 'hello', jwt: token }));
    this.ready = this.send({ type: 'open_stream', stream_id: 1 }, READY_TIMEOUT_MS).then(() => undefined);
    this.ready.catch(() => undefined);
  }
  private onMessage(data: unknown) {
    if (typeof data !== 'string') return;
    let message: { type: string; request_id?: number; response?: unknown; error?: HranaError };
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'hello_error') return this.fail(new Error(message.error?.message ?? 'Turso rejected the connection'));
    const entry = message.request_id === undefined ? undefined : this.pending.get(message.request_id);
    if (!entry || message.request_id === undefined) return;
    this.pending.delete(message.request_id);
    if (message.type === 'response_ok') entry.resolve(message.response);
    else entry.reject(new Error(message.error?.message ?? 'Turso request failed'));
  }
  private fail(error: Error) {
    this.closed = true;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
  private send(request: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise<unknown>((resolve, reject) => {
      if (this.closed) { reject(Object.assign(new Error('Turso connection closed'), { notSent: true })); return; }
      const id = this.nextId++, timer = setTimeout(() => { this.pending.delete(id); this.close(); reject(new Error('Turso request timed out')); }, timeoutMs);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      try { this.socket.send(JSON.stringify({ type: 'request', request_id: id, request })); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); this.closed = true; reject(Object.assign(error instanceof Error ? error : new Error(String(error)), { notSent: true })); }
    });
  }
  async request(request: HranaRequest) {
    this.lastUsed = Date.now();
    const response = await this.send({ ...request, stream_id: 1 }) as { result: unknown };
    this.lastUsed = Date.now();
    return response.result;
  }
  close() { this.closed = true; try { this.socket.close(1000, 'idle'); } catch { /* already closed */ } }
}

export function createTursoDatabase(config: TursoConfig): D1Database {
  const base = config.url.replace(/^libsql:\/\//, 'https://').replace(/^wss?:\/\//, 'https://').replace(/\/+$/, '');
  const doFetch = config.fetch ?? fetch, idleMs = config.idleMs ?? 4000;
  let connection: SocketConnection | undefined, socketsBlockedUntil = 0;
  // Visible through /api/admin/collect-debug so a failing transport can be diagnosed without Worker logs.
  const stats = { socketsOpened: 0, socketFailures: 0, httpRequests: 0, lastSocketError: null as string | null, lastRequestError: null as string | null };

  async function viaHttp(request: HranaRequest): Promise<unknown> {
    stats.httpRequests++;
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
        else if (!response.ok) throw Object.assign(new Error(`Turso HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`), { final: true });
        else {
          const [first] = (await response.json() as { results: Array<{ type: 'ok'; response: { result: unknown } } | { type: 'error'; error: HranaError }> }).results;
          if (first.type === 'error') throw Object.assign(new Error(first.error.message), { final: true });
          return first.response.result;
        }
      } catch (error) {
        if ((error as { final?: boolean }).final) throw error;
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
    throw lastError instanceof Error ? lastError : new Error('Turso request failed');
  }

  async function socket(): Promise<SocketConnection | undefined> {
    if (!config.connect || Date.now() < socketsBlockedUntil) return undefined;
    if (connection && (connection.closed || Date.now() - connection.lastUsed > idleMs)) { connection.close(); connection = undefined; }
    if (connection) return connection;
    // Not shared between callers: a connection attempt must never be awaited from a different request.
    try {
      const next = new SocketConnection(await withTimeout(config.connect(base.replace(/^https:/, 'wss:')), READY_TIMEOUT_MS, 'Turso WebSocket connect timed out'), config.token);
      try { await next.ready; } catch (error) { next.close(); throw error; }
      stats.socketsOpened++;
      connection = next;
      return next;
    } catch (error) {
      stats.socketFailures++;
      stats.lastSocketError = error instanceof Error ? error.message : String(error);
      socketsBlockedUntil = Date.now() + WS_COOLDOWN_MS;
      return undefined;
    }
  }

  async function send(request: HranaRequest): Promise<unknown> {
    const ws = await socket();
    if (!ws) return viaHttp(request);
    try { return await ws.request(request); }
    catch (error) {
      stats.lastRequestError = error instanceof Error ? error.message : String(error);
      // Only a request that never left this process is safe to repeat on another transport.
      if ((error as { notSent?: boolean }).notSent) { connection = undefined; return viaHttp(request); }
      throw error;
    }
  }

  class Statement {
    constructor(readonly sql: string, readonly args: unknown[] = []) {}
    bind(...values: unknown[]) { return new Statement(this.sql, values) as unknown as D1PreparedStatement; }
    stmt(): HranaStmt { return { sql: this.sql, args: this.args.map(encodeArg), want_rows: true }; }
    private async execute() { return await send({ type: 'execute', stmt: this.stmt() }) as HranaResult; }
    async run() { return wrap(await this.execute()); }
    async all() { return wrap(await this.execute()); }
    async first(column?: string) { const rows = rowsOf(await this.execute()); const row = rows[0]; if (!row) return null; return column ? row[column] ?? null : row; }
    async raw() { return (await this.execute()).rows.map(row => row.map(decodeValue)); }
  }

  const database = {
    prepare: (sql: string) => new Statement(sql) as unknown as D1PreparedStatement,
    // Like D1, a batch is one transaction: all statements apply or none do.
    async batch(statements: D1PreparedStatement[]) {
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
    diagnostics: () => ({ ...stats, socketsBlockedForMs: Math.max(0, socketsBlockedUntil - Date.now()) }),
    async exec(sql: string) { await (new Statement(sql) as unknown as { run(): Promise<unknown> }).run(); return { count: 1, duration: 0 }; },
  };
  return database as unknown as D1Database;
}

// Opens a WebSocket from inside a Worker (an upgrade request is a single subrequest).
export async function connectWorkerSocket(url: string): Promise<SocketLike> {
  const response = await fetch(url.replace(/^wss:/, 'https:'), { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'hrana3' } });
  const socket = (response as unknown as { webSocket?: SocketLike & { accept(): void } }).webSocket;
  if (!socket) throw new Error(`Turso did not accept the WebSocket upgrade (HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)})`);
  socket.accept();
  return socket;
}
