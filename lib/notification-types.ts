import type { TuyaDashboardDevice } from './providers/tuya';
export type AlertKind='low_battery'|'stale_solar'|'device_offline'|'switch_change'|'sensor';
export type AlertRule={id:string;kind:AlertKind;enabled:boolean;recovery:boolean;deviceId?:string;code?:string;operator?:'above'|'below'|'equals'|'change';threshold?:number|string|boolean|null};
export type AlertObservation={value:string|number|boolean|null;timestamp:string;active:boolean};
export type AlertState={active:boolean;value:string|number|boolean|null;timestamp:string;sequence:number};
export function transition(previous:AlertState|null,observation:AlertObservation,rule:AlertRule) {
  // Ignore repeat and out-of-order telemetry. Staleness uses evaluation time instead.
  if(previous && Date.parse(observation.timestamp)<=Date.parse(previous.timestamp))return null;
  const changed=previous!==null && previous.value!==observation.value;
  const event=rule.kind==='switch_change'||rule.operator==='change' ? changed : observation.active && !previous?.active;
  const recovered=Boolean(previous?.active && !observation.active && rule.recovery && rule.kind!=='switch_change' && rule.operator!=='change');
  return {state:{...observation,sequence:(previous?.sequence??0)+(event||recovered?1:0)},event:event||recovered,recovered};
}
export function eligibleCapabilities(device:TuyaDashboardDevice) {
  return device.capabilities.filter(cap=>cap.type==='Boolean'||cap.type==='Enum'||(cap.type==='Integer'&&cap.metadataVerified));
}
export function validateRules(input:unknown,devices:TuyaDashboardDevice[]):AlertRule[] {
  if(!Array.isArray(input)||input.length>100)throw new Error('Choose at most 100 alert rules.');
  const seen=new Set<string>();
  return input.map(raw=>{
    if(!raw||typeof raw!=='object')throw new Error('Invalid alert rule.');
    const r=raw as AlertRule;
    if(typeof r.id!=='string'||!/^[-\w]{1,80}$/.test(r.id)||seen.has(r.id))throw new Error('Invalid or repeated alert ID.');
    seen.add(r.id);
    if(!['low_battery','stale_solar','device_offline','switch_change','sensor'].includes(r.kind)||typeof r.enabled!=='boolean'||typeof r.recovery!=='boolean')throw new Error('Invalid alert type.');
    const rule:AlertRule={id:r.id,kind:r.kind,enabled:r.enabled,recovery:r.recovery};
    if(r.kind==='low_battery'||r.kind==='stale_solar') {
      const threshold=r.threshold??null;
      if(threshold!==null&&(typeof threshold!=='number'||!Number.isFinite(threshold)||threshold<(r.kind==='low_battery'?1:5)||threshold>(r.kind==='low_battery'?99:1440)))throw new Error('Invalid alert threshold.');
      rule.threshold=threshold;return rule;
    }
    const device=devices.find(d=>d.id===r.deviceId);
    if(!device)throw new Error('Alert device is not linked to this home.');
    rule.deviceId=device.id;
    if(r.kind==='device_offline')return rule;
    const cap=eligibleCapabilities(device).find(c=>c.code===r.code);
    if(!cap)throw new Error('This device reading cannot be used for alerts.');
    rule.code=cap.code;
    if(r.kind==='switch_change') {
      if(cap.type!=='Boolean'||!cap.code.startsWith('switch'))throw new Error('Choose a supported switch channel.');
      rule.operator='change';return rule;
    }
    if(!['above','below','equals','change'].includes(r.operator??''))throw new Error('Choose an alert condition.');
    rule.operator=r.operator;
    if(r.operator==='change')return rule;
    if(cap.type==='Integer') {
      if(typeof r.threshold!=='number'||!Number.isFinite(r.threshold)||(cap.min!==undefined&&r.threshold<cap.min)||(cap.max!==undefined&&r.threshold>cap.max))throw new Error('Threshold is outside the sensor range.');
    } else {
      if(r.operator!=='equals')throw new Error('Choose equals for this sensor.');
      if(cap.type==='Boolean'&&typeof r.threshold!=='boolean')throw new Error('Choose true or false.');
      if(cap.type==='Enum'&&(typeof r.threshold!=='string'||!cap.options?.includes(r.threshold)))throw new Error('Choose a supported sensor value.');
    }
    rule.threshold=r.threshold;return rule;
  });
}
