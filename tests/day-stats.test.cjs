/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {saveSamples,storedSamples}=require('../lib/solar-store.ts');
const {dayStats,dayStatBackfillStep}=require('../lib/day-stats.ts');
const {inverterDay,storedDayStats,DAYSTAT_VERSION}=require('../lib/day-inverter.ts');
const {localDate,shiftDate}=require('../lib/measurements.ts');
const dayPoints=(date,hours)=>{const start=Date.parse(`${date}T00:00:00+05:00`),out=[];for(let i=0;i<hours*12;i++){const stamp=new Date(start+i*300_000).toISOString(),h=i/12,sun=Math.max(0,Math.sin((h-6)/12*Math.PI))*3000;out.push({time:stamp.slice(11,16),sourceTimestamp:stamp,solar:Math.round(sun),home:800+(i%7)*50,grid:h<6?400:0,battery:Math.round(50+30*Math.sin(h/24*Math.PI*2)),batteryVoltage:52,chargeCurrent:null,dischargeCurrent:null,solarToday:null});}return out;};
test('a finished day is stored once and reads back as the live computation',async()=>{
 const {sqlite}=database();
 try{
  const today=localDate(),day=shiftDate(today,-3),thin=shiftDate(today,-5),yesterdayThin=shiftDate(today,-1);
  sqlite.prepare("INSERT INTO device_catalog(id,source,name,category,capabilities) VALUES ('inv','dessmonitor','Inverter','inverter','{}')").run();
  await saveSamples('inv',[...dayPoints(day,24),...dayPoints(thin,6),...dayPoints(yesterdayThin,6),...dayPoints(today,1)]);
  const rows=sqlite.prepare("SELECT period,calculation_version FROM telemetry_summaries WHERE granularity='daystat' ORDER BY period").all();
  // Complete day and a thin day older than two days are stored; a thin yesterday and today are not.
  assert.deepEqual(rows.map(r=>r.period),[thin,day]);assert.equal(rows[0].calculation_version,DAYSTAT_VERSION);
  const live=inverterDay(day,await storedSamples('inv',day,day)),stored=(await storedDayStats(require('../lib/jobs.ts').database(),'inv',day,day)).get(day);
  assert.deepEqual(stored,live);
  assert.ok(live.coveredHours>=20&&live.homeKwh>0);
  const {days}=await dayStats('inv',thin,today);
  assert.equal(days.length,6);
  assert.deepEqual({...days.find(d=>d.date===day),meterGridKwh:undefined},{...live,meterGridKwh:undefined});
  assert.equal(days.find(d=>d.date===day).meterGridKwh,null);
  assert.ok(days.find(d=>d.date===yesterdayThin).partial);
  // A day with no stored row is computed from the readings and stored for the next request.
  sqlite.prepare("DELETE FROM telemetry_summaries WHERE granularity='daystat'").run();
  const again=await dayStats('inv',day,day);
  assert.deepEqual(again.days[0],{...live,meterGridKwh:null});
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telemetry_summaries WHERE granularity='daystat'").get().n,1);
  // Backfill stores the remaining finished days that have readings.
  const step=await dayStatBackfillStep('inv');
  assert.deepEqual(step.done,[thin]);
 }finally{sqlite.close();}
});
