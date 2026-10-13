/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database,env}=require('./helpers.cjs');
const {createTursoDatabase,encodeArg,decodeValue}=require('../lib/turso.ts');
const {appDb}=require('../lib/db.ts');
const {saveSamples}=require('../lib/solar-store.ts');

// A fake Turso server: understands the pipeline shapes the adapter sends and runs them on in-memory SQLite.
function fakeTurso(){
  const {sqlite}=database(),calls=[];
  const cell=v=>v===null?{type:'null'}:typeof v==='number'?(Number.isInteger(v)?{type:'integer',value:String(v)}:{type:'float',value:v}):{type:'text',value:String(v)};
  const arg=a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value;
  const exec=stmt=>{const prepared=sqlite.prepare(stmt.sql),args=(stmt.args??[]).map(arg);
    if(/^\s*(select|pragma)|returning/i.test(stmt.sql)){const rows=prepared.all(...args),cols=rows[0]?Object.keys(rows[0]):[];return{cols:cols.map(name=>({name})),rows:rows.map(r=>cols.map(c=>cell(r[c]))),affected_row_count:0,last_insert_rowid:null};}
    const r=prepared.run(...args);return{cols:[],rows:[],affected_row_count:Number(r.changes),last_insert_rowid:String(r.lastInsertRowid)};};
  const fetch=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url,auth:init.headers.authorization,body});
    const results=body.requests.map(req=>{
      if(req.type==='close')return{type:'ok',response:{type:'close'}};
      try{
        if(req.type==='execute')return{type:'ok',response:{type:'execute',result:exec(req.stmt)}};
        const step_results=[],step_errors=[];
        req.batch.steps.forEach((step,i)=>{
          const c=step.condition,okAt=n=>step_results[n]!==null&&step_errors[n]===null;
          const run=!c||(c.type==='ok'?okAt(c.step):!okAt(c.cond.step));
          if(!run){step_results[i]=null;step_errors[i]=null;return;}
          try{step_results[i]=exec(step.stmt);step_errors[i]=null;}catch(e){step_results[i]=null;step_errors[i]={message:e.message};}
        });
        return{type:'ok',response:{type:'batch',result:{step_results,step_errors}}};
      }catch(e){return{type:'error',error:{message:e.message}};}
    });
    return{ok:true,status:200,json:async()=>({results}),text:async()=>''};
  };
  return{sqlite,calls,db:createTursoDatabase({url:'libsql://example.turso.io',token:'secret',fetch})};
}

test('Turso adapter encodes and decodes values like D1',()=>{
  assert.deepEqual(encodeArg(5),{type:'integer',value:'5'});assert.deepEqual(encodeArg(1.5),{type:'float',value:1.5});
  assert.deepEqual(encodeArg(true),{type:'integer',value:'1'});assert.deepEqual(encodeArg(undefined),{type:'null'});assert.deepEqual(encodeArg('a'),{type:'text',value:'a'});
  assert.equal(decodeValue({type:'integer',value:'42'}),42);assert.equal(decodeValue({type:'null'}),null);
  assert.deepEqual(Array.from(new Uint8Array(decodeValue(encodeArg(new Uint8Array([1,2,255]))))),[1,2,255]);
});

test('Turso adapter runs first/all/run/batch and rolls a failed batch back',async()=>{
  const {db,calls,sqlite}=fakeTurso();
  const insert=await db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Kitchen').run();
  assert.equal(insert.meta.changes,1);
  assert.equal(calls[0].url,'https://example.turso.io/v2/pipeline');assert.equal(calls[0].auth,'Bearer secret');
  assert.deepEqual(await db.prepare('SELECT name FROM tuya_rooms WHERE name=?').bind('Kitchen').first(),{name:'Kitchen'});
  assert.equal(await db.prepare('SELECT name FROM tuya_rooms WHERE name=?').bind('Nope').first(),null);
  assert.deepEqual((await db.prepare('SELECT name FROM tuya_rooms').all()).results,[{name:'Kitchen'}]);
  await db.batch([db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Hall'),db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Study')]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM tuya_rooms').get().n,3);
  await assert.rejects(db.batch([db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Garage'),db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Hall')]),/UNIQUE|constraint/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tuya_rooms WHERE name='Garage'").get().n,0,'a failed batch is rolled back');
  assert.ok(calls.at(-1).body.requests[0].batch.steps.some(s=>s.stmt.sql==='ROLLBACK'));
  assert.deepEqual(await db.batch([]),[]);
});

test('The app uses Turso when configured and D1 otherwise',()=>{
  const {sqlite}=database(),d1={tag:'d1'};env.DB=d1;
  try{
    assert.equal(appDb(),d1);
    env.TURSO_DATABASE_URL='libsql://example.turso.io';env.TURSO_AUTH_TOKEN='secret';
    const turso=appDb();assert.notEqual(turso,d1);assert.equal(appDb(),turso,'the client is reused');
  }finally{delete env.TURSO_DATABASE_URL;delete env.TURSO_AUTH_TOKEN;sqlite.close();}
});

test('Unchanged solar samples are not rewritten on the next collection',async()=>{
  const {sqlite}=database(),stamp=new Date(Date.now()-3600000).toISOString(),later=new Date(Date.now()-3000000).toISOString();
  const point=sourceTimestamp=>({sourceTimestamp,solar:100,home:80,grid:0,battery:50});
  const writes=()=>sqlite.prepare('SELECT COUNT(*) n FROM solar_samples').get().n;
  try{
    assert.equal(await saveSamples('inv',[point(stamp)]),1);
    const row=sqlite.prepare('SELECT recorded_at FROM solar_samples').get();
    sqlite.prepare("UPDATE solar_samples SET recorded_at='marker'").run();
    assert.equal(await saveSamples('inv',[point(stamp)]),0,'identical point writes nothing');
    assert.equal(sqlite.prepare('SELECT recorded_at FROM solar_samples').get().recorded_at,'marker');
    assert.equal(await saveSamples('inv',[point(stamp),point(later)]),1,'only the new point is written');
    assert.equal(writes(),2);assert.ok(row);
  }finally{sqlite.close();}
});
