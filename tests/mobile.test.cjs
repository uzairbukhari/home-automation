/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {database,env,auth}=require('./helpers.cjs');
const {getOwnerUser}=require('../lib/owner-auth.ts');
const {transition,validateRules}=require('../lib/notification-types.ts');
const {observe,evaluateAlerts,saveRules,subscribe,validateSubscription}=require('../lib/notifications.ts');
const {generateKeyPairSync}=require('node:crypto');
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=keys.privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',expirationTime:null,keys:{p256dh:publicKey,auth:Buffer.alloc(16,4).toString('base64url')}};
Object.assign(env,{VAPID_SUBJECT:'mailto:owner@example.com',VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:jwk.d});
const rule={id:'low',kind:'low_battery',enabled:true,recovery:true,threshold:null};
const now=new Date('2026-10-03T10:00:00Z');
const snapshot=soc=>({device:{serial:'solar'},updatedAt:now.toISOString(),readings:[{metric:'battery_soc',value:soc,sourceTimestamp:now.toISOString(),quality:'good'}]});
test('Owner access fails closed and rejects other signed-in accounts',async()=>{
  const old=auth.user;try{auth.user=null;assert.equal(await getOwnerUser(),null);auth.user={userId:'outsider',email:'other@example.com'};assert.equal(await getOwnerUser(),null);auth.user={userId:'alice',email:'OWNER@example.com'};assert.equal((await getOwnerUser()).userId,'alice');delete env.DASHBOARD_OWNER_EMAIL;assert.equal(await getOwnerUser(),null);}finally{env.DASHBOARD_OWNER_EMAIL='owner@example.com';auth.user=old;}
});
test('All data APIs require owner access; scheduler endpoints reject anonymous calls',async()=>{
  const routes=['connection-status','favorites','provider-credentials','settings','solar/latest','solar/history','solar/reports','tuya/devices','tuya/rooms','tuya/[id]','tuya/[id]/history','mobile/session','notifications/preferences'];
  const old=auth.user;auth.user={userId:'outsider',email:'other@example.com'};
  try{for(const route of routes){const api=require(`../app/api/${route}/route.ts`);assert.equal((await api.GET(new Request('http://localhost/api/'+route),{params:Promise.resolve({id:'plug'})})).status,401,route);}for(const route of ['solar/collect','tuya/collect','notifications/evaluate','mobile/collect']){assert.equal((await require(`../app/api/${route}/route.ts`).POST(new Request('http://localhost/api/'+route,{method:'POST'}))).status,401);}}
  finally{auth.user=old;}
});
test('Battery transitions deduplicate, recover and rearm; switches establish a baseline',()=>{
  const first=transition(null,{value:20,active:true,timestamp:now.toISOString()},rule);assert.equal(first.event,true);
  assert.equal(transition(first.state,{value:20,active:true,timestamp:now.toISOString()},rule),null);
  const repeat=transition(first.state,{value:19,active:true,timestamp:'2026-10-03T10:05:00Z'},rule);assert.equal(repeat.event,false);
  const recovery=transition(repeat.state,{value:50,active:false,timestamp:'2026-10-03T10:10:00Z'},rule);assert.equal(recovery.recovered,true);
  assert.equal(transition(recovery.state,{value:10,active:true,timestamp:'2026-10-03T10:15:00Z'},rule).event,true);
  const change={...rule,kind:'switch_change'},baseline=transition(null,{value:false,active:false,timestamp:now.toISOString()},change);assert.equal(baseline.event,false);assert.equal(transition(baseline.state,{value:true,active:false,timestamp:'2026-10-03T10:05:00Z'},change).event,true);
});
test('Alert capabilities and values are validated; stale measurements cannot trigger battery events',()=>{
  assert.equal(observe(rule,snapshot(20),[],39,now).active,true);
  assert.equal(observe(rule,snapshot(20),[],39,new Date('2026-10-03T11:00:00Z')),null);
  assert.equal(observe({...rule,kind:'stale_solar'},null,[],39,now).active,true);
  assert.throws(()=>validateRules([{...rule,kind:'device_offline',deviceId:'foreign'}],[]));
  const device={id:'plug',capabilities:[{code:'cur_power',type:'Integer',metadataVerified:false}]};
  assert.throws(()=>validateRules([{...rule,kind:'sensor',deviceId:'plug',code:'cur_power',operator:'above',threshold:5}],[device]));
  assert.throws(()=>validateSubscription({...subscription,endpoint:'https://localhost/private'}));
});
test('Evaluation persists transitions, retries transient delivery and removes expired subscriptions',async()=>{
  const {sqlite}=database(),original=global.fetch;let status=503;
  global.fetch=async()=>new Response('',{status});
  try{
    await subscribe('alice',subscription);await saveRules('alice',[{...rule,kind:'stale_solar',threshold:15}],[]);
    await evaluateAlerts(now);
    let delivery=sqlite.prepare('SELECT * FROM notification_deliveries').get();assert.equal(delivery.attempts,1);assert.equal(delivery.status,'pending');
    await evaluateAlerts(new Date(now.getTime()+60000));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM notification_deliveries').get().n,1);assert.equal(sqlite.prepare('SELECT attempts FROM notification_deliveries').get().attempts,1);
    status=410;await evaluateAlerts(new Date(now.getTime()+300000));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);assert.equal(sqlite.prepare('SELECT status FROM notification_deliveries').get().status,'expired');
    assert.equal(sqlite.prepare('SELECT lease_token FROM notification_health').get().lease_token,null);
  }finally{global.fetch=original;sqlite.close();}
});
test('Unavailable push configuration records health and releases durable evaluator lease',async()=>{
  const {sqlite}=database(),key=env.VAPID_PRIVATE_KEY;delete env.VAPID_PRIVATE_KEY;
  try{await assert.rejects(evaluateAlerts(now));const health=sqlite.prepare('SELECT * FROM notification_health').get();assert.match(health.error,/not configured/);assert.equal(health.lease_token,null);}finally{env.VAPID_PRIVATE_KEY=key;sqlite.close();}
});
function worker(){
  const stores=new Map(),handlers={},origin='https://photon.test';
  const normalize=input=>new URL(typeof input==='string'?input:input.url,origin).href;
  const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {async put(k,v){map.set(normalize(k),v.clone());},async match(k){return map.get(normalize(k))?.clone();},async delete(k){return map.delete(normalize(k));},async keys(){return [...map.keys()].map(k=>new Request(k));}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
  let network=async()=>new Response('{}',{headers:{'content-type':'application/json'}});
  const context=vm.createContext({URL,Request,Response,Headers,Date,console,caches,fetch:(...args)=>network(...args),self:{location:{origin},addEventListener:(type,fn)=>handlers[type]=fn,clients:{matchAll:async()=>[],claim:async()=>{}},registration:{showNotification:async()=>{},getNotifications:async()=>[]},skipWaiting:async()=>{}}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/sw.js'),'utf8'),context);
  return {stores,caches,context,setNetwork(fn){network=fn;},async fetch(path,method='GET'){let response;const tasks=[];handlers.fetch({request:new Request(origin+path,{method}),respondWith(value){response=value;},waitUntil(task){tasks.push(task);}});const result=await response;await Promise.all(tasks);return result;},async message(data){let task;handlers.message({data,ports:[],waitUntil(value){task=value;}});await task;}};
}
test('Offline copies are query/account scoped, expire, and clear on account changes and unauthorized responses',async()=>{
  const w=worker();await w.message({type:'ACCOUNT',accountId:'alice'});
  await w.fetch('/api/solar/reports?year=2026');w.setNetwork(async()=>{throw new Error('offline');});assert.equal((await w.fetch('/api/solar/reports?year=2026')).status,200);assert.equal((await w.fetch('/api/solar/reports?year=2025')).status,503);
  const cache=await w.caches.open('photon-v1-private-alice');await cache.put('https://photon.test/api/solar/history',new Response('{}',{headers:{'x-photon-saved-at':String(Date.now()-31*86400000)}}));assert.equal((await w.fetch('/api/solar/history')).status,503);
  await w.message({type:'ACCOUNT',accountId:'bob'});assert.equal((await w.fetch('/api/solar/reports?year=2026')).status,503);assert.equal(w.stores.has('photon-v1-private-alice'),false);
  w.setNetwork(async()=>new Response('{}',{status:401}));assert.equal((await w.fetch('/api/settings')).status,401);assert.equal(await vm.runInContext('account()',w.context),null);
});
test('Offline writes are rejected without a queue; authentication and credentials are excluded',async()=>{
  const w=worker();w.setNetwork(async()=>{throw new Error('offline');});assert.equal((await w.fetch('/api/tuya/plug/command','POST')).status,503);
  assert.equal(await w.fetch('/api/provider-credentials'),undefined);assert.equal(await w.fetch('/api/mobile/session'),undefined);assert.equal(await w.fetch('/signin-with-chatgpt'),undefined);
  await w.message({type:'CLEAR_PRIVATE'});assert.equal(await vm.runInContext('account()',w.context),null);
});
test('High home load compares kW against the limit and defaults to 2.5 kW',()=>{
  const load=w=>({readings:[{metric:'home_power',value:w,quality:'good',sourceTimestamp:now.toISOString()}],updatedAt:now.toISOString()});
  const high={id:'high-load',kind:'high_load',enabled:true,recovery:false,threshold:null};
  assert.equal(observe(high,load(2600),[],39,now).active,true);
  assert.equal(observe(high,load(2400),[],39,now).active,false);
  assert.equal(observe({...high,threshold:3},load(2600),[],39,now).active,false);
  assert.equal(observe(high,load(2600),[],39,new Date('2026-10-03T11:00:00Z')),null);
});
