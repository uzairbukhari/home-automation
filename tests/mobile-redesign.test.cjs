/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
require('./helpers.cjs');
const {appearanceScript}=require('../components/appearance-settings.tsx');
test('Notification status resolves without waiting for a service worker to become ready',async()=>{
 const fs=require('node:fs'),ts=require('typescript');
 for(const subscription of [undefined,{endpoint:'mock-only'}]){
  const effects=[],states=[],exports={};let readyReads=0,registrationReads=0;
  const react={useEffect:callback=>effects.push(callback),useState:value=>{const index=states.length;states.push(value);return [value,next=>{states[index]=next;}];}};
  const worker={getRegistration:async()=>{registrationReads++;return subscription?{pushManager:{getSubscription:async()=>subscription}}:undefined;},get ready(){readyReads++;return new Promise(()=>{});}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/notification-settings.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:name.includes('mobile-support')?{useOffline:()=>false}:name.includes('use-app-navigation')?{useUnsavedChanges:()=>{}}:{},navigator:{serviceWorker:worker},window:{},fetch:async()=>Response.json({rules:[],publicKey:'',health:null}),queueMicrotask,Notification:{permission:'default'}});
  exports.NotificationSettings({devices:[]});effects.forEach(run=>run());await new Promise(resolve=>setImmediate(resolve));
  assert.equal(readyReads,0);assert.equal(registrationReads,1);assert.equal(states[9],true);assert.equal(states[4],Boolean(subscription));
 }
});
test('Startup renders the server-verified page immediately instead of a loading shell',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{MobileSupport,PhotonLoading}=require('../components/mobile-support.tsx');
 const html=renderToStaticMarkup(React.createElement(MobileSupport,{accountId:'alice'},React.createElement('div',null,'Private account readings')));
 assert.match(html,/Private account readings/);
 assert.doesNotMatch(html,/Preparing your dashboard/);
 // The shell remains available for the moment a different account is detected and the page reloads.
 const shell=renderToStaticMarkup(React.createElement(PhotonLoading));
 assert.match(shell,/role="status" aria-busy="true" aria-label="Loading Photon"/);
 assert.match(shell,/Preparing your dashboard/);
});
function navigationHarness(initial='https://photon.test/devices') {
 const fs=require('node:fs'),ts=require('typescript'),listeners=new Map(),location={href:initial};
 const entries=[{url:initial,state:null}];let position=0;
 const window={addEventListener:(name,fn,capture)=>{const list=listeners.get(name)||[];list.push({fn,capture:Boolean(capture)});listeners.set(name,list);},removeEventListener:(name,fn)=>listeners.set(name,(listeners.get(name)||[]).filter(item=>item.fn!==fn)),dispatchEvent:event=>{for(const item of [...(listeners.get(event.type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){item.fn(event);if(event.stopped)break;}}};
 const history={get state(){return entries[position].state;},pushState:(state,_,url)=>{location.href=String(url);entries.splice(position+1);entries.push({url:location.href,state});position++;},replaceState:(state,_,url)=>{location.href=String(url);entries[position]={url:location.href,state};},back:()=>{if(position){position--;location.href=entries[position].url;window.dispatchEvent({type:'popstate',stopImmediatePropagation(){this.stopped=true;}});}}};
 const effects=[],exports={};
 const react={useEffect:callback=>effects.push(callback),useState:value=>[value,()=>{}],useRef:value=>({current:value})};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('hooks/use-app-navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>react,window,document:window,location,history,URL,Event});
 return {exports,effects,location,history};
}
test('Back closes filters while retaining chosen room and device detail selections',()=>{
 const h=navigationHarness(),[,filter,close]=h.exports.useUrlState('filters',''),[,room]=h.exports.useUrlState('room','all');h.effects.forEach(run=>run());
 filter('open',true);room('Outdoor');close();const url=new URL(h.location.href);assert.equal(url.searchParams.get('room'),'Outdoor');assert.equal(url.searchParams.has('filters'),false);
 const [,device]=h.exports.useUrlState('device',''),[,tab]=h.exports.useUrlState('deviceTab','overview');h.effects.slice(2).forEach(run=>run());device('fan',true);tab('controls');h.history.back();assert.equal(new URL(h.location.href).searchParams.has('device'),false);assert.equal(new URL(h.location.href).searchParams.get('room'),'Outdoor');
});
test('Unsaved edits hold Back navigation until the in-app discard choice',async()=>{
 const h=navigationHarness('https://photon.test/settings'),[,category]=h.exports.useUrlState('category','');h.effects.forEach(run=>run());category('battery',true);
 h.exports.useUnsavedChanges(true);h.effects.slice(1).forEach(run=>run());h.history.back();assert.equal(new URL(h.location.href).searchParams.get('category'),'battery');assert.equal(h.exports.hasDiscardPrompt(),true);
 h.exports.answerDiscardPrompt(false);await Promise.resolve();assert.equal(new URL(h.location.href).searchParams.get('category'),'battery');
 h.history.back();h.exports.answerDiscardPrompt(true);await Promise.resolve();await Promise.resolve();assert.equal(new URL(h.location.href).searchParams.has('category'),false);
});
test('Closing a directly linked settings category protects edits',async()=>{
 const h=navigationHarness('https://photon.test/settings?category=battery'),[,,close]=h.exports.useUrlState('category','');h.effects.forEach(run=>run());
 h.exports.useUnsavedChanges(true);h.effects.slice(1).forEach(run=>run());close();assert.equal(h.exports.hasDiscardPrompt(),true);
 h.exports.answerDiscardPrompt(false);await Promise.resolve();await Promise.resolve();assert.equal(new URL(h.location.href).searchParams.get('category'),'battery');
 close();h.exports.answerDiscardPrompt(true);await Promise.resolve();await Promise.resolve();assert.equal(new URL(h.location.href).searchParams.has('category'),false);
});
test('Appearance follows system on first paint and respects a saved override',()=>{
 for(const [preference,systemDark,expected] of [['system',true,'dark'],['system',false,'light'],['light',true,'light'],['dark',false,'dark']]) {
  const root={classList:{toggle:(name,on)=>{root.dark=on;}},dataset:{},style:{}};
  vm.runInNewContext(appearanceScript,{localStorage:{getItem:()=>preference},matchMedia:()=>({matches:systemDark}),document:{documentElement:root}});
  assert.equal(root.dataset.theme,expected);assert.equal(root.style.colorScheme,expected);assert.equal(root.dark,expected==='dark');
 }
});
test('Concurrent private reads share only the in-flight request and retry failures',async()=>{
 const {readJson}=require('../lib/client-data.ts'),original=global.fetch;let requests=0,release;
 try {
  global.fetch=()=>{requests++;return new Promise(resolve=>{release=resolve;});};
  const one=readJson('/test/account-data'),two=readJson('/test/account-data');assert.equal(requests,1);assert.equal(one,two);
  release(Response.json({value:42}));assert.deepEqual(await one,{value:42});
  global.fetch=async()=>{requests++;return Response.json({error:'Temporary failure'},{status:503});};
  await assert.rejects(readJson('/test/account-data'),/Temporary failure/);assert.equal(requests,2);
  global.fetch=async()=>{requests++;return Response.json({value:99});};
  assert.deepEqual(await readJson('/test/account-data'),{value:99});assert.equal(requests,3);
 } finally {global.fetch=original;}
});
test('Device commands distinguish accepted/confirmed, reject duplicate taps, and release on failure',async()=>{
 const {sendDeviceCommand}=require('../lib/client-data.ts'),original=global.fetch;let calls=0,release;
 try {
  global.fetch=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const first=sendDeviceCommand('fixture','switch_1',true);
  await assert.rejects(sendDeviceCommand('fixture','switch_1',true),/already in progress/);assert.equal(calls,1);
  release(Response.json({status:'accepted'}));assert.match(await first,/awaiting device confirmation/);
  global.fetch=async()=>Response.json({status:'confirmed'});assert.equal(await sendDeviceCommand('fixture','switch_1',false),'Device confirmed the change.');
  global.fetch=async()=>Response.json({error:'Device unavailable'},{status:503});await assert.rejects(sendDeviceCommand('fixture','switch_1',true),/Device unavailable/);
  global.fetch=async()=>Response.json({status:'confirmed'});await sendDeviceCommand('fixture','switch_1',true);
 } finally {global.fetch=original;}
});
test('Foreground polling pauses while hidden, resumes once visible, and cleans up',()=>{
 const {foregroundPoll}=require('../lib/client-data.ts'),original={document:global.document,setInterval:global.setInterval,clearInterval:global.clearInterval};let tick,visibility,refreshes=0,removed=false,cleared=false;
 try {
  global.document={visibilityState:'visible',addEventListener:(_,callback)=>{visibility=callback;},removeEventListener:(_,callback)=>{removed=callback===visibility;}};
  global.setInterval=callback=>{tick=callback;return 23;};global.clearInterval=id=>{cleared=id===23;};
  const stop=foregroundPoll(()=>refreshes++,60000);assert.equal(refreshes,1);document.visibilityState='hidden';tick();visibility();assert.equal(refreshes,1);
  document.visibilityState='visible';visibility();assert.equal(refreshes,2);stop();tick();assert.equal(refreshes,2);assert.ok(removed&&cleared);
 } finally {Object.assign(global,original);}
});

test('Saved solar screens respond without waiting for provider calls',async()=>{
 const {database,auth,afterTasks}=require('./helpers.cjs'),{sqlite}=database(),oldUser=auth.user;
 const {DessMonitorProvider}=require('../lib/providers/dessmonitor.ts'),prototype=DessMonitorProvider.prototype;
 const originals={getSnapshot:prototype.getSnapshot,getIdentity:prototype.getIdentity,getHistory:prototype.getHistory};
 const {saveSnapshot,saveProviderPeriods}=require('../lib/solar-store.ts'),{localDate}=require('../lib/measurements.ts');
 const stamp=new Date().toISOString(),today=localDate(),year=today.slice(0,4);let providerCalls=0;
 auth.user={userId:'performance-fixture'};afterTasks.length=0;
 try{
  await saveSnapshot({device:{serial:'performance-fixture',name:'Fixture',collector:'test',mode:'Battery mode'},updatedAt:stamp,readings:[{metric:'battery_soc',value:50,quality:'good'}],series:[{sourceTimestamp:stamp,solar:100,home:50,grid:0,battery:50}]});
  await saveProviderPeriods({entityId:'performance-fixture',type:'year',buckets:[{date:year,solar:123,grid:null,home:null,source:'provider:ENERGY_TOTAL',gridSource:'missing',coveredHours:0,partial:true}]});
  prototype.getSnapshot=async()=>{providerCalls++;throw new Error('Provider is deliberately slow/unavailable');};
  prototype.getIdentity=async()=>({serial:'performance-fixture'});prototype.getHistory=async()=>{providerCalls++;throw new Error('Unavailable history');};
  const latest=await require('../app/api/solar/latest/route.ts').GET();assert.equal(latest.status,200);const live=await latest.json();assert.equal(live.readings[0].quality,'good');assert.equal(live.refreshing,false);
  const summary=await (await require('../app/api/solar/latest/route.ts').GET(new Request('http://localhost/api/solar/latest?summary=1'))).json();assert.equal(summary.series.length,0);assert.equal(summary.readings[0].value,50);
  const response=await require('../app/api/solar/reports/route.ts').GET(new Request('http://localhost/api/solar/reports?year='+year));assert.equal(response.status,200);const report=await response.json();assert.equal(report.production.year,123);assert.equal(report.refreshing,false);
  const history=await require('../app/api/solar/history/route.ts').GET(new Request('http://localhost/api/solar/history?range=day'));assert.equal(history.status,200);assert.equal((await history.json()).sampleCount,1);
  assert.equal(providerCalls,0);assert.equal(afterTasks.length,0);
  await Promise.all(afterTasks.splice(0).map(task=>task()));assert.equal(providerCalls,0);
 }finally{Object.assign(prototype,originals);auth.user=oldUser;afterTasks.length=0;sqlite.close();}
});
test('Background refreshes deduplicate per account, retain failures and allow retries',async()=>{
 const {deferRefresh}=require('../lib/deferred-refresh.ts'),tasks=[],schedule=task=>tasks.push(task);let calls=0;
 const work=async()=>{calls++;};
 assert.equal(deferRefresh('fixture:alice',work,schedule).refreshing,true);
 deferRefresh('fixture:alice',work,schedule);assert.equal(tasks.length,1);
 deferRefresh('fixture:bob',work,schedule);assert.equal(tasks.length,2);
 await Promise.all(tasks.splice(0).map(task=>task()));assert.equal(calls,2);
 assert.equal(deferRefresh('fixture:alice',work,schedule).refreshing,false);assert.equal(tasks.length,0);
 deferRefresh('fixture:failed',async()=>{throw new Error('Temporary provider failure');},schedule);
 await tasks.shift()();assert.equal(deferRefresh('fixture:failed',work,schedule).error,'Temporary provider failure');
 const clock=Date.now;try{Date.now=()=>clock()+16000;deferRefresh('fixture:failed',work,schedule);assert.equal(tasks.length,1);await tasks.shift()();}finally{Date.now=clock;}
});
test('Device loading does not announce zero devices or an empty home',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{DevicesDashboard}=require('../components/devices-dashboard.tsx');
 const html=renderToStaticMarkup(React.createElement(DevicesDashboard,{devices:[],error:'',loading:true,onRefresh:async()=>{},favorites:{has:()=>false,toggle:()=>{},busy:false}}));
 assert.match(html,/Loading your devices/);assert.doesNotMatch(html,/0 devices|No linked devices found/);
});
test('Every control type remains available and unsafe commands remain disabled',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{DeviceControl}=require('../components/devices-dashboard.tsx');
 const device={id:'test-only',online:true,stale:false,datapoints:[{code:'switch',raw:true},{code:'level',raw:50},{code:'mode',raw:'auto'},{code:'label',raw:'Fixture'}]};
 const caps=[{code:'switch',type:'Boolean'},{code:'mode',type:'Enum',options:['auto','manual']},{code:'level',type:'Integer',min:0,max:100,step:1,scale:0,metadataVerified:true},{code:'label',type:'String'}];
 const render=(cap,d=device)=>renderToStaticMarkup(React.createElement(DeviceControl,{device:d,cap:{name:cap.code,writable:true,scale:0,...cap},onSend:async()=>{},busy:false}));
 assert.match(render(caps[0]),/role="switch"/);assert.match(render(caps[1]),/<select/);assert.match(render(caps[2]),/type="range"/);assert.match(render(caps[3]),/name="value"/);
 for(const cap of caps){assert.match(render(cap,{...device,stale:true}),/disabled/);assert.match(render(cap,{...device,online:false}),/disabled/);}
 assert.match(render({...caps[2],metadataVerified:false}),/disabled/);
});
test('Readable rule summaries preserve inclusive legacy values, actual actions and units',()=>{
 const {describeRule,describeCondition,homeCondition}=require('../lib/ui-presentation.ts');
 const device={id:'fixture',name:'Bedroom lamp',channelLabels:{switch_1:'Reading light'},capabilities:[{code:'switch_1',type:'Boolean',name:'Switch'}]};
 const rule={logic:'all',conditions:[{source:'solar',metric:'battery_soc',operator:'below',value:15}],actions:[{deviceId:'fixture',code:'switch_1',value:false}]};
 assert.equal(describeRule(rule,[device]),'When battery charge is at or below 15%, then set Bedroom lamp reading light to off.');
 assert.match(describeCondition({source:'solar',metric:'solar_power',operator:'gt',value:1500}),/above 1500 W/);
 assert.match(describeCondition({source:'schedule',start:'09:00',end:'17:00',days:[1,2]}),/Mon, Tue/);
 assert.equal(homeCondition({solar:null,home:100,grid:null,charge:2,discharge:0}),'Battery charging');
 assert.equal(homeCondition({solar:0,home:0,grid:0,charge:0,discharge:0}),'Your home’s latest energy readings');
});
test('Period bar labels the period and disables stepping past the latest one',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{PeriodBar}=require('../components/energy/period-bar.tsx');
 const html=renderToStaticMarkup(React.createElement(PeriodBar,{label:'Mon, 12 Oct',onPrev(){},onNext(){},nextDisabled:true,onNow(){}}));
 assert.match(html,/Mon, 12 Oct/);assert.match(html,/aria-label="Previous period"/);
 assert.match(html,/aria-label="Next period"[^>]*disabled/);assert.match(html,/class="period-now"[^>]*disabled/);
});
test('Settings category switches require a decision for unsaved edits',async()=>{
 const h=navigationHarness('https://photon.test/settings?category=battery'),[,category]=h.exports.useUrlState('category','');h.effects.forEach(run=>run());
 h.exports.useUnsavedChanges(true);h.effects.slice(1).forEach(run=>run());category('billing',true);
 assert.equal(h.exports.hasDiscardPrompt(),true);assert.equal(new URL(h.location.href).searchParams.get('category'),'battery');
 h.exports.answerDiscardPrompt(false);await Promise.resolve();await Promise.resolve();assert.equal(new URL(h.location.href).searchParams.get('category'),'battery');
 category('billing',true);h.exports.answerDiscardPrompt(true);await Promise.resolve();await Promise.resolve();assert.equal(new URL(h.location.href).searchParams.get('category'),'billing');
});
test('Back restores Energy subsections while overlay filters keep their choices',()=>{
 const h=navigationHarness('https://photon.test/solar'),[,section]=h.exports.useUrlState('section','overview');h.effects.forEach(run=>run());
 section('history',true);section('reports',true);h.history.back();assert.equal(new URL(h.location.href).searchParams.get('section'),'history');
 h.history.back();assert.equal(new URL(h.location.href).searchParams.has('section'),false);
});

test('Reports use the inverter monthly counter and queue a period sync while provider totals are missing',async()=>{
 const {database,auth,afterTasks}=require('./helpers.cjs'),{sqlite}=database(),oldUser=auth.user;
 const {saveSnapshot}=require('../lib/solar-store.ts');
 const stamp=new Date().toISOString();
 auth.user={userId:'fresh-database-fixture'};afterTasks.length=0;
 try{
  await saveSnapshot({device:{serial:'fresh-database-fixture',name:'Fixture',collector:'test',mode:'Line mode'},updatedAt:stamp,readings:[{metric:'solar_today',value:12.3,quality:'good'},{metric:'solar_month',value:142.6,quality:'good'},{metric:'solar_total',value:1731,quality:'good'}],series:[{sourceTimestamp:stamp,solar:100,home:50,grid:0,battery:50}]});
  const response=await require('../app/api/solar/reports/route.ts').GET(new Request('http://localhost/api/solar/reports'));assert.equal(response.status,200);
  const report=await response.json();
  assert.equal(report.production.month,142.6);assert.equal(report.production.lifetime,1731);
  assert.equal(afterTasks.length,1,'one period sync is queued');
  assert.deepEqual(report.diagnostics.periodJobs,[]);
 }finally{auth.user=oldUser;afterTasks.length=0;sqlite.close();}
});
