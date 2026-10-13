/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {writeCounterDays,counterDaily,gridMeter}=require('../lib/meter-history.ts');
test('meter register becomes daily grid import regardless of reporting gaps',async()=>{
 const {sqlite}=database();
 sqlite.prepare("INSERT INTO device_catalog(id,source,name,category,capabilities) VALUES ('meter','tuya','WIFI Smart Meter Pro','dlq','[]')").run();
 const insert=sqlite.prepare("INSERT INTO tuya_device_state(device_id,code,value_json,value_type,numeric_value,unit,source_timestamp) VALUES ('meter','forward_energy_total','0','number',?,'kWh',?)");
 // Local days are Asia/Karachi (UTC+5): 2026-10-10 starts at 2026-10-09T19:00Z.
 for(const [v,t] of [[100,'2026-10-09T20:00:00Z'],[100.4,'2026-10-10T10:00:00Z'],[101,'2026-10-10T18:00:00Z'],[101,'2026-10-10T20:00:00Z'],[102.5,'2026-10-11T17:00:00Z']])insert.run(v,t);
 assert.equal((await gridMeter()).name,'WIFI Smart Meter Pro');
 assert.equal(await writeCounterDays('meter','forward_energy_total','2026-10-10'),2);
 const days=await counterDaily('meter','2026-10-10','2026-10-12');
 assert.ok(Math.abs(days.get('2026-10-10')-1)<1e-9); // no earlier day: highest minus lowest
 assert.ok(Math.abs(days.get('2026-10-11')-1.5)<1e-9);
 sqlite.close();
});
test('Tuya daily statistics fill device energy where no verified energy row exists',async()=>{
 const {sqlite}=database(),{deviceEnergy}=require('../lib/device-energy.ts'),{localDate}=require('../lib/measurements.ts');
 sqlite.prepare("INSERT INTO device_catalog(id,source,name,category,capabilities) VALUES ('plug2','tuya','Plug','cz','[]')").run();
 const today=localDate();
 sqlite.prepare("INSERT INTO solar_energy_periods(entity_id,period_type,period,grid_kwh,solar_source,grid_source,covered_hours,partial) VALUES ('plug2','day',?,1.25,'missing','device-statistics',24,0)").run(today);
 const result=await deviceEnergy('plug2','7');
 assert.equal(result.status,'available');
 assert.ok(Math.abs(result.totalKwh-1.25)<1e-9);
 sqlite.close();
});
