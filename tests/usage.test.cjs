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
