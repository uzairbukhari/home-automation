/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database,env}=require('./helpers.cjs');
const {bearerToken,hashPassword,signSession,verifySession}=require('../lib/session.ts');
const login=require('../app/api/mobile/login/route.ts');

test('Bearer tokens are read only from a well-formed Authorization header',()=>{
  assert.equal(bearerToken('Bearer abc.def'),'abc.def');
  assert.equal(bearerToken('bearer abc'),'abc');
  assert.equal(bearerToken('Basic abc'),undefined);
  assert.equal(bearerToken('Bearer a b'),undefined);
  assert.equal(bearerToken(null),undefined);
});
test('App sign-in returns a verifiable session for the right password and locks out guessing',async()=>{
  database();
  Object.assign(env,{DASHBOARD_PASSWORD_HASH:await hashPassword('correct horse',1000),SESSION_SECRET:'test-secret',DASHBOARD_OWNER_EMAIL:'owner@example.com',OWNER_USER_ID:'alice'});
  const call=(password,ip='1.1.1.1')=>login.POST(new Request('http://localhost/api/mobile/login',{method:'POST',headers:{'cf-connecting-ip':ip,'content-type':'application/json'},body:JSON.stringify({password})}));
  const ok=await call('correct horse');assert.equal(ok.status,200);
  const {token}=await ok.json();assert.deepEqual(await verifySession(token,'test-secret'),{userId:'alice',email:'owner@example.com'});
  assert.equal(await verifySession(token,'other-secret'),null);
  for(let i=0;i<8;i++)assert.equal((await call('nope','2.2.2.2')).status,401);
  assert.equal((await call('nope','2.2.2.2')).status,429);
  assert.equal((await call('correct horse','2.2.2.2')).status,429);
  assert.equal((await call('correct horse','3.3.3.3')).status,200);
  void signSession;
});
test('App sign-in fails closed when login is not configured',async()=>{
  database();Object.assign(env,{DASHBOARD_PASSWORD_HASH:undefined});
  const response=await login.POST(new Request('http://localhost/api/mobile/login',{method:'POST',body:'{}'}));assert.equal(response.status,503);
});

test('App alert feed baselines new installs, returns only newer alerts and is idempotent per event',async()=>{
  const {db}=database();
  const {ensureAppAlerts,appAlertStatement,appAlertFeed}=require('../lib/app-alerts.ts');
  await ensureAppAlerts();
  const now=new Date('2026-10-12T10:00:00Z').toISOString();
  assert.deepEqual(await appAlertFeed('alice',null,Date.parse(now)),{alerts:[],latest:0});
  await db.batch([appAlertStatement('alice',{eventId:'e1',title:'Photon · alert',body:'Battery 18%',url:'/solar'},now),appAlertStatement('alice',{eventId:'e1',title:'dup',body:'dup',url:'/'},now),appAlertStatement('bob',{eventId:'e2',title:'x',body:'y',url:'/'},now)]);
  const baseline=await appAlertFeed('alice',null,Date.parse(now));assert.equal(baseline.alerts.length,0);assert.ok(baseline.latest>0);
  const feed=await appAlertFeed('alice',0,Date.parse(now));assert.equal(feed.alerts.length,1);assert.equal(feed.alerts[0].body,'Battery 18%');
  assert.equal((await appAlertFeed('alice',feed.latest,Date.parse(now))).alerts.length,0);
  const old=await appAlertFeed('alice',0,Date.parse(now)+31*86400000);assert.equal(old.alerts.length,0);
});
test('App alert endpoint requires the owner and validates the cursor',async()=>{
  const {auth}=require('./helpers.cjs'),route=require('../app/api/mobile/alerts/route.ts'),old=auth.user;
  try{auth.user=null;assert.equal((await route.GET(new Request('http://localhost/api/mobile/alerts'))).status,401);
    auth.user={userId:'alice'};database();assert.equal((await route.GET(new Request('http://localhost/api/mobile/alerts?after=-1'))).status,400);
    assert.equal((await route.GET(new Request('http://localhost/api/mobile/alerts'))).status,200);}
  finally{auth.user=old;}
});
