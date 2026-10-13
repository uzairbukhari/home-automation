// Deploy-time helper for the Turso database (used by the Vercel build and .github/workflows/android-release.yml).
//   node scripts/turso.mjs migrate            apply ./drizzle/*.sql that have not run yet
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

const [command, value] = process.argv.slice(2);
try {
  if (command === 'migrate') await migrate();
  else if (command === 'query') console.log(JSON.stringify(await run(value)));
  else if (command === 'exec') await run(value);
  else { console.error('usage: turso.mjs migrate | query <sql> | exec <sql>'); process.exit(2); }
} catch (error) { console.error(error.message); process.exit(1); }
