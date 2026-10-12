import { localDate, localTime } from './measurements';

export type SolarPoint = { time: string; sourceTimestamp: string; solar: number | null; home: number | null; grid: number | null; battery: number | null; batteryVoltage: number | null; chargeCurrent: number | null; dischargeCurrent: number | null; solarToday: number | null; batteryQuality?: 'measured'|'missing'|'invalid'; batteryRaw?: number | null };
export type EnergyReport = { solarKwh: number | null; homeKwh: number | null; gridKwh: number | null; directSolarKwh: number | null; batteryChargeKwh: number | null; batteryDischargeKwh: number | null; peakSolarW: number | null; peakHomeW: number | null; socMin: number | null; socMax: number | null; hoursAtReserve: number | null; samples: number; coveredHours: number; solarSource: 'counter' | 'integrated' | 'missing'; partial: boolean; directSolarSource: 'estimated' };
export type EnergyBucket = { date: string; solar: number | null; grid: number | null; home: number | null; source: string; gridSource: string; coveredHours: number; partial: boolean };
export function normalizeBatteryPoint(point:SolarPoint):SolarPoint {
  // A connected battery cannot have zero pack voltage. DessMonitor emits
  // transient zero-SOC / zero-voltage rows during communication failures.
  // Preserve the original value and show a gap rather than false depletion.
  if(point.batteryVoltage!==null&&point.batteryVoltage<=0)return {...point,batteryRaw:point.batteryRaw??point.battery,battery:null,chargeCurrent:null,dischargeCurrent:null,batteryQuality:'invalid'};
  return {...point,batteryQuality:point.battery===null?'missing':'measured'};
}
export function sortedPoints(points: SolarPoint[]) {
  return [...new Map(points.filter(p => Number.isFinite(Date.parse(p.sourceTimestamp))).map(normalizeBatteryPoint).map(p => [new Date(p.sourceTimestamp).toISOString(), {...p,sourceTimestamp:new Date(p.sourceTimestamp).toISOString()}])).values()].sort((a,b) => a.sourceTimestamp.localeCompare(b.sourceTimestamp));
}
export function aggregatePoints(points: SolarPoint[], granularity: 'raw' | 'hour' | 'day') {
  const sorted = sortedPoints(points);
  if (granularity === 'raw') return sorted.map(p => ({ ...p, time: localTime(p.sourceTimestamp) }));
  const groups = new Map<string, SolarPoint[]>();
  for (const p of sorted) { const key = granularity === 'day' ? localDate(p.sourceTimestamp) : `${localDate(p.sourceTimestamp)} ${localTime(p.sourceTimestamp).slice(0,2)}`; groups.set(key, [...(groups.get(key) ?? []),p]); }
  const mean = (values: (number | null)[]) => { const present = values.filter((n): n is number => n !== null); return present.length ? present.reduce((a,b)=>a+b,0)/present.length : null; };
  return [...groups].map(([key,group]) => ({ ...group[group.length-1], time: granularity === 'day' ? key.slice(5) : `${key.slice(5)}:00`,
    solar: mean(group.map(p=>p.solar)), home: mean(group.map(p=>p.home)), grid: mean(group.map(p=>p.grid)), battery: mean(group.map(p=>p.battery)) }));
}
export function energyReport(points: SolarPoint[], reserve = 39): EnergyReport {
  const sorted = sortedPoints(points);
  const totals = { solar: 0, home: 0, grid: 0, direct: 0, charge: 0, discharge: 0 };
  const coverage = { solar: 0, home: 0, grid: 0, direct: 0, charge: 0, discharge: 0 };
  let coveredHours = 0, hoursAtReserve = 0;
  const mean = (a: number | null,b: number | null) => a === null || b === null ? null : (a+b)/2;
  for (let i=1;i<sorted.length;i++) {
    const a=sorted[i-1],b=sorted[i],hours=(Date.parse(b.sourceTimestamp)-Date.parse(a.sourceTimestamp))/3_600_000;
    if (hours<=0 || hours>.25) continue;
    coveredHours+=hours;
    const solar=mean(a.solar,b.solar),home=mean(a.home,b.home),grid=mean(a.grid,b.grid),voltage=mean(a.batteryVoltage,b.batteryVoltage),charge=mean(a.chargeCurrent,b.chargeCurrent),discharge=mean(a.dischargeCurrent,b.dischargeCurrent);
    // Bound solar-to-load by load remaining after grid and battery discharge.
    // Conversion losses / routing are not directly measured by this inverter.
    const batteryOut=voltage===null || discharge===null ? null : Math.max(0,voltage*discharge);
    const values = { solar, home, grid, direct: solar===null || home===null || grid===null || batteryOut===null ? null : Math.max(0,Math.min(solar,home-Math.max(0,grid)-batteryOut)), charge: voltage===null || charge===null ? null : voltage*charge, discharge: batteryOut };
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) if (values[k]!==null) { totals[k]+=Math.max(0,values[k]!)*hours; coverage[k]+=hours; }
    if (a.battery!==null && a.battery<=reserve) hoursAtReserve+=hours;
  }
  // Daily counters reset at local midnight. Sum positive increments separately
  // for each day; never take the last day's counter as a multi-day total.
  const days = new Map<string, number[]>();
  for (const p of sorted) if (p.solarToday!==null && p.solarToday>=0) { const day=localDate(p.sourceTimestamp); days.set(day,[...(days.get(day)??[]),p.solarToday]); }
  let counterTotal=0,counterReset=false;
  for (const values of days.values()) { let subtotal=values[0]; for(let i=1;i<values.length;i++) {if(values[i]>=values[i-1])subtotal+=values[i]-values[i-1];else counterReset=true;}; counterTotal+=subtotal; }
  const soc=sorted.map(p=>p.battery).filter((n): n is number => n!==null && n>=0 && n<=100);
  const maximum=(values:(number|null)[])=>{const present=values.filter((n):n is number=>n!==null);return present.length?Math.max(...present):null;};
  const kwh=(k:keyof typeof totals)=>coverage[k]>0?totals[k]/1000:null;
  const span=sorted.length>1?(Date.parse(sorted[sorted.length-1].sourceTimestamp)-Date.parse(sorted[0].sourceTimestamp))/3_600_000:0;
  return { solarKwh: days.size ? counterTotal : kwh('solar'), homeKwh:kwh('home'),gridKwh:kwh('grid'),directSolarKwh:kwh('direct'),batteryChargeKwh:kwh('charge'),batteryDischargeKwh:kwh('discharge'),peakSolarW:maximum(sorted.map(p=>p.solar)),peakHomeW:maximum(sorted.map(p=>p.home)),socMin:soc.length?Math.min(...soc):null,socMax:soc.length?Math.max(...soc):null,hoursAtReserve:sorted.length>1?hoursAtReserve:null,samples:sorted.length,coveredHours,solarSource:days.size?'counter':coverage.solar?'integrated':'missing',partial:counterReset||days.size<new Set(sorted.map(p=>localDate(p.sourceTimestamp))).size||sorted.length<2||coverage.direct<coveredHours||coveredHours<Math.max(0,span-.1)||coverage.home<coveredHours||coverage.grid<coveredHours,directSolarSource:'estimated' };
}
