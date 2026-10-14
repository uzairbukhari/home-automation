/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {allocate,batteryWatts,toSnapshot,particleSpeed,particleCount,ringPeriod,nextPollDelay}=require('../lib/energy-flow.ts');
const sum=r=>r.solarHome+r.solarBattery+r.batteryHome+r.gridHome+r.gridBattery;
test('allocation covers the home in every preview scenario',()=>{
 for(const [solar,home,batt] of [[4200,1300,2900],[250,2300,-1500],[0,450,-450],[0,600,1400],[900,1150,0]]){
  const r=allocate(solar,home,batt);
  assert.ok(Math.abs(r.solarHome+r.batteryHome+r.gridHome-home)<1e-9,`home ${home}`);
  assert.ok(r.solarHome+r.solarBattery<=solar+1e-9);
  assert.ok(Object.values(r).every(v=>v>=0));
 }
});
test('sunny noon splits solar between home and battery',()=>{const r=allocate(4200,1300,2900);assert.equal(r.solarHome,1300);assert.equal(r.solarBattery,2900);assert.equal(r.gridHome,0);assert.equal(sum(r),4200);});
test('grid charging draws only from the grid',()=>{const r=allocate(0,600,1400);assert.equal(r.gridHome,600);assert.equal(r.gridBattery,1400);});
test('battery watts are signed by direction',()=>{assert.equal(batteryWatts(50,10,0),500);assert.equal(batteryWatts(50,0,10),-500);assert.equal(batteryWatts(null,1,1),0);});
test('snapshot derives battery power and grid outage',()=>{
 const s=toSnapshot([{metric:'solar_power',value:1000},{metric:'battery_voltage',value:50},{metric:'battery_discharge_current',value:4},{metric:'grid_voltage',value:0}],'2026-10-12T10:00:00Z',true,'Battery');
 assert.equal(s.battery,-200);assert.equal(s.gridDown,true);assert.equal(s.solar,1000);
});
test('motion curves rise with power',()=>{assert.ok(particleSpeed(4000)>particleSpeed(50));assert.ok(particleCount(4000)>particleCount(50));assert.ok(particleCount(1e6)<=14);assert.ok(ringPeriod(4000)<ringPeriod(0));});
test('poll waits for the next collection but never under a minute',()=>{
 const now=Date.parse('2026-10-12T10:10:00Z');
 assert.equal(nextPollDelay('2026-10-12T10:09:00Z',now),60_000*4+20_000);
 assert.equal(nextPollDelay('2026-10-12T10:04:50Z',now),60_000);
 assert.equal(nextPollDelay(null,now),60_000);
});
test('battery statistics count cycles, warranty use and estimate health from deep days',()=>{
 const {batteryStats}=require('../lib/battery-stats.ts');
 const day=(i,c,d,s,e)=>({date:'2026-10-0'+i,coveredHours:23,partial:false,chargedKwh:c,dischargedKwh:d,homeKwh:5,directSolarKwh:2,inverterGridKwh:1,socMin:Math.min(s,e),socMax:Math.max(s,e),socStart:s,socEnd:e,peakSolarW:1500,meterGridKwh:1.2});
 const stats=batteryStats([day(1,4,3,40,60),day(2,5,3,30,70),day(3,3,2.5,50,60),day(4,4.5,3,30,70)],5.2);
 assert.equal(stats.trackedDays,4);
 assert.ok(Math.abs(stats.cycles-11.5/5.2)<1e-9);
 assert.ok(stats.cyclesRemaining<3000&&stats.cyclesRemaining>2990);
 assert.equal(stats.health.samples,3);
 assert.ok(stats.health.pct>0&&stats.health.pct<=100);
 assert.equal(batteryStats([day(1,4,3,40,60)],5.2).health,null);
});
test('battery statistics ignore days before the battery was installed',()=>{
 const {batteryStats}=require('../lib/battery-stats.ts');
 const day=(date,d)=>({date,coveredHours:23,partial:false,chargedKwh:d,dischargedKwh:d,homeKwh:5,directSolarKwh:2,inverterGridKwh:1,socMin:20,socMax:90,socStart:30,socEnd:80,peakSolarW:1500,meterGridKwh:1});
 const stats=batteryStats([day('2026-07-30',500),day('2026-08-07',500),day('2026-08-08',5.2),day('2026-08-09',5.2)],5.2,'2026-08-08');
 assert.equal(stats.trackedDays,2);assert.equal(stats.since,'2026-08-08');assert.ok(Math.abs(stats.cycles-2)<1e-9);
});
