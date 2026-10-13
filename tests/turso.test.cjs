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

// A minimal Hrana-over-WebSocket server (RFC 6455 framing by hand) backed by in-memory SQLite.
function fakeSocketServer(){
  const http=require('node:http'),crypto=require('node:crypto'),{sqlite}=database(),stats={connections:0,requests:0,hellos:[]};
  const cell=v=>v===null?{type:'null'}:typeof v==='number'?(Number.isInteger(v)?{type:'integer',value:String(v)}:{type:'float',value:v}):{type:'text',value:String(v)};
  const arg=a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value;
  const exec=stmt=>{const prepared=sqlite.prepare(stmt.sql),args=(stmt.args??[]).map(arg);
    if(/^\s*(select|pragma)|returning/i.test(stmt.sql)){const rows=prepared.all(...args),cols=rows[0]?Object.keys(rows[0]):[];return{cols:cols.map(name=>({name})),rows:rows.map(r=>cols.map(c=>cell(r[c]))),affected_row_count:0,last_insert_rowid:null};}
    const r=prepared.run(...args);return{cols:[],rows:[],affected_row_count:Number(r.changes),last_insert_rowid:String(r.lastInsertRowid)};};
  const batch=steps=>{const results=[],errors=[];steps.forEach((step,i)=>{const c=step.condition,okAt=n=>results[n]!==null&&errors[n]===null;const run=!c||(c.type==='ok'?okAt(c.step):!okAt(c.cond.step));if(!run){results[i]=null;errors[i]=null;return;}try{results[i]=exec(step.stmt);errors[i]=null;}catch(e){results[i]=null;errors[i]={message:e.message};}});return{step_results:results,step_errors:errors};};
  const frame=text=>{const body=Buffer.from(text),n=body.length,head=n<126?Buffer.from([0x81,n]):n<65536?Buffer.from([0x81,126,n>>8,n&255]):(()=>{const h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(n),2);return h;})();return Buffer.concat([head,body]);};
  const server=http.createServer(),sockets=new Set();
  server.on('upgrade',(req,socket)=>{
    stats.connections++;sockets.add(socket);
    const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: hrana3\r\n\r\n`);
    let buffer=Buffer.alloc(0);
    const reply=message=>socket.write(frame(JSON.stringify(message)));
    socket.on('data',chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      for(;;){
        if(buffer.length<2)return;
        let length=buffer[1]&127,offset=2;
        if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}else if(length===127){if(buffer.length<10)return;length=Number(buffer.readBigUInt64BE(2));offset=10;}
        if(buffer.length<offset+4+length)return;
        const mask=buffer.subarray(offset,offset+4),payload=Buffer.from(buffer.subarray(offset+4,offset+4+length)).map((b,i)=>b^mask[i%4]),opcode=buffer[0]&15;
        buffer=buffer.subarray(offset+4+length);
        if(opcode===8){socket.end();return;}
        if(opcode!==1)continue;
        const message=JSON.parse(payload.toString());
        if(message.type==='hello'){stats.hellos.push(message.jwt);reply({type:'hello_ok'});continue;}
        stats.requests++;
        const {request,request_id}=message;
        try{
          if(request.type==='open_stream')reply({type:'response_ok',request_id,response:{type:'open_stream'}});
          else if(request.type==='execute')reply({type:'response_ok',request_id,response:{type:'execute',result:exec(request.stmt)}});
          else reply({type:'response_ok',request_id,response:{type:'batch',result:batch(request.batch.steps)}});
        }catch(e){reply({type:'response_error',request_id,error:{message:e.message}});}
      }
    });
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({sqlite,stats,url:`libsql://127.0.0.1:${server.address().port}`,close:()=>{for(const s of sockets)s.destroy();server.close();}})));
}
const nodeSocket=url=>new Promise((resolve,reject)=>{const ws=new WebSocket(url.replace(/^https:/,'ws:'),'hrana3');ws.addEventListener('open',()=>resolve(ws));ws.addEventListener('error',()=>reject(new Error('connect failed')));});

test('Many queries share one WebSocket instead of one fetch each',async()=>{
  const server=await fakeSocketServer();
  try{
    const db=createTursoDatabase({url:server.url,token:'secret',connect:url=>nodeSocket(url.replace(/^wss:/,'ws:'))});
    for(let i=0;i<60;i++)await db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Room '+i).run();
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM tuya_rooms').first()).n,60);
    assert.deepEqual((await Promise.all([1,2,3].map(i=>db.prepare('SELECT ? v').bind(i).first()))).map(r=>r.v),[1,2,3]);
    await db.batch([db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Hall'),db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Study')]);
    await assert.rejects(db.batch([db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Garage'),db.prepare('INSERT INTO tuya_rooms(name) VALUES (?)').bind('Hall')]),/UNIQUE|constraint/i);
    assert.equal(server.sqlite.prepare("SELECT COUNT(*) n FROM tuya_rooms WHERE name='Garage'").get().n,0);
    assert.equal(server.stats.connections,1,'one connection served every query');
    assert.deepEqual(server.stats.hellos,['secret']);
  }finally{server.close();server.sqlite.close();}
});

test('A connection left idle is replaced, and an unreachable WebSocket falls back to HTTP',async()=>{
  const server=await fakeSocketServer();
  try{
    const db=createTursoDatabase({url:server.url,token:'t',idleMs:40,connect:url=>nodeSocket(url.replace(/^wss:/,'ws:'))});
    await db.prepare('SELECT 1 v').first();await new Promise(r=>setTimeout(r,90));await db.prepare('SELECT 1 v').first();
    assert.equal(server.stats.connections,2);
  }finally{server.close();server.sqlite.close();}
  const {db:httpOnly,calls}=fakeTurso();
  const fallback=createTursoDatabase({url:'libsql://example.turso.io',token:'t',fetch:async(url,init)=>{
    const body=JSON.parse(init.body);return{ok:true,status:200,json:async()=>({results:[{type:'ok',response:{type:'execute',result:{cols:[{name:'v'}],rows:[[{type:'integer',value:'7'}]],affected_row_count:0,last_insert_rowid:null}}},{type:'ok',response:{type:'close'}}]}),body};
  },connect:async()=>{throw new Error('no websocket');}});
  assert.deepEqual(await fallback.prepare('SELECT 7 v').first(),{v:7});
  assert.ok(httpOnly&&calls);
});
