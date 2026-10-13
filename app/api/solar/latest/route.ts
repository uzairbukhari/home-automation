import { freshness } from '@/lib/freshness';
import { getOwnerUser } from '@/lib/owner-auth';
import { cachedSnapshot, collectionHealth, storedSamples } from '@/lib/solar-store';
import { energyReport, sortedPoints } from '@/lib/solar-energy';
import { localDate, localTime } from '@/lib/measurements';

/** Totals for the day of the latest reading, so the overview can show more than the instantaneous numbers. */
async function dayStats(serial:string,updatedAt:string){const day=localDate(Date.parse(updatedAt)),points=sortedPoints(await storedSamples(serial,day,day)),peak=points.reduce<typeof points[number]|null>((best,p)=>p.solar!==null&&(!best||p.solar>(best.solar??0))?p:best,null);return{...energyReport(points),peakSolarAt:peak?localTime(peak.sourceTimestamp):null};}
export async function GET(request?:Request){if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});try{const summary=request?new URL(request.url).searchParams.get('summary')==='1':false,snapshot=await cachedSnapshot(true,!summary);if(!snapshot)return Response.json({error:'No saved solar readings yet. Run a provider refresh or configure collection.'},{status:503});const stale=freshness(snapshot.updatedAt).stale;const today=summary?await dayStats(snapshot.device.serial,snapshot.updatedAt).catch(()=>null):undefined;return Response.json({...snapshot,today,stale,refreshing:false,readings:snapshot.readings.map(r=>({...r,quality:r.value===null?'missing':stale?'stale':r.quality})),collection:await collectionHealth()},{headers:{'cache-control':'private, no-store'}});}catch(error){return Response.json({error:String(error)},{status:503});}}
