import { shiftDate } from './measurements';
export const iescoTariff={effectiveAt:'2026-02-12',source:'https://iesco.com.pk/tariff-guide',notification:'SRO 279(I)/2026',slabs:[{max:100,rate:22.44},{max:200,rate:28.91},{max:300,rate:33.10},{max:400,rate:36.46},{max:500,rate:38.95},{max:600,rate:40.22},{max:700,rate:41.85},{max:Infinity,rate:47.20}]};
export const taxSources={gst:'https://download1.fbr.gov.pk/Docs/20267171373418951SalesTaxAct1990updatedupto30.06.2026.pdf',income:'https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf',duty:'https://www.power.gov.pk/Detail/YThmNWQ5OGQtZGY5NC00NDk0LTgzN2MtZThhZTEzMTY5NTg2',fc:'https://iesco.com.pk/bill-calculator'};
export type TaxStatus='unknown'|'filer'|'non-filer';
export type PeriodAdjustment={fpaPerKwh:number|null;qtaPerKwh:number|null;fcPerKwh:number|null};
export type TariffSettings={taxStatus:TaxStatus;dutyPercent:number|null;periodAdjustments:Record<string,PeriodAdjustment>};
export const defaultTariffSettings:TariffSettings={taxStatus:'unknown',dutyPercent:null,periodAdjustments:{}};
export function parseTariffSettings(value:unknown):TariffSettings{
 let input=value;if(typeof input==='string'){try{input=JSON.parse(input)}catch{input={}}}
 const record=(input??{}) as Partial<TariffSettings>;
 return{taxStatus:record.taxStatus??'unknown',dutyPercent:record.dutyPercent??null,periodAdjustments:record.periodAdjustments??{}};
}
export function unprotectedRate(units:number){return iescoTariff.slabs.find(slab=>units<=slab.max)?.rate??47.20;}
export function billingCycle(date:string,billingDay:number){const day=Math.min(28,Math.max(1,Math.floor(billingDay))),yearMonth=date.slice(0,7),start=`${yearMonth}-${String(day).padStart(2,'0')}`;return date>=start?start:`${shiftDate(`${yearMonth}-01`,-1).slice(0,7)}-${String(day).padStart(2,'0')}`;}
type Cost={energy:number;duty:number;surcharge:number;adjustments:number;gst:number;income:number;total:number;rate:number};
export function variableCost(units:number,settings:TariffSettings,adjustment:PeriodAdjustment,fixedForThreshold=0):Cost{
 const rate=unprotectedRate(Math.max(0,units)),energy=Math.max(0,units)*rate,duty=energy*(settings.dutyPercent??0)/100,surcharge=units*(adjustment.fcPerKwh??0),adjustments=units*((adjustment.fpaPerKwh??0)+(adjustment.qtaPerKwh??0));
 // Sales Tax Act s2(46)(i): value of distributed electricity includes
 // variable charges and duties. Fixed amounts cancel in the savings delta.
 const gst=Math.max(0,energy+duty+surcharge+adjustments)*.18;
 const beforeIncome=energy+duty+surcharge+adjustments+gst;
 const income=settings.taxStatus==='non-filer'&&beforeIncome+fixedForThreshold>=25000?(beforeIncome+fixedForThreshold)*.075:0;
 return{energy,duty,surcharge,adjustments,gst,income,total:beforeIncome+income,rate};
}
export type Savings={total:number|null;energy:number|null;gst:number|null;duty:number|null;income:number|null;surcharge:number|null;adjustments:number|null;provisional:boolean;assumptions:string[];cycles:Array<{start:string;gridKwh:number;directSolarKwh:number;total:number;rateWithoutSolar:number}>;tariff:typeof iescoTariff};
export function directSolarSavings(days:Array<{date:string;gridKwh:number|null;directSolarKwh:number|null;partial:boolean}>,settings:TariffSettings,billingDay=1,fixedForThreshold=0):Savings{
 const groups=new Map<string,typeof days>();for(const day of days){const start=billingCycle(day.date,billingDay);groups.set(start,[...(groups.get(start)??[]),day]);}
 const assumptions=new Set<string>(),totals={total:0,energy:0,gst:0,duty:0,income:0,surcharge:0,adjustments:0},cycles:Savings['cycles']=[];
 if(settings.taxStatus==='unknown')assumptions.add('Select the account holder’s filer status to include conditional income tax.');
 if(settings.dutyPercent===null)assumptions.add('Electricity duty is excluded until its rate is set from your bill.');
 for(const [start,group] of groups){
  if(start<iescoTariff.effectiveAt){assumptions.add('Cycles starting before 12 February 2026 need a historical tariff; excluded from this estimate.');continue;}
  const valid=group.filter(day=>day.gridKwh!==null&&day.directSolarKwh!==null);if(!valid.length)continue;
  if(group.some(day=>day.partial)||valid.length!==group.length)assumptions.add('Energy coverage is incomplete; totals and slab selection are provisional.');
  if(group[0].date!==start)assumptions.add('The full billing cycle is not recorded; slab selection is provisional.');
  const adjustment=settings.periodAdjustments[start]??{fpaPerKwh:null,qtaPerKwh:null,fcPerKwh:.43};
  if(adjustment.fpaPerKwh===null||adjustment.qtaPerKwh===null)assumptions.add('Unknown fuel and quarterly adjustments are excluded; enter this cycle’s rates from your bill.');
  if(adjustment.fcPerKwh===null)assumptions.add('Financing surcharge is excluded for a cycle without a confirmed rate.');
  const grid=valid.reduce((n,d)=>n+d.gridKwh!,0),direct=valid.reduce((n,d)=>n+d.directSolarKwh!,0),withSolar=variableCost(grid,settings,adjustment,fixedForThreshold),withoutSolar=variableCost(grid+direct,settings,adjustment,fixedForThreshold);
  for(const key of Object.keys(totals) as (keyof typeof totals)[])totals[key]+=withoutSolar[key]-withSolar[key];
  cycles.push({start,gridKwh:grid,directSolarKwh:direct,total:withoutSolar.total-withSolar.total,rateWithoutSolar:withoutSolar.rate});
 }
 return{...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,cycles.length?v:null])) as typeof totals,provisional:assumptions.size>0,assumptions:[...assumptions],cycles,tariff:iescoTariff};
}
