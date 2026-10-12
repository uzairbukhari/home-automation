import { getOwnerUser } from '@/lib/owner-auth';
import { database } from '@/lib/jobs';

// Owner-only full-database export as a SQL file of INSERT statements.
// Used once to move the data to a database you control: apply the migrations in
// ./drizzle to the new database, then run this file against it.
// provider_credentials is left out on purpose: those rows are encrypted with a
// key that stays with the old host, so re-enter the provider logins instead.
const SKIP = new Set(['provider_credentials', 'd1_migrations']);
const PAGE = 500;

const quote = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || Array.isArray(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
      : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : Uint8Array.from(value as number[]);
    return `X'${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

export async function GET() {
  if (!await getOwnerUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = database();
  const tables = (await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name"
  ).all<{ name: string }>()).results.map(t => t.name).filter(name => !SKIP.has(name));

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        write(`-- Home dashboard export ${new Date().toISOString()}\n`);
        for (const table of tables) {
          write(`-- ${table}\n`);
          let last = -1;
          for (;;) {
            const rows = (await db.prepare(`SELECT rowid AS __rid, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`)
              .bind(last).all<Record<string, unknown>>()).results;
            for (const { __rid, ...row } of rows) {
              const columns = Object.keys(row);
              write(`INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(c => quote(row[c])).join(',')});\n`);
              last = Number(__rid);
            }
            if (rows.length < PAGE) break;
          }
        }
        write('-- end of export\n');
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'application/sql; charset=utf-8',
      'content-disposition': `attachment; filename="home-dashboard-export-${new Date().toISOString().slice(0, 10)}.sql"`,
      'cache-control': 'private, no-store',
    },
  });
}
