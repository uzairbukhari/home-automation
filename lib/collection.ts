import { releaseCheck } from './release-check';
import { providerPolicy } from './provider-policy';
import { claimJob, database, dueWork, finishJob } from './jobs';
import { after } from 'next/server';
import { DessMonitorProvider } from './providers/dessmonitor';
import { TuyaProvider } from './providers/tuya';
import { applyRoomOverrides, collectTuya, storeTuyaLogs } from './tuya-store';
import { cachedSnapshot, saveSnapshot, saveSamples, saveRawFields, syncPeriods } from './solar-store';
import { STORAGE_PRUNE_BYTES, storageBytes } from './backfill-ledger';
import { alarmsUnit, documentsUnit, lookbackDays, tuyaEventsUnit } from './provider-sync';
import { meterHistoryStep } from './meter-history';
import { deviceStatisticsStep } from './device-statistics';
import { evaluateAutomations } from './automations';
import { reconcileCommands } from './commands';
import { evaluateAlerts } from './notifications';
import { localDate, shiftDate } from './measurements';
import { repairActualEnergyStep, rebuildLongPeriods, retentionStep, summarizeTuyaDay } from './telemetry';

async function connection(provider:string,ok:boolean,error?:string){await database().prepare('INSERT INTO connection_state(provider,status,last_success_at,last_error_code,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET status=excluded.status,last_success_at=COALESCE(excluded.last_success_at,connection_state.last_success_at),last_error_code=excluded.last_error_code,updated_at=excluded.updated_at').bind(provider,ok?'connected':'degraded',ok?new Date().toISOString():null,error??null,new Date().toISOString()).run();}
export async function historyUnit(){
  // The backfill takes a few DessMonitor days (~1,500 row writes each) in two of every three 5-minute slots, so years of history arrive within a day or two; Tuya takes the third.
  const db=database(),turn=Math.floor(Date.now()/300000)%3;
  const solarBackfillDay=async():Promise<{status?:string;samples?:number;source?:string;date?:string}>=>{const provider=new DessMonitorProvider(),snapshot=await cachedSnapshot(true,false);if(!snapshot)return{status:'no_solar_metadata'};const entity=snapshot.device.serial,row=await db.prepare('SELECT next_backfill_date FROM solar_sync_state WHERE entity_id=?').bind(entity).first<{next_backfill_date:string|null}>(),date=row?.next_backfill_date??shiftDate(localDate(),-1);let selectedDate=date;for(let days=1;days<=7;days++){const recent=shiftDate(localDate(),-days),covered=await db.prepare("SELECT status FROM history_coverage WHERE source='dessmonitor' AND entity_id=? AND date=?").bind(entity,recent).first();if(!covered){selectedDate=recent;break;}}
    const oldest=(await db.prepare("SELECT MIN(period) date FROM solar_energy_periods WHERE entity_id=? AND period_type='year'").bind(entity).first<{date:string|null}>())?.date??localDate().slice(0,4);if(selectedDate<oldest+'-01-01')return{status:'solar_backfill_complete'};
    const history=await provider.getDay(selectedDate);await saveSamples(entity,history.series);await saveRawFields(entity,history.rawFields);await db.prepare("INSERT INTO history_coverage(source,entity_id,date,status,recorded_at) VALUES ('dessmonitor',?,?,?,?) ON CONFLICT(source,entity_id,date) DO UPDATE SET status=excluded.status,recorded_at=excluded.recorded_at").bind(entity,selectedDate,history.series.length?'available':'missing',new Date().toISOString()).run();
    await db.prepare('INSERT INTO solar_sync_state(entity_id,next_backfill_date) VALUES (?,?) ON CONFLICT(entity_id) DO UPDATE SET next_backfill_date=excluded.next_backfill_date').bind(entity,selectedDate===date?shiftDate(date,-1):date).run();return{source:'dessmonitor',date:selectedDate,samples:history.series.length};
  };
  if(turn!==2){const started=Date.now();let last:{status?:string;samples?:number}={};for(let day=0;day<3&&Date.now()-started<25000;day++){last=await solarBackfillDay();if(last.samples===undefined)break;}return last;}
  const device=await db.prepare("SELECT c.id,c.capabilities FROM device_catalog c LEFT JOIN tuya_sync s ON c.id=s.device_id LEFT JOIN app_jobs j ON j.id='history:'||c.id WHERE c.source='tuya' AND (j.next_due IS NULL OR j.next_due<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) ORDER BY COALESCE(j.updated_at,''),COALESCE(s.covered_through,'') LIMIT 1").first<{id:string;capabilities:string}>();if(!device)return{status:'no_devices'};
  return dueWork(`history:${device.id}`,0,async()=>{const {cachedDevices}=await import('./tuya-store'),current=(await cachedDevices(true)).find(d=>d.id===device.id)!;
    const row=await db.prepare('SELECT * FROM tuya_sync WHERE device_id=?').bind(device.id).first<{from_ms:number|null;to_ms:number|null;cursor:string|null;covered_through:string|null}>(),end=Date.now(),floor=end-lookbackDays()*86400000,from=row?.from_ms??Math.max(floor,row?.covered_through?Date.parse(row.covered_through)-900000:floor),to=row?.to_ms??Math.min(end,from+7*86400000);
    const codes=current.capabilities.map(c=>c.code);if(!codes.length)return{status:'unsupported',reason:'No verified history datapoints'};const page=await new TuyaProvider().getLogPage(device.id,codes,from,to,row?.cursor??'');
    if(page.has_more&&(!page.last_row_key||page.last_row_key===row?.cursor))throw new Error('History pagination did not advance');
    await storeTuyaLogs(current,page.logs??[]);
    for(const date of new Set((page.logs??[]).map(log=>localDate(log.event_time))))await summarizeTuyaDay(device.id,date);
    await db.prepare('INSERT INTO tuya_sync(device_id,from_ms,to_ms,cursor,covered_through,error) VALUES (?,?,?,?,?,NULL) ON CONFLICT(device_id) DO UPDATE SET from_ms=excluded.from_ms,to_ms=excluded.to_ms,cursor=excluded.cursor,covered_through=excluded.covered_through,error=NULL').bind(device.id,page.has_more?from:null,page.has_more?to:null,page.has_more?page.last_row_key:null,page.has_more?(row?.covered_through??null):new Date(to).toISOString()).run();return{source:'tuya',deviceId:device.id,imported:page.logs?.length??0,remaining:Boolean(page.has_more)};
  });
}
export async function runCollection(manual=false){
  const job=await claimJob('collection',60000,240000,new Date(),manual);if(!job)return{status:'already_running_or_not_due'};
  const result:{status:string;providers:Array<{provider:string;ok:boolean;error?:string}>;automation?:unknown;alerts?:unknown;maintenance?:unknown}={status:'completed',providers:[]};
  try{
    const settled=await Promise.allSettled([
      (async()=>{const collected=await dueWork('solar-live',300000,async()=>{const stamp=new Date().toISOString(),run=await database().prepare("INSERT INTO solar_collection_runs(started_at,status) VALUES (?,'running') RETURNING id").bind(stamp).first<{id:number}>();try{await saveSnapshot(await new DessMonitorProvider().getSnapshot(manual));await database().prepare("UPDATE solar_collection_runs SET finished_at=?,status='success' WHERE id=?").bind(new Date().toISOString(),run!.id).run();}catch(error){await database().prepare("UPDATE solar_collection_runs SET finished_at=?,status='failed',error=? WHERE id=?").bind(new Date().toISOString(),String(error),run!.id).run();throw error;}return {status:'collected'};},manual);return collected;})(),
      (async()=>{const collected=await dueWork('tuya-live',providerPolicy('tuya').intervalMs,async()=>{const devices=await applyRoomOverrides(await new TuyaProvider().getDevices());await collectTuya(devices);return {status:'collected'};},manual);return collected;})()
    ]);
    for(let i=0;i<settled.length;i++){const provider=i===0?'dessmonitor':'tuya',item=settled[i],error=item.status==='rejected'?String(item.reason):undefined;result.providers.push({provider,ok:!error,error});if(error||(item.status==='fulfilled'&&(item.value as {status?:string})?.status==='collected'))await connection(provider,!error,error);}
    await reconcileCommands();result.automation=await releaseCheck(result.providers.every(p=>p.ok))?{status:'release_validation'}:await evaluateAutomations();if((result.automation as {executed?:number}).executed)await reconcileCommands();
    result.alerts={status:'scheduled'};
    result.status=result.providers.every(p=>p.ok)?'completed':'failed';
    await finishJob(job,result.status==='failed'?'Provider collection failed':undefined);
    // Respond after fresh collection and rule evaluation. Scheduled callers have
    // a 30-second timeout; maintenance has its own durable lease and resumes.
    after(async()=>{try{await dueWork('collection-maintenance',0,maintainCollection);}catch{/* Individual jobs retain their failure state. */}});
    return result;
  }catch(error){await finishJob(job,String(error));throw error;}
}
export async function maintainCollection(){
    await evaluateAlerts();
    await dueWork('actual-energy-repair',900000,repairActualEnergyStep);
    // Current counters are shared and refreshed hourly rather than per report or browser.
    try{await dueWork('solar-periods',3600000,async()=>{const errors=await syncPeriods(new DessMonitorProvider(),localDate().slice(0,4));if(errors.length)throw new Error(errors.join('; '));});}catch{/* Durable job health carries the error; live collection still succeeds. */}
    try{await dueWork('solar-reconcile',86400000,async()=>{const today=localDate(),previous=shiftDate(today,-7);if(previous.slice(0,7)!==today.slice(0,7)){const errors=await syncPeriods(new DessMonitorProvider(),today.slice(0,4),previous.slice(0,7));if(errors.length)throw new Error(errors.join('; '));}});
      await dueWork('solar-period-backfill',300000,backfillPeriodUnit);
      await dueWork('history-unit',300000,historyUnit);
      try{await dueWork('meter-history',300000,()=>meterHistoryStep());}catch{/* The job row keeps the error; other maintenance still runs. */}
      try{await dueWork('device-statistics',900000,()=>deviceStatisticsStep());}catch{/* Same: the job row keeps the error. */}
      for(const [id,interval,unit] of [['provider-documents',86400000,documentsUnit],['dessmonitor-alarms',3600000,alarmsUnit],['tuya-events',300000,tuyaEventsUnit]] as const){try{await dueWork(id,interval,unit);}catch{/* Job health and the backfill ledger carry the error; later steps still run. */}}
      await dueWork('retention',3600000,async()=>{const bytes=await storageBytes(),retained=await retentionStep(bytes!==null&&bytes>STORAGE_PRUNE_BYTES);const catalog=await database().prepare('SELECT id,source FROM device_catalog').all<{id:string;source:string}>();for(const c of catalog.results)await rebuildLongPeriods(c.source,c.id);return retained;});
      await dueWork('operations-summary',86400000,summarizeOperations);
    }catch(error){throw error;}
}
export async function summarizeOperations(){
  const db=database(),cutoff=shiftDate(localDate(),-90);
  // Aggregate immutable old operational records before pruning; a failed batch retains them.
  for(const [table,time,kind] of [['provider_requests','timestamp','provider_requests'],['tuya_command_log','requested_at','commands'],['tuya_collection_runs','started_at','tuya_collection'],['solar_collection_runs','started_at','solar_collection'],['automation_runs','started_at','automation'],['automation_activity','occurred_at','automation_activity']] as const){
    const rows=await db.prepare(`SELECT substr(${time},1,10) date,status,COUNT(*) n FROM ${table} WHERE ${time}<? GROUP BY substr(${time},1,10),status`).bind(cutoff).all<{date:string;status:string|null;n:number}>().catch(async()=>table==='provider_requests'?await db.prepare('SELECT substr(timestamp,1,10) date,CAST(status AS TEXT) status,COUNT(*) n FROM provider_requests WHERE timestamp<? GROUP BY substr(timestamp,1,10),status').bind(cutoff).all<{date:string;status:string|null;n:number}>():Promise.reject(new Error('Operational summary failed')));
    const dates=new Set(rows.results.map(r=>r.date));for(const date of dates){const data=Object.fromEntries(rows.results.filter(r=>r.date===date).map(r=>[r.status??'unknown',r.n]));await db.batch([db.prepare('INSERT INTO operational_daily(date,kind,data) VALUES (?,?,?) ON CONFLICT(date,kind) DO UPDATE SET data=excluded.data').bind(date,kind,JSON.stringify(data)),...(table==='tuya_command_log'?[db.prepare('DELETE FROM command_context WHERE command_id IN (SELECT id FROM tuya_command_log WHERE substr(requested_at,1,10)=?)').bind(date)]:[]),...(table==='automation_runs'?[db.prepare('DELETE FROM automation_actions WHERE run_id IN (SELECT id FROM automation_runs WHERE substr(started_at,1,10)=?)').bind(date)]:[]),db.prepare(`DELETE FROM ${table} WHERE substr(${time},1,10)=?`).bind(date)]);}
  }
}

export async function backfillPeriodUnit(){
 const db=database(),snapshot=await cachedSnapshot(true,false);if(!snapshot)return {status:'no_metadata'};
 const entity=snapshot.device.serial,provider=new DessMonitorProvider();
 const years=await db.prepare("SELECT period FROM solar_energy_periods WHERE entity_id=? AND period_type='year' ORDER BY period DESC").bind(entity).all<{period:string}>();
 for(const {period} of years.results){
  const covered=await db.prepare("SELECT updated_at FROM period_coverage WHERE provider='dessmonitor' AND entity_id=? AND period=?").bind(entity,period).first<{updated_at:string}>();
  if(covered&&Date.now()-Date.parse(covered.updated_at)<30*86400000)continue;
  const totals=await provider.getEnergyPeriods('month',period);
  const {saveProviderPeriods}=await import('./solar-store');await saveProviderPeriods(totals);
  await db.prepare("INSERT INTO period_coverage(provider,entity_id,period,status,updated_at) VALUES ('dessmonitor',?,?,?,?) ON CONFLICT(provider,entity_id,period) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at").bind(entity,period,totals.buckets.length?'available':'empty',new Date().toISOString()).run();
  return{year:period,months:totals.buckets.length};
 }
 const months=await db.prepare("SELECT period FROM solar_energy_periods WHERE entity_id=? AND period_type='month' AND period<=? ORDER BY period DESC").bind(entity,localDate().slice(0,7)).all<{period:string}>();
 for(const {period} of months.results){
  const covered=await db.prepare("SELECT updated_at FROM period_coverage WHERE provider='dessmonitor' AND entity_id=? AND period=?").bind(entity,period).first<{updated_at:string}>();
  if(covered&&Date.now()-Date.parse(covered.updated_at)<30*86400000)continue;
  const totals=await provider.getEnergyPeriods('day',period),{saveProviderPeriods}=await import('./solar-store');await saveProviderPeriods(totals);
  await db.prepare("INSERT INTO period_coverage(provider,entity_id,period,status,updated_at) VALUES ('dessmonitor',?,?,?,?) ON CONFLICT(provider,entity_id,period) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at").bind(entity,period,totals.buckets.length?'available':'empty',new Date().toISOString()).run();
  return {month:period,days:totals.buckets.length};
 }
 return{status:'complete'};
}
