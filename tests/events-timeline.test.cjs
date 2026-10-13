/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {eventsTimeline,describeEvent}=require('../lib/events-timeline.ts');
test('timeline merges inverter alarms and device events, newest first',async()=>{
 const {sqlite}=database();
 sqlite.prepare("INSERT INTO device_catalog(id,source,name,category,capabilities) VALUES ('plug','tuya','Study plug','cz','[]')").run();
 const insert=sqlite.prepare("INSERT INTO provider_events(provider,entity_id,event_time,kind,code,data) VALUES (?,?,?,?,?,?)");
 const now=Date.now(),hour=3600000,iso=ms=>new Date(now-ms).toISOString();
 insert.run('tuya','plug',iso(3*hour),'2','',JSON.stringify({event_id:2,event_time:now}));
 insert.run('dessmonitor','INV1',iso(hour),'alarm','21',JSON.stringify({code:21,desc:'Battery low'}));
 insert.run('tuya','plug',iso(200*24*hour),'1','',JSON.stringify({event_id:1}));
 const events=await eventsTimeline(30);
 assert.deepEqual(events.map(e=>e.title),['Battery low','Went offline']); // the 200-day-old event is outside the window
 assert.equal(events[1].source,'Study plug');
 assert.equal(events[0].kind,'alarm');
 assert.equal(events[0].detail,'Code 21');
 sqlite.close();
});
test('unknown events still describe themselves',()=>{
 assert.equal(describeEvent({provider:'tuya',kind:'99',code:'',data:'{}'},'Plug').title,'Device event 99');
 assert.equal(describeEvent({provider:'dessmonitor',kind:'alarm',code:'7',data:'not json'},'Inverter').title,'Alarm 7');
});
