import { env } from '@/lib/env';
import { providerFetch } from '../jobs';
import type { MonitoringProvider, ProviderStatus, Reading } from './types';
import { finiteNumber, localDate, localTime, normalizeMeasurement, shiftDate, validDate } from '../measurements';
import { aggregatePoints, sortedPoints, type SolarPoint, type EnergyBucket } from '../solar-energy';
export type { SolarPoint, EnergyReport } from '../solar-energy';
type Session={token:string;secret:string;expiresAt:number};
type Device={pn:string;devcode:number;devaddr:number;sn:string;alias?:string};
type DayData={title:Array<{title:string;unit?:string}>;row:Array<{field:string[]}>};
type Field={value:string;unit:string};
export type DessSnapshot={readings:Reading[];series:SolarPoint[];device:{name:string;serial:string;collector:string;mode:string|null};updatedAt:string;rawFields?:Array<{sourceTimestamp:string;fields:Record<string,{value:string;unit:string}>}>};
export type HistorySnapshot={series:SolarPoint[];from:string;to:string;granularity:'raw'|'hour'|'day';sampleCount:number};
export type ProviderPeriods={entityId:string;type:'day'|'month'|'year';buckets:EnergyBucket[];updatedAt:string;solarParameter:'ENERGY_TODAY'|'ENERGY_TOTAL';unit:'kWh'};
let cachedSession:Session|null=null;
let cachedDevice:Device|null=null;
const dayCache=new Map<string,{expiresAt:number;data:DayData}>();
const periodsCache=new Map<string,{expiresAt:number;data:ProviderPeriods}>();
const endpoint='https://api.dessmonitor.com/public/';
const standard='&source=1&_app_client_=android&_app_id_=com.demo.test&_app_version_=3.6.2.1';
function credential(name:string){const aliases:Record<string,string>={DESSMONITOR_USERNAME:'DESS_USERNAME',DESSMONITOR_PASSWORD:'DESS_PASSWORD',DESSMONITOR_COMPANY_KEY:'DESS_COMPANY_KEY'},values=env as unknown as Record<string,unknown>,value=values[name]??values[aliases[name]];if(typeof value!=='string'||!value)throw new Error('DessMonitor credentials are not configured');return value}
async function sha1(value:string){const hash=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
async function request<T>(url:string){const response=await providerFetch('dessmonitor',new URL(url).searchParams.get('action')??'unknown',url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8_000)});if(!response.ok)throw new Error(`DessMonitor HTTP ${response.status}`);const body=await response.json() as {err:number;desc:string;dat?:T};if(body.err!==0||!body.dat)throw new Error(`DessMonitor ${body.desc||body.err||'invalid response'}`);return body.dat}
async function authenticate(){if(cachedSession&&cachedSession.expiresAt>Date.now()+60_000)return cachedSession;const username=credential('DESSMONITOR_USERNAME'),password=credential('DESSMONITOR_PASSWORD'),companyKey=credential('DESSMONITOR_COMPANY_KEY'),salt=Date.now().toString(),suffix=`&action=authSource&usr=${encodeURIComponent(username)}&company-key=${encodeURIComponent(companyKey)}${standard}`,sign=await sha1(salt+await sha1(password)+suffix);const data=await request<{token:string;secret:string;expire:number}>(`${endpoint}?sign=${sign}&salt=${salt}${suffix}`);cachedSession={token:data.token,secret:data.secret,expiresAt:Date.now()+data.expire*1000};return cachedSession}
async function call<T>(suffix:string){const session=await authenticate(),salt=(Date.now()+Math.floor(Math.random()*1000)).toString(),action=suffix+standard,sign=await sha1(salt+session.secret+session.token+action);return request<T>(`${endpoint}?sign=${sign}&salt=${salt}&token=${session.token}${action}`)}
async function inverter(){if(cachedDevice)return cachedDevice;const data=await call<{device:Device[]}>('&action=queryDevices&page=0&pagesize=50');const selected=data.device?.[0];if(!selected)throw new Error('DessMonitor returned no inverter devices');cachedDevice=selected;return selected}
function identity(device:Device){return `&pn=${encodeURIComponent(device.pn)}&devcode=${device.devcode}&devaddr=${device.devaddr}&sn=${encodeURIComponent(device.sn)}`}
function fieldMap(data:DayData,row:string[]){return new Map(data.title.map((item,index)=>[item.title.trim().toLowerCase(),{value:row[index],unit:item.unit??''}]))}
function value(map:Map<string,Field>,title:string,target?:string){const field=map.get(title.toLowerCase());return field?(target?normalizeMeasurement(field.value,field.unit,target):finiteNumber(field.value)):null}
function timestamp(raw:string){if(!raw)return null;const date=Date.parse(raw.replace(' ','T')+'+05:00');return Number.isFinite(date)?new Date(date).toISOString():null}
async function dayData(selected:Device,date:string){const key=`${selected.sn}:${date}`,cached=dayCache.get(key);if(cached&&cached.expiresAt>Date.now())return cached.data;const data=await call<DayData>(`&action=queryDeviceDataOneDay&i18n=en_US${identity(selected)}&date=${date}`);if(dayCache.size>40)dayCache.clear();dayCache.set(key,{expiresAt:Date.now()+5*60_000,data});return data}
function points(data:DayData):SolarPoint[]{return sortedPoints((data.row??[]).flatMap(row=>{const map=fieldMap(data,row.field),stamp=timestamp(map.get('timestamp')?.value??row.field[1]);if(!stamp)return[];const battery=value(map,'battery capacity','%');return[{time:localTime(stamp),sourceTimestamp:stamp,solar:value(map,'pv power','W'),home:value(map,'output active power','W'),grid:value(map,'mains power','W'),battery:battery!==null&&battery>=0&&battery<=100?battery:null,batteryVoltage:value(map,'cell voltage','V'),chargeCurrent:value(map,'battery charging current','A'),dischargeCurrent:value(map,'battery discharge current','A'),solarToday:value(map,'daily power generation','kWh')}]}))}

export class DessMonitorProvider implements MonitoringProvider {
 async getIdentity(){const selected=await inverter();return {serial:selected.sn,name:selected.alias||'Photon inverter',collector:selected.pn};}
 async getStatus():Promise<ProviderStatus>{try{const snapshot=await this.getSnapshot();return{provider:'dessmonitor',status:'connected',lastSuccessAt:snapshot.updatedAt,blocker:null}}catch(error){return{provider:'dessmonitor',status:'degraded',lastSuccessAt:null,blocker:error instanceof Error?error.message:'DessMonitor is unavailable'}}}
 async getSnapshot(force=false):Promise<DessSnapshot>{
  const selected=await inverter(),current=localDate();let data:DayData;if(force)dayCache.delete(`${selected.sn}:${current}`);
  try{data=await dayData(selected,current)}catch(error){if(!(error instanceof Error)||!error.message.includes('ERR_NO_RECORD'))throw error;data=await dayData(selected,shiftDate(current,-1))}
  const series=points(data),last=series.at(-1);if(!last)throw new Error('DessMonitor returned no recent readings');
  const row=(data.row??[]).findLast(row=>timestamp(row.field[1])===last.sourceTimestamp)??data.row.at(-1)!;
  const map=fieldMap(data,row.field),quality=Date.now()-Date.parse(last.sourceTimestamp)>10*60_000?'stale':'good';
  const definitions:Array<[string,string,string?]>=[['solar_power','pv power','W'],['home_power','output active power','W'],['grid_power','mains power','W'],['battery_soc','battery capacity','%'],['battery_voltage','cell voltage','V'],['battery_charge_current','battery charging current','A'],['battery_discharge_current','battery discharge current','A'],['solar_today','daily power generation','kWh'],['solar_month','monthly power generation','kWh'],['solar_total','gross generation','kWh'],['pv_voltage','pv voltages','V'],['pv_current','pv current','A'],['grid_voltage','grid voltage','V'],['grid_frequency','frequency of grid','Hz'],['output_voltage','output voltage','V'],['output_frequency','output frequency','Hz'],['output_apparent_power','output reactive power','VA'],['output_load','output load percentage','%'],['inverter_temperature','inverting temperature'],['maximum_temperature','maximum temperature'],['fan_1_speed','fan 1 rotational speed percentage','%'],['battery_count','number of batteries'],['fault_code','fault code']];
  const readings:Reading[]=definitions.map(([metric,title,target])=>{const field=map.get(title);let number=value(map,title,target);if(metric==='fault_code'&&field?.value==='--')number=0;if(metric==='battery_soc')number=last.battery;if(metric==='battery_charge_current')number=last.chargeCurrent;if(metric==='battery_discharge_current')number=last.dischargeCurrent;return{entityId:selected.sn,metric,value:number,unit:target??field?.unit??'',sourceTimestamp:last.sourceTimestamp,quality:number===null?'missing':quality}});
  return{readings,series,device:{name:selected.alias||'Photon inverter',serial:selected.sn,collector:selected.pn,mode:map.get('pattern')?.value??null},updatedAt:last.sourceTimestamp,rawFields:data.row.flatMap(row=>{const stamp=timestamp(row.field[1]);return stamp?[{sourceTimestamp:stamp,fields:Object.fromEntries(fieldMap(data,row.field))}]:[]})};
 }
 async getHistory(from:string,to:string,granularity:'raw'|'hour'|'day'):Promise<HistorySnapshot>{
  if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>30*86_400_000)throw new Error('Historical range must be between 1 and 31 days');
  const selected=await inverter(),dates:string[]=[];for(let date=from;date<=to;date=shiftDate(date,1))dates.push(date);
  const all:SolarPoint[]=[];for(let i=0;i<dates.length;i+=4){const results=await Promise.all(dates.slice(i,i+4).map(async date=>{try{return points(await dayData(selected,date))}catch(error){if(error instanceof Error&&error.message.includes('ERR_NO_RECORD'))return[];throw error}}));results.forEach(result=>all.push(...result));}
  return{series:aggregatePoints(all,granularity),from,to,granularity,sampleCount:sortedPoints(all).length};
 }
 async getDay(date:string){
  if(!validDate(date))throw new Error('Choose a valid history date');
  const selected=await inverter();let data:DayData;try{data=await dayData(selected,date)}catch(error){if(error instanceof Error&&error.message.includes('ERR_NO_RECORD'))return{series:[] as SolarPoint[],rawFields:[] as NonNullable<DessSnapshot['rawFields']>};throw error}
  return{series:points(data),rawFields:(data.row??[]).flatMap(row=>{const stamp=timestamp(row.field[1]);return stamp?[{sourceTimestamp:stamp,fields:Object.fromEntries(fieldMap(data,row.field))}]:[]})};
 }
 // Raw device list: every attribute DessMonitor exposes for the plant's devices.
 async getDeviceInfo(){const data=await call<{device:Array<Record<string,unknown>>}>('&action=queryDevices&page=0&pagesize=50');return data.device??[];}
 async getAlarms(page=0){const selected=await inverter(),data=await call<Record<string,unknown>>(`&action=queryDeviceWarning&i18n=en_US${identity(selected)}&page=${page}&pagesize=50`),list=Object.values(data).find(Array.isArray) as Array<Record<string,unknown>>|undefined;return{entityId:selected.sn,alarms:list??[],more:Number(data.total??0)>(page+1)*50};}
 async getEnergyPeriods(type:'day'|'month'|'year',date=localDate().slice(0,type==='day'?7:4)):Promise<ProviderPeriods>{
  const selected=await inverter(),key=`${selected.sn}:${type}:${date}`,cached=periodsCache.get(key);if(cached&&cached.expiresAt>Date.now())return cached.data;
  const keys=await call<{keys:string[]}>(`&action=querySPKeyParameters&devcode=${selected.devcode}`),solarParameter=type==='day'?'ENERGY_TODAY':'ENERGY_TOTAL',gridParameter=type==='day'?'ENERGY_TODAY_FROM_GRID':'ENERGY_TOTAL_FROM_GRID';
  if(!keys.keys?.includes(solarParameter))throw new Error('This inverter does not report historical solar energy counters');
  const fields=await call<Array<{title:string;val:string;unit?:string}>>(`&action=queryDeviceLastData${identity(selected)}&i18n=en`),solarUnit=fields.find(item=>item.title.toLowerCase()===(type==='day'?'daily power generation':'gross generation'))?.unit;
  if(!solarUnit||normalizeMeasurement(1,solarUnit,'kWh')===null)throw new Error('Historical solar energy unit is unavailable');
  const action=type==='day'?'querySPDeviceKeyParameterMonthPerDay':type==='month'?'querySPDeviceKeyParameterYearPerMonth':'querySPDeviceKeyParameterTotalPerYear';
  const query=(parameter:string)=>call<{option:Array<{gts:string;val:string}>}>(`&action=${action}&parameter=${parameter}${identity(selected)}${type==='year'?'':`&date=${date}`}`),solar=await query(solarParameter);
  // Unsupported parameters return synthetic zeros. Require declared support
  // and an explicit unit before accepting a grid counter.
  const gridUnit=fields.find(item=>/^(gross|total) (grid|mains) (consumption|energy)$/i.test(item.title))?.unit;
  const grid=keys.keys.includes(gridParameter)&&gridUnit&&normalizeMeasurement(1,gridUnit,'kWh')!==null?await query(gridParameter):null;
  const gridByDate=new Map(grid?.option.map(item=>[item.gts,normalizeMeasurement(item.val,gridUnit!,'kWh')])??[]),cutoff=localDate().slice(0,type==='day'?10:type==='month'?7:4);
  const buckets=solar.option.filter(item=>/^\d{4}(-\d{2}){0,2}$/.test(item.gts)&&item.gts<=cutoff).map(item=>({date:item.gts,solar:normalizeMeasurement(item.val,solarUnit,'kWh'),grid:gridByDate.get(item.gts)??null,home:null,source:`provider:${solarParameter}`,gridSource:grid?'provider:energy-counter':'missing',coveredHours:0,partial:item.gts===cutoff}));
  const data:ProviderPeriods={entityId:selected.sn,type,buckets,updatedAt:new Date().toISOString(),solarParameter,unit:'kWh'};if(periodsCache.size>36)periodsCache.clear();periodsCache.set(key,{expiresAt:Date.now()+5*60_000,data});return data;
 }
 async getLatest():Promise<Reading[]>{return(await this.getSnapshot()).readings}
}
