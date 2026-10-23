/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {createTursoDatabase,isDatabaseBlocked}=require('../lib/turso.ts');
const {recordUsage,usageSummary}=require('../lib/usage.ts');

const reply=(result)=>async()=>({ok:true,status:200,json:async()=>({results:[{type:'ok',response:{type:'execute',result}},{type:'ok',response:{type:'close'}}]}),text:async()=>''});

test('The Turso client adds up the rows Turso reports reading and writing',async()=>{
  const db=createTursoDatabase({url:'libsql://x.turso.io',token:'t',fetch:reply({cols:[],rows:[],affected_row_count:1,last_insert_rowid:null,rows_read:120,rows_written:3})});
  await db.prepare('SELECT 1').all();await db.prepare('SELECT 2').all();
  const {rowsRead,rowsWritten}=db.diagnostics();assert.equal(rowsRead,240);assert.equal(rowsWritten,6);
});

test('A blocked database is recognised from the HTTP error and the pipeline error',async()=>{
  const http=createTursoDatabase({url:'libsql://x.turso.io',token:'t',fetch:async()=>({ok:false,status:403,text:async()=>'{"error":"Database is BLOCKED: monthly row reads exceeded"}'})});
  await assert.rejects(http.prepare('SELECT 1').all(),e=>isDatabaseBlocked(e));
  const pipe=createTursoDatabase({url:'libsql://x.turso.io',token:'t',fetch:async()=>({ok:true,status:200,json:async()=>({results:[{type:'error',error:{message:'quota',code:'BLOCKED'}}]}),text:async()=>''})});
  await assert.rejects(pipe.prepare('SELECT 1').all(),e=>isDatabaseBlocked(e));
  assert.equal(isDatabaseBlocked(new Error('SQLITE_BUSY')),false);
});

test('Daily usage rows accumulate per job',async()=>{
  database();
  await recordUsage('collection',1000,10);await recordUsage('collection',500,5);await recordUsage('maintenance',200,0);
  const rows=await usageSummary(1),by=Object.fromEntries(rows.map(r=>[r.job,r]));
  assert.deepEqual([by.collection.read,by.collection.written,by.collection.runs],[1500,15,2]);assert.equal(by.maintenance.read,200);
});

test('The monthly Tuya call count runs once and is skipped while the budget row exists',async()=>{
  const {sqlite}=database(),{env}=require('./helpers.cjs'),{reserveProviderRequest}=require('../lib/provider-policy.ts');
  Object.assign(env,{TUYA_MONTHLY_ALLOWANCE:'26000',TUYA_ENTITLEMENT_EXPIRES:'2999-01-01'});
  const now=new Date('2026-10-15T10:00:00Z'),month='2026-10';
  sqlite.prepare("INSERT INTO provider_requests(provider,purpose,timestamp,status) VALUES ('tuya','poll',?,200)").run('2026-10-02T00:00:00.000Z');
  sqlite.prepare("INSERT INTO provider_requests(provider,purpose,timestamp,status) VALUES ('tuya','poll',?,200)").run('2026-09-30T23:59:59.000Z');
  await reserveProviderRequest('tuya','poll',now);
  assert.equal(sqlite.prepare('SELECT used FROM provider_budget WHERE period=?').get(month).used,2,'one earlier call this month plus this one; September is not counted');
  sqlite.prepare("INSERT INTO provider_requests(provider,purpose,timestamp,status) VALUES ('tuya','poll',?,200)").run('2026-10-03T00:00:00.000Z');
  await reserveProviderRequest('tuya','poll',now);
  assert.equal(sqlite.prepare('SELECT used FROM provider_budget WHERE period=?').get(month).used,3,'the stored counter is incremented, not recounted');
  for(const key of ['TUYA_MONTHLY_ALLOWANCE','TUYA_ENTITLEMENT_EXPIRES'])delete env[key];
});

test('Every runtime index statement is valid on the migrated schema and the 5-minute queries use them',async()=>{
  const {sqlite}=database(),{USAGE_INDEXES,ensureIndexes}=require('../lib/collection.ts');
  await ensureIndexes();await ensureIndexes();
  for(const sql of USAGE_INDEXES)assert.match(sql,/IF NOT EXISTS/);
  const plan=(sql)=>sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join(' | ');
  assert.match(plan("SELECT device_id,code FROM tuya_observations WHERE observed_at>='x'"),/SEARCH.*idx_tuya_obs_time/);
  assert.match(plan("SELECT 1 FROM tuya_collection_runs WHERE status='running' AND julianday(started_at)<1"),/idx_tuya_runs_status/);
  assert.match(plan("UPDATE automation_runs SET status='x' WHERE status IN ('pending','executing')"),/idx_runs_status/);
  assert.match(plan("DELETE FROM telemetry_summaries WHERE granularity='hour' AND period<'x'"),/idx_summaries_gran_period|idx_summaries_period/);
});

test('Day-stat backfill does not re-read a day it already found too sparse to store',async()=>{
  const {sqlite}=database(),{dayStatBackfillStep}=require('../lib/day-stats.ts'),{shiftDate,localDate}=require('../lib/measurements.ts');
  const day=shiftDate(localDate(),-3);
  sqlite.prepare("INSERT INTO solar_samples(entity_id,source_timestamp,data) VALUES ('inv',?,?)").run(new Date(`${day}T10:00:00+05:00`).toISOString(),JSON.stringify({sourceTimestamp:new Date(`${day}T10:00:00+05:00`).toISOString(),solar:100}));
  await dayStatBackfillStep('inv');
  const marker=sqlite.prepare("SELECT COUNT(*) n FROM operational_daily WHERE kind='daystat-skip:inv'").get().n;
  assert.ok(marker>=1,'a one-sample day is remembered as unstorable');
  const reads=[];const real=sqlite.prepare.bind(sqlite);sqlite.prepare=(sql)=>{reads.push(sql);return real(sql);};
  await dayStatBackfillStep('inv');sqlite.prepare=real;
  assert.equal(reads.filter(sql=>/FROM solar_samples WHERE entity_id=\? AND source_timestamp>=\?/.test(sql)).length,0,'the second run skips the remembered day');
});

test('Month projection sets the economy level and the alert steps',()=>{
  const {projectMonth}=require('../lib/usage.ts'),day=(d,h=12)=>Date.UTC(2026,9,d,h-5);
  assert.equal(projectMonth(10e6,day(11)).level,0,'10M after 10 days projects to ~31M');
  assert.equal(projectMonth(250e6,day(11)).level,3,'250M after 10 days projects to ~775M');
  assert.equal(projectMonth(150e6,day(11)).level,2,'150M after 10 days projects to ~440M, 89%');
});

test('Economy mode pauses imports at level 1, maintenance at 2 and everything but alerts at 3',async()=>{
  const {sqlite}=database(),{recordUsage,resetEconomyCache}=require('../lib/usage.ts'),{maintainCollection}=require('../lib/collection.ts');
  const jobs=()=>sqlite.prepare("SELECT id FROM app_jobs WHERE id IN ('history-unit','retention','actual-energy-repair')").all().map(r=>r.id).sort();
  const reset=()=>{sqlite.exec("DELETE FROM app_jobs");sqlite.exec("DELETE FROM operational_daily");resetEconomyCache();};
  Object.assign(require('./helpers.cjs').env,{VAPID_SUBJECT:'mailto:o@example.com',VAPID_PUBLIC_KEY:'pub',VAPID_PRIVATE_KEY:'priv'});
  const month=new Date(Date.now()+5*3600000).toISOString().slice(0,7);
  const setReads=async(n)=>{reset();sqlite.prepare("INSERT INTO operational_daily(date,kind,data) VALUES (?,?,?)").run(month+'-01','usage:collection',JSON.stringify({read:n,written:0,runs:1}));};
  await setReads(480e6);await maintainCollection().catch(()=>{});
  assert.deepEqual(jobs(),[],'at 96%+ only alerts run');
  await setReads(10);await maintainCollection().catch(e=>{throw e});
  assert.ok(jobs().includes('actual-energy-repair'),'normal mode runs maintenance');
});

test('Usage alerts go out once per step and month',async()=>{
  const {sqlite}=database(),{usageAlerts,resetEconomyCache}=require('../lib/usage.ts');
  sqlite.exec("DELETE FROM operational_daily");resetEconomyCache();
  sqlite.prepare("INSERT OR IGNORE INTO notification_rules(user_id,id,config) VALUES ('alice','r','{}')").run();
  const month=new Date(Date.now()+5*3600000).toISOString().slice(0,7);
  sqlite.prepare("INSERT INTO operational_daily(date,kind,data) VALUES (?,?,?)").run(month+'-01','usage:collection',JSON.stringify({read:300e6,written:0,runs:1}));
  await usageAlerts();await usageAlerts();
  const rows=sqlite.prepare("SELECT event_id FROM app_alerts WHERE event_id LIKE 'usage:%'").all().map(r=>r.event_id);
  assert.ok(rows.length>=1&&new Set(rows).size===rows.length,'one alert per step, never repeated: '+rows);
});

test('The queries on the 5-minute and maintenance paths never scan a history table',()=>{
  const {sqlite}=database();
  const plan=sql=>sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail);
  const history=/(?:SCAN|SCAN TABLE) (tuya_observations|tuya_device_state|solar_samples|solar_raw_fields|provider_requests|provider_events|telemetry_summaries|automation_runs|automation_actions|tuya_command_log)\b(?!.*COVERING INDEX.*(?:time|status))/;
  const queries=[
    "SELECT device_id,code FROM tuya_observations WHERE observed_at>='x'",
    "SELECT data FROM solar_samples WHERE entity_id='e' AND source_timestamp>='a' AND source_timestamp<'b' ORDER BY source_timestamp",
    "SELECT COUNT(*) FROM provider_requests WHERE provider='tuya' AND purpose='history' AND timestamp>='x'",
    "SELECT id FROM tuya_command_log WHERE status IN ('pending','accepted','uncertain')",
    "UPDATE automation_actions SET status='x' WHERE command_id IS NOT NULL AND status IN ('pending','accepted','uncertain')",
    "UPDATE automation_runs SET status='x' WHERE status IN ('pending','executing')",
    "DELETE FROM telemetry_summaries WHERE granularity='hour' AND period<'x'",
    "SELECT period,data FROM telemetry_summaries WHERE source='tuya' AND entity_id='d' AND granularity='day' AND period>='a' AND period<='b'",
    "SELECT period,grid_kwh FROM solar_energy_periods WHERE period_type='day' AND period>='a' AND period<='b'",
  ];
  for(const sql of queries){const steps=plan(sql);assert.ok(!steps.some(d=>history.test(d)),`${sql}\n  scans a history table: ${steps.join(' | ')}`);}
});
