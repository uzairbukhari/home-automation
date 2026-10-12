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
