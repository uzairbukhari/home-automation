// Deploy-time helper for the Turso database (used by .github/workflows/deploy.yml).
//   node scripts/turso.mjs migrate            apply ./drizzle/*.sql that have not run yet
//   node scripts/turso.mjs import <file.sql>  one-time copy of a D1 export (INSERT lines only), skipped once done
//   node scripts/turso.mjs query "<sql>"      print the rows of a statement as JSON
//   node scripts/turso.mjs exec "<sql>"       run a statement
// Needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment.
import { readFileSync, readdirSync } from 'node:fs';

const url = (process.env.TURSO_DATABASE_URL ?? '').trim().replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
const token = (process.env.TURSO_AUTH_TOKEN ?? '').trim();
if (!url || !token) { console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.'); process.exit(1); }

const arg = value => value === null || value === undefined ? { type: 'null' } : typeof value === 'number' ? { type: 'integer', value: String(value) } : { type: 'text', value: String(value) };
async function pipeline(requests) {
  const response = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  });
  if (!response.ok) throw new Error(`Turso HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()).results;
}
async function run(sql, args = []) {
  const [first] = await pipeline([{ type: 'execute', stmt: { sql, args: args.map(arg), want_rows: true } }]);
  if (first.type === 'error') throw new Error(`${first.error.message}\n  in: ${sql.slice(0, 200)}`);
  const { cols, rows } = first.response.result;
  return rows.map(row => Object.fromEntries(row.map((cell, i) => [cols[i].name, cell.type === 'null' ? null : cell.type === 'integer' ? Number(cell.value) : cell.value])));
}
// Statements run in one transaction; a failure rolls the whole group back.
async function transaction(sqls) {
  const steps = [{ stmt: { sql: 'BEGIN' } }];
  sqls.forEach((sql, i) => steps.push({ stmt: { sql }, condition: { type: 'ok', step: i } }));
  steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: sqls.length } });
  steps.push({ stmt: { sql: 'ROLLBACK' }, condition: { type: 'not', cond: { type: 'ok', step: sqls.length + 1 } } });
  const [first] = await pipeline([{ type: 'batch', batch: { steps } }]);
  if (first.type === 'error') throw new Error(first.error.message);
  const failed = first.response.result.step_errors.find(Boolean);
  if (failed) throw new Error(failed.message);
}

async function migrate() {
  await run('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((await run('SELECT name FROM _migrations')).map(row => row.name));
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const statements = readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await transaction([...statements, `INSERT INTO _migrations(name, applied_at) VALUES ('${file}', '${new Date().toISOString()}')`]);
    console.log(`applied ${file}`);
  }
  // The Android signing key lives in the same database; this table is created outside the migrations.
  await run('CREATE TABLE IF NOT EXISTS app_signing (id INTEGER PRIMARY KEY CHECK (id = 1), keystore TEXT NOT NULL, password TEXT NOT NULL)');
  console.log('migrations up to date');
}

// `wrangler d1 export --no-schema` writes one INSERT per line. Rows are applied with OR IGNORE,
// so running this again can only add rows that are missing, never overwrite newer ones.
async function importExport(file) {
  await run('CREATE TABLE IF NOT EXISTS _import_log (name TEXT PRIMARY KEY, finished_at TEXT NOT NULL, statements INTEGER NOT NULL)');
  if ((await run("SELECT name FROM _import_log WHERE name = 'd1'")).length) { console.log('D1 data was already copied; skipping.'); return; }
  const skip = /^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+"?(?:d1_migrations|_cf_\w+|_migrations|_import_log|sqlite_\w+)"?/i;
  const inserts = readFileSync(file, 'utf8').split('\n').filter(line => /^INSERT\s/i.test(line) && !skip.test(line))
    .map(line => line.replace(/^INSERT\s+(?:OR\s+\w+\s+)?INTO/i, 'INSERT OR IGNORE INTO').replace(/;\s*$/, ''));
  console.log(`copying ${inserts.length} rows from D1`);
  for (let i = 0; i < inserts.length; i += 200) {
    await transaction(inserts.slice(i, i + 200));
    if ((i / 200) % 25 === 0) console.log(`  ${Math.min(i + 200, inserts.length)} / ${inserts.length}`);
  }
  await run("INSERT INTO _import_log(name, finished_at, statements) VALUES ('d1', ?, ?)", [new Date().toISOString(), inserts.length]);
  console.log('copy finished');
}

const [command, value] = process.argv.slice(2);
try {
  if (command === 'migrate') await migrate();
  else if (command === 'import') await importExport(value);
  else if (command === 'query') console.log(JSON.stringify(await run(value)));
  else if (command === 'exec') await run(value);
  else { console.error('usage: turso.mjs migrate | import <file> | query <sql> | exec <sql>'); process.exit(2); }
} catch (error) { console.error(error.message); process.exit(1); }
