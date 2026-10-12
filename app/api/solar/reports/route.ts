import { after } from 'next/server';
import { database,dueWork } from '@/lib/jobs';
import { DessMonitorProvider } from '@/lib/providers/dessmonitor';
import type { DailySummary } from '@/lib/telemetry';
import { getOwnerUser } from '@/lib/owner-auth';
import { asBuckets,calendarMonths,cachedSnapshot,collectionHealth,storedPeriods,sumReports,syncPeriods } from '@/lib/solar-store';
import { localDate,shiftDate } from '@/lib/measurements';
import { savedSettings } from '@/lib/settings-store';
import { billingCycle,directSolarSavings } from '@/lib/tariff';
export async function GET(request:Request){
 const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
 try{
  const current=localDate(),url=new URL(request.url),year=url.searchParams.get('year')??current.slice(0,4),settings=await savedSettings(user.userId),threshold=Number(url.searchParams.get('threshold')??settings.threshold);
  if(!/^\d{4}$/.test(year)||Number(year)>Number(current.slice(0,4))||Number(year)<2000||!Number.isFinite(threshold)||threshold<0||threshold>100)throw new Error('Invalid reporting year or reserve');
  const errors:string[]=[];const snapshot=await cachedSnapshot();
  const currentYear=current.slice(0,4),weekStart=shiftDate(current,-6),cycleStart=billingCycle(current,settings.billingDay),refreshing=false;
  if(!snapshot)throw new Error('No saved solar readings are available');
  const entity=snapshot.device.serial;
  const [days,months,years]=await Promise.all([storedPeriods(entity,'day',`${year}-01-01`,year===current.slice(0,4)?current:`${year}-12-31`),storedPeriods(entity,'month',`${year}-01`,`${year}-12`),storedPeriods(entity,'year')]);
  const currentDays=year===currentYear?days:await storedPeriods(entity,'day',`${currentYear}-01-01`,current),currentMonths=year===currentYear?months:await storedPeriods(entity,'month',`${currentYear}-01`,`${currentYear}-12`);
  const monthDays=currentDays.filter(d=>d.date.startsWith(current.slice(0,7)));
  const summaries=await database().prepare("SELECT period,data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity='day' AND period>=? AND period<=?").bind(entity,currentYear+'-01-01',current).all<{period:string;data:string}>();
  const withReserve=(row:typeof currentDays[number])=>{const report=row.report;if(!report)return[];const summary=summaries.results.find(s=>s.period===row.date),d=summary?JSON.parse(summary.data) as DailySummary:null;return [{...report,hoursAtReserve:d?d.socHours.slice(0,Math.floor(threshold)+1).reduce((n,h)=>n+h,0):report.hoursAtReserve}];};
  const today=sumReports(currentDays.filter(d=>d.date===current).flatMap(withReserve)),month=sumReports(monthDays.flatMap(withReserve));
  const annual=sumReports(currentDays.flatMap(withReserve)),reportedYear=years.find(d=>d.date===currentYear),reportedMonth=currentMonths.find(d=>d.date===current.slice(0,7)),reportedToday=currentDays.find(d=>d.date===current);
  today.solarKwh=reportedToday?.solar??today.solarKwh;month.solarKwh=reportedMonth?.solar??month.solarKwh;annual.solarKwh=reportedYear?.solar??annual.solarKwh;
  if(reportedToday?.source.startsWith('provider:'))today.solarSource='counter';if(reportedMonth?.source.startsWith('provider:'))month.solarSource='counter';if(reportedYear?.source.startsWith('provider:'))annual.solarSource='counter';annual.partial=annual.partial||currentDays.length<Math.ceil((Date.parse(current)-Date.parse(currentYear+'-01-01'))/86400000)+1;
  // The inverter's own monthly counter beats a sum of the few days stored so far (a fresh database has only recent days).
  const counterMonth=snapshot.readings.find(r=>r.metric==='solar_month')?.value??null;
  if(!reportedMonth?.source.startsWith('provider:')&&counterMonth!==null&&counterMonth>=(today.solarKwh??0)){month.solarKwh=counterMonth;month.solarSource='counter';}
  // No provider year total yet means the hourly period sync has not landed. Queue one now (shared lease, at most every 15 minutes) so the totals correct themselves.
  if(!reportedYear?.source.startsWith('provider:'))after(async()=>{try{await dueWork('solar-periods-on-demand',900000,async()=>{const failures=await syncPeriods(new DessMonitorProvider(),currentYear);if(failures.length)throw new Error(failures.join('; '));});}catch{/* The job row keeps the error for diagnostics. */}});
  const periodJobs=(await database().prepare("SELECT id,last_success,error FROM app_jobs WHERE id IN ('solar-periods','solar-periods-on-demand','solar-period-backfill')").all<{id:string;last_success:string|null;error:string|null}>()).results;
  const billingDays=await storedPeriods(entity,'day',cycleStart,current);
  const savings=directSolarSavings(billingDays.map(d=>({date:d.date,gridKwh:d.grid,directSolarKwh:d.report?.directSolarKwh??null,partial:d.partial})),settings.tariffSettings,settings.billingDay,settings.fixedCharges+settings.adjustments);
  const previousCycles=[];let previousEnd=shiftDate(cycleStart,-1);
  for(let i=0;i<2;i++){const previousStart=billingCycle(previousEnd,settings.billingDay),previousDays=await storedPeriods(entity,'day',previousStart,previousEnd),estimate=directSolarSavings(previousDays.map(d=>({date:d.date,gridKwh:d.grid,directSolarKwh:d.report?.directSolarKwh??null,partial:d.partial})),settings.tariffSettings,settings.billingDay,settings.fixedCharges+settings.adjustments);if(previousDays.length)previousCycles.push({...estimate,from:previousStart,to:previousEnd});previousEnd=shiftDate(previousStart,-1);}
  const providerYear=reportedYear?.solar??null,monthlyTotal=currentMonths.reduce((n,d)=>n+(d.solar??0),0);const weekDays=await storedPeriods(entity,'day',weekStart,current);
  return Response.json({refreshing,production:{today:today.solarKwh,month:month.solarKwh,year:annual.solarKwh,lifetime:snapshot.readings.find(r=>r.metric==='solar_total')?.value??null},today,month,year:annual,daily:asBuckets(monthDays),buckets:{daily:asBuckets(weekDays),monthly:calendarMonths(months,year),yearly:asBuckets(years)},selectedYear:year,availableYears:years.map(d=>d.date),savings:{...savings,from:cycleStart,to:current},previousCycles,updatedAt:snapshot.updatedAt,unit:'kWh',timeZone:'Asia/Karachi',collection:await collectionHealth(),warnings:errors,diagnostics:{annualSource:reportedYear?.source??'missing',periodJobs,providerYear,monthlyTotal,monthlyDifference:providerYear===null?null:providerYear-monthlyTotal}},{headers:{'cache-control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Reports are unavailable'},{status:502})}
}
