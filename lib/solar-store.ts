import { appDb } from './db';
import { actualSolarReport } from './actual-energy';
import { DessMonitorProvider, type DessSnapshot, type ProviderPeriods } from './providers/dessmonitor';
import { energyReport, sortedPoints, type SolarPoint, type EnergyBucket, type EnergyReport } from './solar-energy';
import { localDate, shiftDate } from './measurements';
import { summarizeSolarDay } from './telemetry';

function db(){if(!appDb())throw new Error('Solar history storage is unavailable');return appDb();}
async function batch(statements:DbStatement[]){for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));}
// Only rows that are new or changed are written: a five-minute collection re-reads the whole day
// from DessMonitor, and rewriting identical rows is what exhausted the free write allowance.
export async function saveSamples(entityId:string,points:SolarPoint[]){
 const sorted=sortedPoints(points);if(!sorted.length)return 0;
 const known=new Map<string,string>();
 for(const date of new Set(sorted.map(p=>localDate(p.sourceTimestamp)))){
  const rows=await db().prepare('SELECT source_timestamp,data FROM solar_samples WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<?').bind(entityId,new Date(`${date}T00:00:00+05:00`).toISOString(),new Date(`${shiftDate(date,1)}T00:00:00+05:00`).toISOString()).all<{source_timestamp:string;data:string}>();
  for(const row of rows.results)known.set(row.source_timestamp,row.data);
 }
 const changed=sorted.filter(point=>known.get(point.sourceTimestamp)!==JSON.stringify(point));
 await batch(changed.map(point=>db().prepare('INSERT INTO solar_samples (entity_id,source_timestamp,data) VALUES (?,?,?) ON CONFLICT(entity_id,source_timestamp) DO UPDATE SET data=excluded.data').bind(entityId,point.sourceTimestamp,JSON.stringify(point))));
 const dates=new Set(changed.map(p=>localDate(p.sourceTimestamp)));
 for(const date of dates){
  const full=await storedSamples(entityId,date,date),report=actualSolarReport(energyReport(full)),partial=report.partial||report.coveredHours<(date===localDate()?elapsedToday():23.5);
  await db().prepare(`INSERT INTO solar_energy_periods (entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial,report_json) VALUES (?,'day',?,?,?,?,?,?,?,?,?) ON CONFLICT(entity_id,period_type,period) DO UPDATE SET solar_kwh=CASE WHEN solar_energy_periods.solar_source LIKE 'provider:%' THEN solar_energy_periods.solar_kwh ELSE excluded.solar_kwh END,grid_kwh=CASE WHEN solar_energy_periods.grid_source LIKE 'provider:%' THEN solar_energy_periods.grid_kwh ELSE excluded.grid_kwh END,home_kwh=excluded.home_kwh,solar_source=CASE WHEN solar_energy_periods.solar_source LIKE 'provider:%' THEN solar_energy_periods.solar_source ELSE excluded.solar_source END,grid_source=CASE WHEN solar_energy_periods.grid_source LIKE 'provider:%' THEN solar_energy_periods.grid_source ELSE excluded.grid_source END,covered_hours=excluded.covered_hours,partial=excluded.partial,report_json=excluded.report_json,updated_at=CURRENT_TIMESTAMP`).bind(entityId,date,report.solarKwh,report.gridKwh,report.homeKwh,report.solarSource,report.gridKwh===null?'missing':'integrated',report.coveredHours,partial?1:0,JSON.stringify({...report,partial})).run();
 }
 for(const date of dates)await summarizeSolarDay(entityId,date);
 if(dates.size)await rebuildPeriods(entityId);
 return changed.length;
}
function elapsedToday(){return(Date.now()-Date.parse(`${localDate()}T00:00:00+05:00`))/3_600_000;}
export async function storedSamples(entityId:string,from:string,to:string){
 const rows=await db().prepare('SELECT data FROM solar_samples WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<? ORDER BY source_timestamp').bind(entityId,new Date(`${from}T00:00:00+05:00`).toISOString(),new Date(`${shiftDate(to,1)}T00:00:00+05:00`).toISOString()).all<{data:string}>();
 return rows.results.map(row=>JSON.parse(row.data) as SolarPoint);
}
export async function saveProviderPeriods(data:ProviderPeriods){
 await batch(data.buckets.map(b=>db().prepare(`INSERT INTO solar_energy_periods (entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entity_id,period_type,period) DO UPDATE SET solar_kwh=excluded.solar_kwh,solar_source=excluded.solar_source,grid_kwh=COALESCE(excluded.grid_kwh,solar_energy_periods.grid_kwh),grid_source=CASE WHEN excluded.grid_kwh IS NOT NULL THEN excluded.grid_source ELSE solar_energy_periods.grid_source END,updated_at=CURRENT_TIMESTAMP`).bind(data.entityId,data.type,b.date,b.solar,b.grid,b.home,b.source,b.gridSource,b.coveredHours,b.partial?1:0)));
}
async function rebuildPeriods(entityId:string){
 for(const [type,length] of [['month',7],['year',4]] as const)await db().prepare(`INSERT INTO solar_energy_periods (entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial) SELECT entity_id,?,substr(period,1,?),SUM(CASE WHEN solar_source LIKE 'provider:%' OR solar_source='counter' THEN solar_kwh END),SUM(CASE WHEN grid_source LIKE 'provider:%' THEN grid_kwh END),NULL,'counter','measured-days',SUM(covered_hours),1 FROM solar_energy_periods WHERE entity_id=? AND period_type='day' GROUP BY entity_id,substr(period,1,?) ON CONFLICT(entity_id,period_type,period) DO UPDATE SET solar_kwh=CASE WHEN solar_energy_periods.solar_source LIKE 'provider:%' THEN solar_energy_periods.solar_kwh ELSE excluded.solar_kwh END,solar_source=CASE WHEN solar_energy_periods.solar_source LIKE 'provider:%' THEN solar_energy_periods.solar_source ELSE excluded.solar_source END,grid_kwh=CASE WHEN solar_energy_periods.grid_source LIKE 'provider:%' THEN solar_energy_periods.grid_kwh ELSE excluded.grid_kwh END,grid_source=CASE WHEN solar_energy_periods.grid_source LIKE 'provider:%' THEN solar_energy_periods.grid_source ELSE excluded.grid_source END,home_kwh=excluded.home_kwh,covered_hours=excluded.covered_hours,updated_at=CURRENT_TIMESTAMP`).bind(type,length,entityId,length).run();
}
type PeriodRow={period:string;solar_kwh:number|null;grid_kwh:number|null;home_kwh:number|null;solar_source:string;grid_source:string;covered_hours:number;partial:number;report_json:string|null;updated_at:string};
export async function storedPeriods(entityId:string,type:'day'|'month'|'year',from='',to='9999'){
 const rows=await db().prepare('SELECT * FROM solar_energy_periods WHERE entity_id=? AND period_type=? AND period>=? AND period<=? ORDER BY period').bind(entityId,type,from,to).all<PeriodRow>();
 return rows.results.map(row=>({date:row.period,solar:row.solar_source.startsWith('provider:')||row.solar_source==='counter'?row.solar_kwh:null,grid:row.grid_source.startsWith('provider:')||row.grid_source==='measured-days'?row.grid_kwh:null,home:null,source:row.solar_source,gridSource:row.grid_source,coveredHours:row.covered_hours,partial:Boolean(row.partial),report:row.report_json?actualSolarReport(JSON.parse(row.report_json) as EnergyReport):null,updatedAt:row.updated_at}));
}
export async function saveRawFields(entityId:string,rawFields:NonNullable<DessSnapshot['rawFields']>){
 if(!rawFields.length)return;
 const known=new Map<string,string>();
 for(const date of new Set(rawFields.map(item=>localDate(item.sourceTimestamp)))){
  const rows=await db().prepare('SELECT source_timestamp,data FROM solar_raw_fields WHERE entity_id=? AND source_timestamp>=? AND source_timestamp<?').bind(entityId,new Date(`${date}T00:00:00+05:00`).toISOString(),new Date(`${shiftDate(date,1)}T00:00:00+05:00`).toISOString()).all<{source_timestamp:string;data:string}>();
  for(const row of rows.results)known.set(row.source_timestamp,row.data);
 }
 await batch(rawFields.filter(item=>known.get(item.sourceTimestamp)!==JSON.stringify(item.fields)).map(item=>db().prepare('INSERT INTO solar_raw_fields(entity_id,source_timestamp,data,collected_at) VALUES (?,?,?,?) ON CONFLICT(entity_id,source_timestamp) DO UPDATE SET data=excluded.data,collected_at=excluded.collected_at WHERE solar_raw_fields.data!=excluded.data').bind(entityId,item.sourceTimestamp,JSON.stringify(item.fields),new Date().toISOString())));
}
export async function saveSnapshot(snapshot:DessSnapshot){
 await saveSamples(snapshot.device.serial,snapshot.series);
 await saveRawFields(snapshot.device.serial,snapshot.rawFields??[]);
 await db().prepare("INSERT INTO device_catalog (id,source,name,category,online,capabilities) VALUES (?,'dessmonitor',?,'inverter',1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,capabilities=excluded.capabilities,updated_at=CURRENT_TIMESTAMP").bind(snapshot.device.serial,snapshot.device.name,JSON.stringify({...snapshot,series:[],rawFields:undefined})).run();
}
export async function cachedSnapshot(preserveQuality=false,includeSeries=true):Promise<DessSnapshot|null>{
 const row=await db().prepare("SELECT capabilities FROM device_catalog WHERE source='dessmonitor' ORDER BY updated_at DESC LIMIT 1").first<{capabilities:string}>();if(!row)return null;
 const snapshot=JSON.parse(row.capabilities) as DessSnapshot;
 return{...snapshot,readings:preserveQuality?snapshot.readings:snapshot.readings.map(r=>({...r,quality:r.value===null?'missing':'stale'})),series:includeSeries?await storedSamples(snapshot.device.serial,localDate(),localDate()):[]};
}
export async function syncPeriods(provider:DessMonitorProvider,year:string,month=localDate().slice(0,7)){
 const errors:string[]=[];
 const results=await Promise.allSettled([provider.getEnergyPeriods('year'),provider.getEnergyPeriods('month',year),provider.getEnergyPeriods('day',month)]);
 for(const result of results){if(result.status==='fulfilled')await saveProviderPeriods(result.value);else errors.push(result.reason instanceof Error?result.reason.message:'Period totals unavailable');}
 return errors;
}
export async function collectionHealth(){return db().prepare("SELECT started_at,finished_at,status,samples,error,(SELECT MAX(finished_at) FROM solar_collection_runs WHERE status='success') last_success_at FROM solar_collection_runs ORDER BY id DESC LIMIT 1").first();}
export async function collectSolar(){
 const provider=new DessMonitorProvider(),entity=(await provider.getIdentity()).serial,now=new Date().toISOString(),lease=crypto.randomUUID();
 await db().prepare('INSERT OR IGNORE INTO solar_sync_state (entity_id) VALUES (?)').bind(entity).run();
 const claimed=await db().prepare("UPDATE solar_sync_state SET lease_until=?,lease_token=? WHERE entity_id=? AND (lease_until IS NULL OR julianday(lease_until)<julianday(?)) RETURNING next_backfill_date,oldest_date,recovered_through").bind(new Date(Date.now()+10*60_000).toISOString(),lease,entity,now).first<{next_backfill_date:string|null;oldest_date:string|null;recovered_through:string|null}>();
 if(!claimed)return{status:'already_running'};
 await db().prepare("UPDATE solar_collection_runs SET status='failed',finished_at=CURRENT_TIMESTAMP,error='Collection interrupted; safe to retry' WHERE status='running' AND julianday(started_at)<julianday('now','-10 minutes')").run();
 const run=await db().prepare("INSERT INTO solar_collection_runs (started_at,status) VALUES (?,'running') RETURNING id").bind(now).first<{id:number}>();
 let samples=0;
 try{
  const snapshot=await provider.getSnapshot();await saveSnapshot(snapshot);samples+=snapshot.series.length;
  const current=localDate(),from=claimed.recovered_through??shiftDate(current,-2),to=[shiftDate(from,2),current].sort()[0];
  const recovery=await provider.getHistory(from,to,'raw');samples+=await saveSamples(entity,recovery.series);
  await db().prepare('UPDATE solar_sync_state SET recovered_through=? WHERE entity_id=? AND lease_token=?').bind(to,entity,lease).run();
  const periodErrors=await syncPeriods(provider,current.slice(0,4));
  const years=await storedPeriods(entity,'year'),oldest=claimed.oldest_date??`${years[0]?.date??current.slice(0,4)}-01-01`,next=claimed.next_backfill_date??shiftDate(current,-1);
  if(next>=oldest){const history=await provider.getHistory(next,next,'raw');samples+=await saveSamples(entity,history.series);await db().prepare('UPDATE solar_sync_state SET next_backfill_date=?,oldest_date=? WHERE entity_id=? AND lease_token=?').bind(shiftDate(next,-1),oldest,entity,lease).run();}
  await db().prepare("UPDATE solar_collection_runs SET status=?,finished_at=CURRENT_TIMESTAMP,samples=?,error=? WHERE id=?").bind(periodErrors.length?'partial':'success',samples,periodErrors.join('; ')||null,run?.id).run();
  return{status:periodErrors.length?'partial':'completed',samples,periodErrors,backfillThrough:next,oldestDate:oldest};
 }catch(error){await db().prepare("UPDATE solar_collection_runs SET status='failed',finished_at=CURRENT_TIMESTAMP,samples=?,error=? WHERE id=?").bind(samples,error instanceof Error?error.message:'Collection failed',run?.id).run();throw error;}
 finally{await db().prepare('UPDATE solar_sync_state SET lease_until=NULL,lease_token=NULL WHERE entity_id=? AND lease_token=?').bind(entity,lease).run();}
}
export function sumReports(reports:EnergyReport[]):EnergyReport{
 const empty=energyReport([]);if(!reports.length)return empty;
 const result={...empty};
 for(const key of ['solarKwh','homeKwh','gridKwh','directSolarKwh','batteryChargeKwh','batteryDischargeKwh','hoursAtReserve'] as const){const values=reports.map(r=>r[key]).filter((n):n is number=>n!==null);result[key]=values.length?values.reduce((a,b)=>a+b,0):null;}
 for(const key of ['peakSolarW','peakHomeW','socMax','socMin'] as const){const values=reports.map(r=>r[key]).filter((n):n is number=>n!==null);result[key]=values.length?(key==='socMin'?Math.min(...values):Math.max(...values)):null;}
 result.samples=reports.reduce((n,r)=>n+r.samples,0);result.coveredHours=reports.reduce((n,r)=>n+r.coveredHours,0);result.partial=reports.some(r=>r.partial);result.solarSource=reports.every(r=>r.solarSource==='counter')?'counter':'integrated';return result;
}
export function asBuckets(rows:Awaited<ReturnType<typeof storedPeriods>>):EnergyBucket[]{return rows.map(({date,solar,grid,home,source,gridSource,coveredHours,partial})=>({date,solar,grid,home,source,gridSource,coveredHours,partial}));}
export function calendarMonths(rows:Awaited<ReturnType<typeof storedPeriods>>,year:string):EnergyBucket[]{const buckets=asBuckets(rows);return Array.from({length:12},(_,i)=>{const date=year+'-'+String(i+1).padStart(2,'0');return buckets.find(b=>b.date===date)??{date,solar:null,grid:null,home:null,source:'missing',gridSource:'missing',coveredHours:0,partial:true};});}
