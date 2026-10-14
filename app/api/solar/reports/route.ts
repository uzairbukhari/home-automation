import { serverTiming } from '@/lib/server-timing';
import { after } from 'next/server';
import { database,dueWork } from '@/lib/jobs';
import { DessMonitorProvider } from '@/lib/providers/dessmonitor';
import type { DailySummary } from '@/lib/telemetry';
import { getOwnerUser } from '@/lib/owner-auth';
import { asBuckets,calendarMonths,cachedSnapshot,collectionHealth,storedPeriods,sumReports,syncPeriods } from '@/lib/solar-store';
import { localDate,shiftDate } from '@/lib/measurements';
import { savedSettings } from '@/lib/settings-store';
import { billingCycle,directSolarSavings } from '@/lib/tariff';
import { dayStats,sumDays,type DayStat } from '@/lib/day-stats';
export async function GET(request:Request){
 const timing=serverTiming();
 const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
 try{
  const current=localDate(),url=new URL(request.url),year=url.searchParams.get('year')??current.slice(0,4);
  if(!/^\d{4}$/.test(year)||Number(year)>Number(current.slice(0,4))||Number(year)<2000)throw new Error('Invalid reporting year or reserve');
  const weekEnd=url.searchParams.get('weekEnd')??current;if(!/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)||weekEnd>current||weekEnd<'2000-01-01')throw new Error('Invalid week');
  const errors:string[]=[];
  // Settings and the saved snapshot are independent; the snapshot's series (today's readings) is not used here, so it is not loaded.
  const [settings,snapshot]=await Promise.all([savedSettings(user.userId),cachedSnapshot(false,false)]);
  const threshold=Number(url.searchParams.get('threshold')??settings.threshold);
  if(!Number.isFinite(threshold)||threshold<0||threshold>100)throw new Error('Invalid reporting year or reserve');
  const currentYear=current.slice(0,4),weekStart=shiftDate(weekEnd,-6),cycleStart=billingCycle(current,settings.billingDay),refreshing=false;
  if(!snapshot)throw new Error('No saved solar readings are available');
  const entity=snapshot.device.serial;
  // The previous two billing cycles are known up front, so every per-day read below can come from one query that covers them all.
  const cycles:Array<{from:string;to:string}>=[];let previousEnd=shiftDate(cycleStart,-1);
  for(let i=0;i<2;i++){const from=billingCycle(previousEnd,settings.billingDay);cycles.push({from,to:previousEnd});previousEnd=shiftDate(from,-1);}
  const yearStart=`${currentYear}-01-01`,earliest=[yearStart,cycleStart,...cycles.map(c=>c.from)].sort()[0],weekInside=weekStart>=earliest;
  const inRange=<T extends {date:string}>(rows:T[],from:string,to:string)=>rows.filter(d=>d.date>=from&&d.date<=to);
  // Home, grid, direct-solar and battery energy come from per-day integration of the stored inverter readings; grid import comes from the upstream Tuya meter when there is one.
  const [allDays,days,months,years,currentMonths,summaries,periodJobs,collection,stats,weekRows]=await Promise.all([
   storedPeriods(entity,'day',earliest,current),
   year===currentYear?null:storedPeriods(entity,'day',`${year}-01-01`,`${year}-12-31`),
   storedPeriods(entity,'month',`${year}-01`,`${year}-12`),storedPeriods(entity,'year'),
   year===currentYear?null:storedPeriods(entity,'month',`${currentYear}-01`,`${currentYear}-12`),
   database().prepare("SELECT period,data FROM telemetry_summaries WHERE source='dessmonitor' AND entity_id=? AND granularity='day' AND period>=? AND period<=?").bind(entity,yearStart,current).all<{period:string;data:string}>(),
   database().prepare("SELECT id,last_success,error FROM app_jobs WHERE id IN ('solar-periods','solar-periods-on-demand','solar-period-backfill')").all<{id:string;last_success:string|null;error:string|null}>(),
   collectionHealth(),
   dayStats(entity,[`${year<currentYear?year:currentYear}-01-01`,weekStart].sort()[0],current).catch(()=>({days:[] as DayStat[],meter:null})),
   weekInside?null:storedPeriods(entity,'day',weekStart,weekEnd)]);
  const currentDays=inRange(allDays,yearStart,current),currentMonthsRows=currentMonths??months,{days:statDays,meter}=stats,gridOf=(d:DayStat)=>meter?d.meterGridKwh:d.inverterGridKwh;
  const yearDays=days??currentDays,monthDays=currentDays.filter(d=>d.date.startsWith(current.slice(0,7)));
  const withReserve=(row:typeof currentDays[number])=>{const report=row.report;if(!report)return[];const summary=summaries.results.find(s=>s.period===row.date),d=summary?JSON.parse(summary.data) as DailySummary:null;return [{...report,hoursAtReserve:d?d.socHours.slice(0,Math.floor(threshold)+1).reduce((n,h)=>n+h,0):report.hoursAtReserve}];};
  const today=sumReports(currentDays.filter(d=>d.date===current).flatMap(withReserve)),month=sumReports(monthDays.flatMap(withReserve));
  const annual=sumReports(currentDays.flatMap(withReserve)),reportedYear=years.find(d=>d.date===currentYear),reportedMonth=currentMonthsRows.find(d=>d.date===current.slice(0,7)),reportedToday=currentDays.find(d=>d.date===current);
  today.solarKwh=reportedToday?.solar??today.solarKwh;month.solarKwh=reportedMonth?.solar??month.solarKwh;annual.solarKwh=reportedYear?.solar??annual.solarKwh;
  if(reportedToday?.source.startsWith('provider:'))today.solarSource='counter';if(reportedMonth?.source.startsWith('provider:'))month.solarSource='counter';if(reportedYear?.source.startsWith('provider:'))annual.solarSource='counter';annual.partial=annual.partial||currentDays.length<Math.ceil((Date.parse(current)-Date.parse(currentYear+'-01-01'))/86400000)+1;
  // The inverter's own monthly counter beats a sum of the few days stored so far (a fresh database has only recent days).
  const counterMonth=snapshot.readings.find(r=>r.metric==='solar_month')?.value??null;
  if(!reportedMonth?.source.startsWith('provider:')&&counterMonth!==null&&counterMonth>=(today.solarKwh??0)){month.solarKwh=counterMonth;month.solarSource='counter';}
  // No provider year total yet means the hourly period sync has not landed. Queue one now (shared lease, at most every 15 minutes) so the totals correct themselves.
  if(!reportedYear?.source.startsWith('provider:'))after(async()=>{try{await dueWork('solar-periods-on-demand',900000,async()=>{const failures=await syncPeriods(new DessMonitorProvider(),currentYear);if(failures.length)throw new Error(failures.join('; '));});}catch{/* The job row keeps the error for diagnostics. */}});
  const billingDays=inRange(allDays,cycleStart,current);
  const savings=directSolarSavings(billingDays.map(d=>({date:d.date,gridKwh:d.grid,directSolarKwh:d.report?.directSolarKwh??null,partial:d.partial})),settings.tariffSettings,settings.billingDay,settings.fixedCharges+settings.adjustments);
  const previousCycles=[];
  for(const {from:previousStart,to:previousEnd} of cycles){const previousDays=inRange(allDays,previousStart,previousEnd),estimate=directSolarSavings(previousDays.map(d=>({date:d.date,gridKwh:d.grid,directSolarKwh:d.report?.directSolarKwh??null,partial:d.partial})),settings.tariffSettings,settings.billingDay,settings.fixedCharges+settings.adjustments);if(previousDays.length)previousCycles.push({...estimate,from:previousStart,to:previousEnd});}
  const providerYear=reportedYear?.solar??null,monthlyTotal=currentMonthsRows.reduce((n,d)=>n+(d.solar??0),0),weekDays=weekRows??inRange(allDays,weekStart,weekEnd);
  const overlay=(report:typeof today,days:DayStat[])=>{const t=sumDays(days),grid=days.map(gridOf).filter((n):n is number=>n!==null);report.homeKwh=t.homeKwh;report.directSolarKwh=t.directSolarKwh;report.batteryChargeKwh=t.chargedKwh;report.batteryDischargeKwh=t.dischargedKwh;report.gridKwh=grid.length?grid.reduce((a,b)=>a+b,0):null;};
  overlay(today,statDays.filter(d=>d.date===current));overlay(month,statDays.filter(d=>d.date.startsWith(current.slice(0,7))));overlay(annual,statDays.filter(d=>d.date.startsWith(currentYear)));
  const fillGrid=<T extends {date:string;grid:number|null;home:number|null;gridSource:string}>(buckets:T[])=>buckets.map(b=>{const days=statDays.filter(d=>d.date.startsWith(b.date)),grid=days.map(gridOf).filter((n):n is number=>n!==null),home=days.map(d=>d.homeKwh).filter((n):n is number=>n!==null);return{...b,grid:grid.length?grid.reduce((a,c)=>a+c,0):b.grid,gridSource:grid.length?(meter?'meter':'inverter'):b.gridSource,home:home.length?home.reduce((a,c)=>a+c,0):b.home};});
  return Response.json({refreshing,production:{today:today.solarKwh,month:month.solarKwh,year:annual.solarKwh,lifetime:snapshot.readings.find(r=>r.metric==='solar_total')?.value??null},today,month,year:annual,daily:asBuckets(monthDays),calendar:fillGrid(asBuckets(yearDays)),buckets:{daily:fillGrid(asBuckets(weekDays)),monthly:fillGrid(calendarMonths(months,year)),yearly:fillGrid(asBuckets(years))},gridMeter:meter?.name??null,selectedYear:year,availableYears:years.map(d=>d.date),savings:{...savings,from:cycleStart,to:current},previousCycles,updatedAt:snapshot.updatedAt,unit:'kWh',timeZone:'Asia/Karachi',collection,warnings:errors,diagnostics:{annualSource:reportedYear?.source??'missing',periodJobs:periodJobs.results,providerYear,monthlyTotal,monthlyDifference:providerYear===null?null:providerYear-monthlyTotal}},{headers:{'cache-control':'private, no-store',...timing.headers()}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Reports are unavailable'},{status:502})}
}
