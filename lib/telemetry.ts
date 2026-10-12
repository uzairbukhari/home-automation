import { actualSolarReport, actualSummary } from './actual-energy';
import { database } from './jobs';
import { localDate, shiftDate } from './measurements';
import { decodeTuya } from './tuya-format';
import type { TuyaCapability } from './providers/tuya';
import { energyReport, type SolarPoint } from './solar-energy';

export type MetricSummary = { unit: string; min: number | null; max: number | null; integral: number; hours: number; onHours: number; first: number | null; last: number | null };
export type DailySummary = { metrics: Record<string,MetricSummary>; hours: Array<Record<string,{integral:number;hours:number;onHours:number}>>; socHours: number[]; energyKwh: number | null; energySource: 'counter'|'integrated'|'missing'; energyHours: number; counterHours?:number; partial: boolean; samples: number; report?:ReturnType<typeof energyReport> };
type State = {code:string;value:unknown;numeric:number|null;unit:string;stamp:number;room:string};
const empty = ():DailySummary => ({metrics:{},hours:Array.from({length:24},()=>({})),socHours:Array(101).fill(0),energyKwh:null,energySource:'missing',energyHours:0,partial:true,samples:0});
// Tuya add_ele reports increments, not a cumulative meter register. Polling
// cannot distinguish repeated increments; use verified power for those devices.
const counterCodes = ['total_forward_energy','forward_energy_total'];
const metric = (unit:string):MetricSummary => ({unit,min:null,max:null,integral:0,hours:0,onHours:0,first:null,last:null});
export function summarizeStates(states:State[], date:string) {
  const start=Date.parse(`${date}T00:00:00+05:00`),end=start+86400000,rooms=new Map<string,DailySummary>(),codes=new Map<string,State[]>();
  for(const p of states) { if(!Number.isFinite(p.stamp))continue; codes.set(p.code,[...(codes.get(p.code)??[]),p]); if(p.stamp>=start&&p.stamp<end){const d=rooms.get(p.room)??empty();rooms.set(p.room,d);d.samples++;const m=d.metrics[p.code]??=metric(p.unit);if(p.numeric!==null){m.min=m.min===null?p.numeric:Math.min(m.min,p.numeric);m.max=m.max===null?p.numeric:Math.max(m.max,p.numeric);m.first??=p.numeric;m.last=p.numeric;}} }
  const counterTotals=new Map<string,Record<string,number>>();
  for(const [code,points] of codes) {
    const sorted=[...new Map(points.map(p=>[p.stamp,p])).values()].sort((a,b)=>a.stamp-b.stamp);
    for(let i=1;i<sorted.length;i++){
      const a=sorted[i-1],b=sorted[i],gap=b.stamp-a.stamp;
      if(gap<=0||gap>900000||a.unit!==b.unit)continue;
      const left=Math.max(start,a.stamp),right=Math.min(end,b.stamp);if(right<=left)continue;
      const d=rooms.get(a.room)??empty();rooms.set(a.room,d);const m=d.metrics[code]??=metric(a.unit);
      for(let stamp=left;stamp<right;){const hour=Math.floor((stamp-start)/3600000),until=Math.min(right,start+(hour+1)*3600000),hours=(until-stamp)/3600000;
        const h=d.hours[hour][code]??={integral:0,hours:0,onHours:0};
        if(a.numeric!==null&&b.numeric!==null){const at=(t:number)=>a.numeric!+(b.numeric!-a.numeric!)*(t-a.stamp)/gap,amount=(at(stamp)+at(until))/2*hours;m.integral+=amount;m.hours+=hours;h.integral+=amount;h.hours+=hours;
          if(counterCodes.includes(code)&&a.unit==='kWh'&&a.numeric>=0&&b.numeric>=a.numeric&&localDate(a.stamp)===localDate(b.stamp)){const delta=b.numeric-a.numeric;const totals=counterTotals.get(a.room)??{};totals[code]=(totals[code]??0)+delta*(until-stamp)/gap;counterTotals.set(a.room,totals);}
        }
        if(typeof a.value==='boolean'){m.onHours+=a.value?hours:0;h.onHours+=a.value?hours:0;if(a.numeric===null){m.hours+=hours;h.hours+=hours;}}
        stamp=until;
      }
    }
  }
  for(const [room,d] of rooms){const total=counterTotals.get(room),counter=counterCodes.find(code=>total?.[code]!==undefined);
    if(counter){d.energyKwh=total![counter];d.energySource='counter';d.energyHours=d.metrics[counter].hours;}
    const elapsed=date===localDate()?Math.min(24,(Date.now()-start)/3600000):24;d.partial=d.energyHours<elapsed-.25;
  }
  return rooms;
}
async function writeSummary(source:string,entity:string,date:string,room:string,data:DailySummary){
  const db=database(),now=new Date().toISOString(),statements=[db.prepare('INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES (?,?,\'day\',?,?,?,?,3) ON CONFLICT(source,entity_id,granularity,period,room) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,calculation_version=excluded.calculation_version WHERE telemetry_summaries.data<>excluded.data OR telemetry_summaries.calculation_version<>excluded.calculation_version').bind(source,entity,date,room,JSON.stringify(data),now)];
  if(date>=shiftDate(localDate(),-90))for(let hour=0;hour<24;hour++)if(Object.keys(data.hours[hour]).length)statements.push(db.prepare('INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES (?,?,\'hour\',?,?,?,?,3) ON CONFLICT(source,entity_id,granularity,period,room) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,calculation_version=excluded.calculation_version WHERE telemetry_summaries.data<>excluded.data OR telemetry_summaries.calculation_version<>excluded.calculation_version').bind(source,entity,`${date}T${String(hour).padStart(2,'0')}`,room,JSON.stringify(data.hours[hour]),now));
  await db.batch(statements);
}
export async function summarizeTuyaDay(deviceId:string,date:string){
  const db=database(),start=Date.parse(`${date}T00:00:00+05:00`),catalog=await db.prepare('SELECT capabilities,room FROM device_catalog WHERE id=?').bind(deviceId).first<{capabilities:string;room:string}>();if(!catalog)throw new Error('Device metadata is unavailable');
  const caps=JSON.parse(catalog.capabilities) as TuyaCapability[],left=new Date(start-900000).toISOString(),right=new Date(start+86400000+900000).toISOString(),rows=await db.prepare("SELECT code,value_json,source_timestamp FROM tuya_device_state WHERE device_id=? AND source_timestamp>=? AND source_timestamp<=? UNION ALL SELECT code,value_json,observed_at source_timestamp FROM tuya_observations WHERE device_id=? AND observed_at>=? AND observed_at<=? AND quality='good' ORDER BY source_timestamp").bind(deviceId,left,right,deviceId,left,right).all<{code:string;value_json:string;source_timestamp:string}>();
  const versions=await db.prepare('SELECT effective_at,data FROM capability_versions WHERE device_id=? ORDER BY effective_at').bind(deviceId).all<{effective_at:string;data:string}>();
  const assignments=await db.prepare('SELECT effective_at,room FROM device_room_history WHERE device_id=? ORDER BY effective_at').bind(deviceId).all<{effective_at:string;room:string}>();
  const states:State[]=rows.results.map(r=>{const value=JSON.parse(r.value_json),version=versions.results.findLast(v=>v.effective_at<=r.source_timestamp),metadata=version?JSON.parse(version.data) as TuyaCapability[]:caps,decoded=decodeTuya(value,metadata.find(c=>c.code===r.code));return{code:r.code,value,numeric:decoded.numericValue,unit:decoded.unit,stamp:Date.parse(r.source_timestamp),room:assignments.results.findLast(a=>a.effective_at<=r.source_timestamp)?.room??catalog.room??'Unassigned'};});
  // Carry the boundary observations in permanent summaries so pruning a prior day
  // cannot erase the first interval of the following day's integration.
  const prior=await db.prepare("SELECT data FROM telemetry_summaries WHERE source='tuya' AND entity_id=? AND granularity='day' AND period=?").bind(deviceId,shiftDate(date,-1)).all<{data:string}>();
  for(const row of prior.results)states.unshift(...((JSON.parse(row.data) as {anchors?:State[]}).anchors??[]));
  const anchors=[...new Map(states.filter(p=>p.stamp<start+86400000).sort((a,b)=>a.stamp-b.stamp).map(p=>[p.code,p])).values()];
  for(const [room,data] of summarizeStates(states,date))await writeSummary('tuya',deviceId,date,room,Object.assign(data,{anchors:anchors.filter(p=>p.room===room)}));
  return rows.results.length;
}
export async function summarizeSolarDay(entityId:string,date:string){
  const db=database(),start=Date.parse(`${date}T00:00:00+05:00`),rows=await db.prepare('SELECT data FROM solar_samples WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<=? ORDER BY source_timestamp').bind(entityId,new Date(start-900000).toISOString(),new Date(start+86400000).toISOString()).all<{data:string}>(),points=rows.results.map(r=>JSON.parse(r.data) as SolarPoint);
  const prior=await db.prepare("SELECT data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity='day' AND period=?").bind(entityId,shiftDate(date,-1)).first<{data:string}>();
  const anchor=prior?(JSON.parse(prior.data) as {anchor?:SolarPoint}).anchor:undefined;
  if(anchor&&!points.some(p=>p.sourceTimestamp===anchor.sourceTimestamp))points.unshift(anchor);
  if(!points.length)return;
  const d=empty(),inside=points.filter(p=>Date.parse(p.sourceTimestamp)>=start&&Date.parse(p.sourceTimestamp)<start+86400000);d.report=actualSolarReport(energyReport(inside));d.energyKwh=d.report.solarKwh;d.energySource=d.report.solarSource;d.energyHours=d.report.coveredHours;d.partial=d.report.partial;d.samples=inside.length;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],left=Math.max(start,Date.parse(a.sourceTimestamp)),right=Math.min(start+86400000,Date.parse(b.sourceTimestamp));if(right<=left||Date.parse(b.sourceTimestamp)-Date.parse(a.sourceTimestamp)>900000)continue;for(let t=left;t<right;){const hour=Math.floor((t-start)/3600000),until=Math.min(right,start+(hour+1)*3600000),hours=(until-t)/3600000;
      for(const key of ['solar','home','grid','battery'] as const){if(a[key]==null||b[key]==null)continue;const m=d.metrics[key]??=metric(key==='battery'?'%':'W'),h=d.hours[hour][key]??={integral:0,hours:0,onHours:0},value=(a[key]!+b[key]!)/2;m.integral+=value*hours;m.hours+=hours;h.integral+=value*hours;h.hours+=hours;m.min=m.min===null?Math.min(a[key]!,b[key]!):Math.min(m.min,a[key]!,b[key]!);m.max=m.max===null?Math.max(a[key]!,b[key]!):Math.max(m.max,a[key]!,b[key]!);}
      if(a.battery!=null&&a.battery>=0&&a.battery<=100)d.socHours[Math.round(a.battery)]+=hours;t=until;
    }}
  await writeSummary('dessmonitor',entityId,date,'',Object.assign(d,{anchor:points.filter(p=>Date.parse(p.sourceTimestamp)<start+86400000).at(-1)}));
}
export async function rebuildLongPeriods(source:string,entity:string){
  const db=database(),rows=await db.prepare("SELECT period,room,data,calculation_version FROM telemetry_summaries WHERE source=? AND entity_id=? AND granularity='day' ORDER BY period").bind(source,entity).all<{period:string;room:string;data:string;calculation_version:number}>(),statements:D1PreparedStatement[]=[];
  for(const [granularity,length] of [['month',7],['year',4]] as const){const groups=new Map<string,{period:string;room:string;days:DailySummary[]}>();for(const row of rows.results){const period=row.period.slice(0,length),key=period+'|'+row.room,g=groups.get(key)??{period,room:row.room,days:[]};g.days.push(actualSummary(JSON.parse(row.data),row.calculation_version));groups.set(key,g);}for(const g of groups.values()){
    const totals={energyKwh:g.days.some(d=>d.energyKwh!==null)?g.days.reduce((n,d)=>n+(d.energyKwh??0),0):null,energyHours:g.days.reduce((n,d)=>n+d.energyHours,0),samples:g.days.reduce((n,d)=>n+d.samples,0),partial:g.days.some(d=>d.partial),days:g.days.length};
    statements.push(db.prepare('INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES (?,?,?,?,?,?,?,3) ON CONFLICT(source,entity_id,granularity,period,room) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,calculation_version=excluded.calculation_version WHERE telemetry_summaries.data<>excluded.data OR telemetry_summaries.calculation_version<>excluded.calculation_version').bind(source,entity,granularity,g.period,g.room,JSON.stringify(totals),new Date().toISOString()));
  }}
  for(let i=0;i<statements.length;i+=80)await db.batch(statements.slice(i,i+80));
}
// Bounded migration/retention work: only delete the day just verified. Interrupted work resumes.
export async function retentionStep(){
  const db=database(),cutoff=shiftDate(localDate(),-90),cutoffStamp=new Date(`${cutoff}T00:00:00+05:00`).toISOString();
  const old=await db.prepare("SELECT 'tuya' source,device_id entity_id,MIN(source_timestamp) stamp FROM tuya_device_state WHERE source_timestamp<? GROUP BY device_id UNION ALL SELECT 'tuya',device_id,MIN(observed_at) FROM tuya_observations WHERE observed_at<? GROUP BY device_id UNION ALL SELECT 'dessmonitor',entity_id,MIN(source_timestamp) FROM solar_samples WHERE source_timestamp<? GROUP BY entity_id ORDER BY stamp LIMIT 1").bind(cutoffStamp,cutoffStamp,cutoffStamp).first<{source:string;entity_id:string;stamp:string}>();
  if(old){const date=localDate(old.stamp);if(old.source==='tuya')await summarizeTuyaDay(old.entity_id,date);else await summarizeSolarDay(old.entity_id,date);await rebuildLongPeriods(old.source,old.entity_id);
    const verified=await db.prepare("SELECT COUNT(*) n FROM telemetry_summaries WHERE source=? AND entity_id=? AND granularity='day' AND period=?").bind(old.source,old.entity_id,date).first<{n:number}>();if(!verified?.n)throw new Error('Retention blocked: daily summary is not verified');
    const left=new Date(`${date}T00:00:00+05:00`).toISOString(),right=new Date(`${shiftDate(date,1)}T00:00:00+05:00`).toISOString();
    if(old.source==='tuya'){await db.batch([db.prepare('DELETE FROM tuya_device_state WHERE device_id=? AND source_timestamp>=? AND source_timestamp<?').bind(old.entity_id,left,right),db.prepare('DELETE FROM tuya_observations WHERE device_id=? AND observed_at>=? AND observed_at<?').bind(old.entity_id,left,right)]);}else {await db.prepare('DELETE FROM solar_samples WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<?').bind(old.entity_id,left,right).run();await db.prepare('DELETE FROM solar_raw_fields WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<?').bind(old.entity_id,left,right).run();}
  }
  await db.prepare("DELETE FROM telemetry_summaries WHERE granularity='hour' AND period<?").bind(cutoff).run();
  return{summarized:old??null,cutoff};
}
// One recoverable day per maintenance pass; old derived rows remain in upgrade_backup.
export async function repairActualEnergyStep(){
 const db=database(),row=await db.prepare("SELECT source,entity_id,period FROM telemetry_summaries WHERE granularity='day' AND calculation_version<3 ORDER BY period DESC LIMIT 1").first<{source:string;entity_id:string;period:string}>();
 if(!row)return {status:'complete'};
 const left=new Date(`${row.period}T00:00:00+05:00`).toISOString(),right=new Date(`${shiftDate(row.period,1)}T00:00:00+05:00`).toISOString();
 const count=row.source==='tuya'?await db.prepare('SELECT (SELECT COUNT(*) FROM tuya_device_state WHERE device_id=? AND source_timestamp>=? AND source_timestamp<?)+(SELECT COUNT(*) FROM tuya_observations WHERE device_id=? AND observed_at>=? AND observed_at<?) n').bind(row.entity_id,left,right,row.entity_id,left,right).first<{n:number}>():await db.prepare('SELECT COUNT(*) n FROM solar_samples WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<?').bind(row.entity_id,left,right).first<{n:number}>();
 if(count?.n){if(row.source==='tuya')await summarizeTuyaDay(row.entity_id,row.period);else await summarizeSolarDay(row.entity_id,row.period);}
 // Unrecoverable legacy estimates remain inspectable in backup, but cannot appear as actual energy.
 const remaining=await db.prepare("SELECT room,data FROM telemetry_summaries WHERE source=? AND entity_id=? AND granularity='day' AND period=? AND calculation_version<3").bind(row.source,row.entity_id,row.period).all<{room:string;data:string}>();
 for(const old of remaining.results)await db.prepare("UPDATE telemetry_summaries SET data=?,calculation_version=3 WHERE source=? AND entity_id=? AND granularity='day' AND period=? AND room=?").bind(JSON.stringify(actualSummary(JSON.parse(old.data),2)),row.source,row.entity_id,row.period,old.room).run();
 await rebuildLongPeriods(row.source,row.entity_id);
 return {status:count?.n?'recalculated':'raw_unavailable',...row};
}
