import { database } from '@/lib/jobs';
import type { DailySummary } from '@/lib/telemetry';
import { aggregatePoints } from '@/lib/solar-energy';
import { serverTiming } from '@/lib/server-timing';
import { getOwnerUser } from '@/lib/owner-auth';
import { cachedSnapshot,storedSamples } from '@/lib/solar-store';
import { localDate, shiftDate, validDate } from '@/lib/measurements';
export async function GET(request:Request){
 const timing=serverTiming();
 const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
 try{const url=new URL(request.url),range=url.searchParams.get('range')??'week',current=localDate();let from=current,to=current,granularity:'raw'|'hour'|'day'='raw',since:number|undefined;
 if(['24h','48h','7d','30d'].includes(range)){const hours=range==='24h'?24:range==='48h'?48:range==='7d'?168:720;since=Date.now()-hours*3_600_000;from=localDate(since);granularity='raw';}
 else if(range==='week'){from=shiftDate(current,-6);granularity='hour';}else if(range==='month'){from=`${current.slice(0,8)}01`;granularity='day';}else if(range==='custom'){from=url.searchParams.get('from')??'';to=url.searchParams.get('to')??'';const days=(Date.parse(to)-Date.parse(from))/86_400_000;granularity=days<1?'raw':days<7?'hour':'day';}else if(range!=='day')throw new Error('Choose a valid history range');
 if(!validDate(from)||!validDate(to)||from>to||to>current||Date.parse(to)-Date.parse(from)>366*86_400_000)throw new Error('Choose a history range of at most 367 days');
 const snapshot=await cachedSnapshot();
 const points=snapshot?await storedSamples(snapshot.device.serial,from,to):[];
 let data;
 if(from<shiftDate(current,-90)&&snapshot){const rows=await database().prepare("SELECT period,data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity='day' AND period>=? AND period<=? ORDER BY period").bind(snapshot.device.serial,from,to).all<{period:string;data:string}>();data={series:rows.results.map(row=>{const d=JSON.parse(row.data) as DailySummary,mean=(key:string)=>d.metrics[key]?.hours?d.metrics[key].integral/d.metrics[key].hours:null;return{time:row.period,sourceTimestamp:row.period+'T12:00:00+05:00',solar:mean('solar'),home:mean('home'),grid:mean('grid'),battery:mean('battery'),batteryVoltage:null,chargeCurrent:null,dischargeCurrent:null,solarToday:d.energyKwh};}),from,to,granularity:'day',sampleCount:rows.results.length,source:'database',refreshing:false,note:'Detailed readings expire after 90 days; this range uses permanent daily summaries.'};}else data={series:aggregatePoints(points,granularity),from,to,granularity,sampleCount:points.length,source:'database',refreshing:false};if(since!==undefined)data.series=data.series.filter(p=>Date.parse(p.sourceTimestamp)>=since!);
 return Response.json(data,{headers:{'cache-control':'private, no-store',...timing.headers()}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'History is unavailable'},{status:400})}
}
