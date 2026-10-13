import { database } from './jobs';
import { localDate,shiftDate } from './measurements';
import { actualSummary } from './actual-energy';
import type { DailySummary } from './telemetry';
import { statisticsByDevice } from './device-statistics';
export async function deviceEnergy(id:string,range='7',provider='tuya') {
  if(!['7','30','months'].includes(range))throw new Error('Invalid energy range');
  const db=database(),device=await db.prepare('SELECT id,capabilities FROM device_catalog WHERE id=? AND source=?').bind(id,provider).first<{id:string;capabilities:string}>();
  if(!device)throw new Error('Device not found');
  const today=localDate(),from=range==='months'?String(Number(today.slice(0,4))-1)+'-'+today.slice(5,7)+'-01':shiftDate(today,-Number(range)+1);
  const rows=await db.prepare("SELECT period,data,calculation_version FROM telemetry_summaries WHERE source=? AND entity_id=? AND granularity='day' AND period>=? AND period<=? ORDER BY period").bind(provider,id,from,today).all<{period:string;data:string;calculation_version:number}>();
  const days=new Map<string,{kwh:number|null;partial:boolean;hours:number}>();
  for(const row of rows.results){const data=actualSummary(JSON.parse(row.data) as DailySummary,row.calculation_version),previous=days.get(row.period);days.set(row.period,{kwh:data.energyKwh===null?previous?.kwh??null:(previous?.kwh??0)+data.energyKwh,partial:data.partial||Boolean(previous?.partial),hours:(previous?.hours??0)+data.energyHours});}
  // Tuya's own daily statistics cover days the live logs never could.
  for(const [date,kwh] of (await statisticsByDevice(from,today,id)).get(id)??[])if(days.get(date)?.kwh==null)days.set(date,{kwh,partial:false,hours:24});
  const buckets=new Map<string,{date:string;kwh:number|null;partial:boolean;coveredHours:number;days:number}>();
  for(let date=from;date<=today;date=shiftDate(date,1)){const key=range==='months'?date.slice(0,7):date,day=days.get(date),b=buckets.get(key)??{date:key,kwh:null,partial:false,coveredHours:0,days:0};if(day?.kwh!==null&&day?.kwh!==undefined)b.kwh=(b.kwh??0)+day.kwh;b.partial||=!day||day.partial;b.coveredHours+=day?.hours??0;b.days++;buckets.set(key,b);}
  const data=[...buckets.values()],available=data.some(b=>b.kwh!==null);
  return {deviceId:id,provider,range,from,to:today,unit:'kWh',timeZone:'Asia/Karachi',buckets:data,totalKwh:available?data.reduce((n,b)=>n+(b.kwh??0),0):null,partial:data.some(b=>b.partial),status:available?'available':'unavailable',note:available?'Measured energy only. Gaps are excluded from totals.':'No verified energy history is available for this period. Power readings are not converted into consumption.'};
}
