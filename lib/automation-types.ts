import type { TuyaDashboardDevice } from './providers/tuya';
import type { DessSnapshot } from './providers/dessmonitor';
import { validateCommand } from './providers/tuya';
import { localDate, localTime } from './measurements';
export type Condition={source:'solar'|'tuya'|'schedule';metric?:string;deviceId?:string;operator?:'below'|'above'|'gt'|'gte'|'lt'|'lte'|'equals';value?:number|string|boolean;start?:string;end?:string;days?:number[]};
export type Action={deviceId:string;code:string;value:number|string|boolean};
export type AutomationRule={id:string;name:string;enabled:boolean;logic:'all'|'any';conditions:Condition[];actions:Action[];recovery?:{conditions:Condition[];actions:Action[]};durationMinutes:number;cooldownMinutes:number};
export type RuleState={active:boolean;since?:string;lastAction?:string;lastEvaluated?:string;reason?:string;lastInputs?:unknown[];activityFingerprint?:string};
const solarMetrics=['battery_soc','solar_power','grid_power','home_power','battery_voltage','inverter_temperature'];
export function validateAutomation(input:unknown,devices:TuyaDashboardDevice[]):AutomationRule{
  if(!input||typeof input!=='object')throw new Error('Invalid automation');const r=input as AutomationRule;
  if(!/^[-\w]{1,80}$/.test(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||typeof r.enabled!=='boolean'||!['all','any'].includes(r.logic))throw new Error('Choose a name and valid rule settings');
  if(!Number.isInteger(r.durationMinutes)||r.durationMinutes<0||r.durationMinutes>1440||!Number.isInteger(r.cooldownMinutes)||r.cooldownMinutes<10||r.cooldownMinutes>1440)throw new Error('Duration must be 0–1440 minutes and cooldown 10–1440 minutes');
  const conditions=(list:Condition[])=>{if(!Array.isArray(list)||!list.length||list.length>10)throw new Error('Choose 1–10 conditions');return list.map(c=>{
    if(!c||!['solar','tuya','schedule'].includes(c.source))throw new Error('Unsupported condition');
    if(c.source==='schedule'){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start??'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.end??'')||c.start===c.end||!Array.isArray(c.days)||!c.days.length||c.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw new Error('Choose a time window and weekdays');return{source:c.source,start:c.start,end:c.end,days:[...new Set(c.days)]};}
    if(!['below','above','gt','gte','lt','lte','equals'].includes(c.operator??''))throw new Error('Choose a comparison');
    if(c.source==='solar'){if(!solarMetrics.includes(c.metric??'')||typeof c.value!=='number'||!Number.isFinite(c.value)||(c.metric==='battery_soc'&&(c.value<0||c.value>100)))throw new Error('Choose a supported solar reading and threshold');}
    else{const cap=devices.find(d=>d.id===c.deviceId)?.capabilities.find(cap=>cap.code===c.metric);if(!cap||!['Boolean','Integer','Enum'].includes(cap.type)||(cap.type==='Integer'&&!cap.metadataVerified))throw new Error('Unsupported device reading');if(cap.type==='Integer'){if(typeof c.value!=='number'||!Number.isFinite(c.value))throw new Error('Choose a numeric threshold');}else if(c.operator!=='equals'||(cap.type==='Boolean'?typeof c.value!=='boolean':!cap.options?.includes(String(c.value))))throw new Error('Choose a supported comparison value');}
    return{source:c.source,metric:c.metric,deviceId:c.source==='tuya'?c.deviceId:undefined,operator:c.operator==='above'?'gte':c.operator==='below'?'lte':c.operator,value:c.value};
  });};
  const actions=(list:Action[])=>{if(!Array.isArray(list)||!list.length||list.length>20)throw new Error('Choose 1–20 actions');const seen=new Set<string>();return list.map(a=>{const cap=devices.find(d=>d.id===a.deviceId)?.capabilities.find(c=>c.code===a.code&&c.writable);if(!cap||!['Boolean','Enum','Integer'].includes(cap.type)||(cap.type==='Integer'&&!cap.metadataVerified))throw new Error('Unsupported action');validateCommand(cap,a.value);const key=a.deviceId+':'+a.code;if(seen.has(key))throw new Error('Choose one action per channel');seen.add(key);return{deviceId:a.deviceId,code:a.code,value:a.value};});};
  const result:AutomationRule={id:r.id,name:r.name.trim(),enabled:r.enabled,logic:r.logic,conditions:conditions(r.conditions),actions:actions(r.actions),durationMinutes:r.durationMinutes,cooldownMinutes:r.cooldownMinutes};
  if(r.recovery){result.recovery={conditions:conditions(r.recovery.conditions),actions:actions(r.recovery.actions)};for(const c of result.conditions){const recover=result.recovery.conditions.find(x=>x.source===c.source&&x.deviceId===c.deviceId&&x.metric===c.metric);if(c.source!=='schedule'&&recover&&typeof c.value==='number'&&typeof recover.value==='number'&&((isLower(c.operator)===isLower(recover.operator))||(isLower(c.operator)&&recover.value<=c.value)||(!isLower(c.operator)&&recover.value>=c.value)))throw new Error('Recovery must use a separate threshold beyond the trigger');}}
  return result;
}
export function observeConditions(conditions:Condition[],logic:'all'|'any',solar:DessSnapshot|null,devices:TuyaDashboardDevice[],now=new Date()){
  const inputs=conditions.map(c=>{if(c.source==='schedule'){const time=localTime(now.toISOString()),day=new Date(localDate(now)+'T12:00:00Z').getUTCDay(),match=c.start!<c.end!?time>=c.start!&&time<c.end!:time>=c.start!||time<c.end!;return{condition:c,value:time,timestamp:now.toISOString(),valid:true,match:match&&Boolean(c.days?.includes(day))};}
    const d=devices.find(d=>d.id===c.deviceId),point=c.source==='solar'?solar?.readings.find(r=>r.metric===c.metric):d?.datapoints.find(p=>p.code===c.metric),timestamp=point&&('sourceTimestamp' in point?point.sourceTimestamp:typeof point.raw==='boolean'||typeof point.raw==='string'?point.collectedAt??point.updatedAt:point.updatedAt),value=point&&('raw' in point?typeof point.raw==='number'?point.numericValue:point.raw:point.value),valid=Boolean(point&&timestamp&&Date.parse(timestamp)<=+now&&+now-Date.parse(timestamp)<=600000&&(c.source==='solar'?('quality' in point&&point.quality==='good'):(d?.online&&!d.stale))&&value!==null&&value!==undefined);
    const match=valid&&(c.operator==='equals'?value===c.value:typeof value==='number'&&typeof c.value==='number'&&compareNumber(value,c.operator,c.value));return{condition:c,value,timestamp,valid,match};});
  return{inputs,valid:inputs.every(i=>i.valid),match:inputs.every(i=>i.valid)&&(logic==='all'?inputs.every(i=>i.match):inputs.some(i=>i.match))};
}

function isLower(operator:Condition['operator']){return ['below','lt','lte'].includes(operator??'');}
export function compareNumber(value:number,operator:Condition['operator'],threshold:number){switch(operator){case 'gt':return value>threshold;case 'lt':return value<threshold;case 'below':case 'lte':return value<=threshold;case 'above':case 'gte':return value>=threshold;default:return value===threshold;}}
