/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {parseHours,hourlyByDay}=require('../lib/device-hourly.ts');
test('parseHours accepts a wrapped or bare map and drops junk',()=>{
 assert.deepEqual(parseHours({hours:{'2026101300':'0','2026101301':'12','bad':'1','2026101302':''}}),{'2026101300':0,'2026101301':12});
 assert.deepEqual(parseHours({'2026101300':5}),{'2026101300':5});
 assert.deepEqual(parseHours(null),{});
});
test('stored hourly documents come back by day',async()=>{
 const {sqlite}=database();
 const ins=sqlite.prepare("INSERT INTO provider_documents(provider,entity_id,dataset,data,first_seen_at,updated_at) VALUES ('tuya','plug',?,?,'x','x')");
 ins.run('energy-hours:2026-10-12',JSON.stringify({'07':0.2}));ins.run('energy-hours:2026-09-01','{}');
 assert.deepEqual(await hourlyByDay('plug','2026-10-01','2026-10-13'),{'2026-10-12':{'07':0.2}});
 sqlite.close();
});
