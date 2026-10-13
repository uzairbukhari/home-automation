import { env } from '@/lib/env';
import { database } from './jobs';
import { DessMonitorProvider } from './providers/dessmonitor';
import { TuyaProvider } from './providers/tuya';
import { ledgerRow, saveDocument, saveLedger } from './backfill-ledger';

const DAY=86400000;
// Tuya only serves history it still retains; older windows simply come back empty and are recorded as covered.
export function lookbackDays(){const value=Number((env as unknown as Record<string,string|undefined>).TUYA_HISTORY_DAYS);return Number.isFinite(value)&&value>0?Math.min(value,1095):30;}

// Daily snapshot of everything the providers describe about the account and devices.
export async function documentsUnit(){
  const errors:string[]=[];let changed=0;
  const attempt=async(label:string,work:()=>Promise<void>)=>{try{await work();}catch(error){errors.push(`${label}: ${error instanceof Error?error.message:String(error)}`);}};
  await attempt('dessmonitor',async()=>{const devices=await new DessMonitorProvider().getDeviceInfo();for(const device of devices){if(await saveDocument('dessmonitor',String(device.sn),'device-info',device))changed++;}await saveLedger('dessmonitor','account','device-info',{status:'complete',error:null,covered_through:new Date().toISOString()});});
  const tuya=new TuyaProvider();
  await attempt('tuya devices',async()=>{const devices=await tuya.getRawDevices();for(const device of devices){const id=String(device.id);if(await saveDocument('tuya',id,'device-list-entry',device))changed++;await attempt(`tuya ${id}`,async()=>{if(await saveDocument('tuya',id,'device-detail',await tuya.getDeviceInfo(id)))changed++;});}await saveLedger('tuya','account','device-info',{status:'complete',error:null,covered_through:new Date().toISOString()});});
  await attempt('tuya homes',async()=>{const homes=await tuya.getHomes();if(await saveDocument('tuya','account','homes',homes))changed++;for(const home of homes){const homeId=String(home.home_id??home.ownerId??'');if(!homeId)continue;await attempt(`rooms ${homeId}`,async()=>{if(await saveDocument('tuya',homeId,'rooms',await tuya.getRooms(homeId)))changed++;});}await saveLedger('tuya','account','homes',{status:'complete',error:null,covered_through:new Date().toISOString()});});
  if(errors.length){await saveLedger('tuya','account','documents',{status:'partial',error:errors.join('; ').slice(0,500)});throw new Error(errors.join('; '));}
  await saveLedger('tuya','account','documents',{status:'complete',error:null,covered_through:new Date().toISOString()});
  return{changed};
}

// DessMonitor alarm history: walks every page once, then only fetches pages until it sees nothing new.
export async function alarmsUnit(){
  const db=database(),provider=new DessMonitorProvider(),first=await provider.getAlarms(0),entity=first.entityId,ledger=await ledgerRow('dessmonitor',entity,'alarms');
  let page=ledger?.status==='backfilling'?Number(ledger.cursor??0):0,current=page===0?first:await provider.getAlarms(page),stored=0;
  for(let fetched=0;fetched<5;fetched++){
    const rows=current.alarms.map(alarm=>{const time=String(alarm.gts??alarm.time??alarm.date??'');return{time:time?new Date(time.replace(' ','T')+(/Z|[+-]\d\d:?\d\d$/.test(time)?'':'+05:00')).toISOString():'',code:String(alarm.code??alarm.id??''),alarm};}).filter(row=>row.time&&row.time!=='Invalid Date');
    let added=0;
    for(const row of rows){const result=await db.prepare("INSERT OR IGNORE INTO provider_events(provider,entity_id,event_time,kind,code,data) VALUES ('dessmonitor',?,?,'alarm',?,?)").bind(entity,row.time,row.code,JSON.stringify(row.alarm)).run();added+=result.meta.changes??0;}
    stored+=added;
    const complete=!current.more||!rows.length||(ledger?.status==='complete'&&added===0);
    if(complete){await saveLedger('dessmonitor',entity,'alarms',{status:'complete',cursor:null,error:null,covered_through:new Date().toISOString(),addRows:stored});return{entity,stored,complete:true};}
    page++;current=await provider.getAlarms(page);
    await saveLedger('dessmonitor',entity,'alarms',{status:ledger?.status==='complete'?'complete':'backfilling',cursor:String(page),error:null,addRows:stored});stored=0;
  }
  return{entity,stored,complete:false};
}

// Tuya device event log (online/offline, activation, firmware, reports), walked forward in 7-day windows per device.
export async function tuyaEventsUnit(){
  const db=database(),device=await db.prepare("SELECT c.id FROM device_catalog c LEFT JOIN provider_backfill b ON b.provider='tuya' AND b.entity_id=c.id AND b.dataset='events' WHERE c.source='tuya' ORDER BY COALESCE(b.updated_at,'') LIMIT 1").first<{id:string}>();
  if(!device)return{status:'no_devices'};
  const ledger=await ledgerRow('tuya',device.id,'events'),end=Date.now(),window=7*DAY;
  const caughtUp=ledger?.status==='complete';
  // After catch-up, re-read only the last hour of the previous run (with overlap) once per day.
  if(caughtUp&&Date.now()-Date.parse(ledger!.updated_at)<DAY)return{status:'up_to_date',deviceId:device.id};
  const from=ledger?.covered_through?Date.parse(ledger.covered_through)-(caughtUp?3600_000:0):end-lookbackDays()*DAY,fixed=ledger?.status==='paging'?ledger.cursor?.split('|'):null,to=fixed?Number(fixed[0]):Math.min(end,from+window);
  const page=await new TuyaProvider().getEventPage(device.id,from,to,fixed?.[1]??'');
  let added=0;
  for(const log of page.logs??[]){const result=await db.prepare("INSERT OR IGNORE INTO provider_events(provider,entity_id,event_time,kind,code,data) VALUES ('tuya',?,?,?,?,?)").bind(device.id,new Date(log.event_time).toISOString(),String(log.event_id),log.code??'',JSON.stringify(log)).run();added+=result.meta.changes??0;}
  if(page.has_next&&page.next_row_key){await saveLedger('tuya',device.id,'events',{status:'paging',cursor:`${to}|${page.next_row_key}`,covered_through:new Date(from).toISOString(),error:null,addRows:added});return{deviceId:device.id,added,paging:true};}
  const oldest=ledger?.oldest_covered??new Date(from).toISOString();
  await saveLedger('tuya',device.id,'events',{status:to>=end?'complete':'backfilling',cursor:null,oldest_covered:oldest,covered_through:new Date(to).toISOString(),error:null,addRows:added});
  return{deviceId:device.id,added,through:new Date(to).toISOString()};
}
