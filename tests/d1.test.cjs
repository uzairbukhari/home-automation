/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
require('./helpers.cjs');
const {wrapD1}=require('../lib/d1.ts'),{appDb,dbDiagnostics,D1_BINDING,setTestDatabase}=require('../lib/db.ts');

// A D1 binding over node:sqlite that reports rows_read as the rows returned plus 10 and rows_written as the changes.
function fakeBinding(){
  const sqlite=new DatabaseSync(':memory:'),batches=[];
  const statement=(sql,values=[])=>({sql,values,bind(...next){return statement(sql,next);},
    async all(){const rows=sqlite.prepare(sql).all(...values);return{success:true,results:rows,meta:{changes:0,last_row_id:0,rows_read:rows.length+10,rows_written:0,duration:1}};},
    async run(){const r=sqlite.prepare(sql).run(...values);return{success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid),rows_read:0,rows_written:Number(r.changes),duration:1}};},
    async raw(){return sqlite.prepare(sql).all(...values).map(row=>Object.values(row));}});
  return{sqlite,batches,prepare:sql=>statement(sql),async batch(list){batches.push(list.length);const out=[];for(const item of list)out.push(await item.run());return out;},async exec(sql){sqlite.exec(sql);return{count:1,duration:0};}};
}

test('The D1 wrapper implements the app database API and adds up rows read and written',async()=>{
  const binding=fakeBinding(),db=wrapD1(binding);
  await db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT)');
  const inserted=await db.prepare('INSERT INTO t(name) VALUES (?)').bind('a').run();
  assert.equal(inserted.meta.changes,1);assert.equal(inserted.meta.last_row_id,1);
  const results=await db.batch([db.prepare('INSERT INTO t(name) VALUES (?)').bind('b'),db.prepare('INSERT INTO t(name) VALUES (?)').bind('c')]);
  assert.equal(results.length,2);assert.deepEqual(binding.batches,[2]);assert.deepEqual(await db.batch([]),[]);
  assert.deepEqual((await db.prepare('SELECT name FROM t ORDER BY id').all()).results.map(r=>r.name),['a','b','c']);
  assert.equal((await db.prepare('SELECT name FROM t WHERE id=?').bind(2).first()).name,'b');
  assert.equal(await db.prepare('SELECT name FROM t WHERE id=?').bind(3).first('name'),'c');
  assert.equal(await db.prepare('SELECT name FROM t WHERE id=?').bind(99).first(),null);
  assert.deepEqual(await db.prepare('SELECT id,name FROM t WHERE id=1').raw(),[[1,'a']]);
  // reads: all()=3+10, first() x3 = (1+10)+(1+10)+(0+10), writes: 3 inserts
  assert.deepEqual(db.diagnostics(),{rowsRead:13+11+11+10,rowsWritten:3});
});

test('The app uses the D1 binding when the Worker hands one over, and Turso otherwise',async()=>{
  setTestDatabase(undefined);
  const saved=globalThis[D1_BINDING];delete globalThis[D1_BINDING];
  try{
    assert.equal(appDb(),undefined,'no database without a binding or Turso settings');
    globalThis[D1_BINDING]=fakeBinding();
    const db=appDb();assert.ok(db);assert.equal(appDb(),db,'the wrapper is reused for the same binding');
    assert.equal(dbDiagnostics().backend,'d1');
    await db.prepare('SELECT 1 n').first();assert.ok(dbDiagnostics().rowsRead>0);
  }finally{if(saved)globalThis[D1_BINDING]=saved;else delete globalThis[D1_BINDING];}
});

test('The Worker entry passes the D1 binding on and runs the collection on cron',async()=>{
  const {withScheduled}=await import('../cloudflare/handler.mjs');
  const calls=[],answer={status:200},app={async fetch(request,env){calls.push({url:request.url,method:request.method,secret:request.headers.get('x-collection-secret'),db:globalThis[D1_BINDING]===env.DB});return new Response('{}',{status:answer.status});}};
  const worker=withScheduled(app),env={DB:fakeBinding(),NOTIFICATION_COLLECTION_SECRET:'s3cret'},saved=globalThis[D1_BINDING];
  try{
    await worker.fetch(new Request('https://example.com/login'),env,{});
    assert.equal(calls[0].db,true,'fetch binds the database first');
    await worker.scheduled({},env,{});
    assert.deepEqual(calls[1],{url:'https://worker.internal/api/mobile/collect',method:'POST',secret:'s3cret',db:true});
    await worker.scheduled({},{DB:env.DB,NOTIFICATION_SCHEDULE_SECRET:'old'},{});assert.equal(calls[2].secret,'old','the older secret name still works');
    await assert.rejects(worker.scheduled({},{DB:env.DB},{}),/NOTIFICATION_COLLECTION_SECRET/);
    answer.status=502;await assert.rejects(worker.scheduled({},env,{}),/Collection answered 502/);
  }finally{if(saved)globalThis[D1_BINDING]=saved;else delete globalThis[D1_BINDING];}
});
