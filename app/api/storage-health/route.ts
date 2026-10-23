import { getOwnerUser } from '@/lib/owner-auth';
import { database } from '@/lib/jobs';
import { usageSummary } from '@/lib/usage';
type Db=ReturnType<typeof database>;
// Row counts and per-source totals scan whole tables, so they are recounted every few hours and stored; the page polls far more often than that.
async function tableFigures(db:Db){
  const row=await db.prepare("SELECT data FROM operational_daily WHERE date='latest' AND kind='storage-figures'").first<{data:string}>();
  if(row){const saved=JSON.parse(row.data) as {at:string;counts:unknown[];summaries:unknown[];solarDays:unknown[]};if(Date.now()-Date.parse(saved.at)<6*3600000)return saved;}
  const counts=[];for(const table of ['tuya_latest','tuya_device_state','solar_samples','solar_raw_fields','provider_events','provider_documents','telemetry_summaries','automation_runs'])counts.push({table,...await db.prepare(`SELECT COUNT(*) records FROM ${table}`).first()});
  const summaries=(await db.prepare('SELECT source,granularity,COUNT(*) records,MIN(period) oldest,MAX(period) newest FROM telemetry_summaries GROUP BY source,granularity').all()).results,
    solarDays=(await db.prepare("SELECT entity_id,COUNT(*) days,MIN(date) oldest,MAX(date) newest,SUM(status='available') available FROM history_coverage WHERE source='dessmonitor' GROUP BY entity_id").all()).results,
    figures={at:new Date().toISOString(),counts,summaries,solarDays};
  await db.prepare("INSERT INTO operational_daily(date,kind,data) VALUES ('latest','storage-figures',?) ON CONFLICT(date,kind) DO UPDATE SET data=excluded.data").bind(JSON.stringify(figures)).run().catch(()=>{});
  return figures;
}
export async function GET(){if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});const db=database(),jobs=(await db.prepare('SELECT id,last_success,next_due,lease_until,error FROM app_jobs ORDER BY id').all()).results,requests=(await db.prepare("SELECT provider,purpose,COUNT(*) requests,SUM(CASE WHEN status>=400 OR error IS NOT NULL THEN 1 ELSE 0 END) failures FROM provider_requests WHERE timestamp>=? GROUP BY provider,purpose").bind(new Date(Date.now()-86400000).toISOString()).all()).results;
  const {counts,summaries,solarDays}=await tableFigures(db);
  const coverage=(await db.prepare('SELECT provider,entity_id,dataset,oldest_covered,covered_through,status,rows_total,error,updated_at FROM provider_backfill ORDER BY provider,dataset,entity_id').all()).results;
  const collection=jobs.find(j=>(j as {id:string}).id==='collection') as {last_success?:string}|undefined;
  let databaseBytes:number|null=null;try{const pages=await db.prepare('PRAGMA page_count').first<{page_count:number}>(),size=await db.prepare('PRAGMA page_size').first<{page_size:number}>();if(pages&&size)databaseBytes=pages.page_count*size.page_size;}catch{/* Some hosted D1 surfaces restrict these pragmas. */}
  const usage=await usageSummary().catch(()=>[]);
  return Response.json({usage,jobs,requests,summaries,counts,coverage,solarDays,databaseBytes,schedulerHealthy:Boolean(collection?.last_success&&Date.now()-Date.parse(collection.last_success)<900000),retention:{raw:'kept until storage reaches 4 GB, then the oldest verified days are summarized and pruned',hourlyDays:90,daily:'permanent',monthly:'permanent',yearly:'permanent'},note:'Scheduler health is inferred from successful collection, not proof of an external job configuration.'},{headers:{'cache-control':'private, no-store'}});
}
