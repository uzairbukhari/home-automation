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
