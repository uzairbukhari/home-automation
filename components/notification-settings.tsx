'use client';
import {useUnsavedChanges} from '@/hooks/use-app-navigation';
import { useEffect,useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { useOffline } from './mobile-support';
import { eligibleCapabilities,type AlertRule } from '@/lib/notification-types';
import type { TuyaDashboardDevice } from '@/lib/providers/tuya';

type AlertResponse={rules:AlertRule[];publicKey:string;health:{evaluated_at?:string;error?:string}|null;error?:string};
async function api(path:string,method='GET',body?:unknown){const response=await fetch(`/api/notifications/${path}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),data=await response.json() as AlertResponse;if(!response.ok)throw new Error(data.error||'Notifications unavailable');return data;}
const initial:AlertRule[]=[{id:'battery',kind:'low_battery',enabled:false,recovery:true,threshold:null},{id:'solar-stale',kind:'stale_solar',enabled:false,recovery:true,threshold:15}];
export function NotificationSettings({devices}:{devices:TuyaDashboardDevice[]}){
  const offline=useOffline(),[rules,setRules]=useState<AlertRule[]>(initial),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[subscribed,setSubscribed]=useState(false),[message,setMessage]=useState(''),[health,setHealth]=useState<{evaluated_at?:string;error?:string}|null>(null);
  const [savedRules,setSavedRules]=useState<AlertRule[]>(initial),[permission,setPermission]=useState('default'),[deliveryLoaded,setDeliveryLoaded]=useState(false);
  useEffect(()=>{let active=true;if(offline)return;api('preferences').then(data=>{if(active){setRules(data.rules.length?data.rules:initial);setSavedRules(data.rules.length?data.rules:initial);setPublicKey(data.publicKey);setHealth(data.health);setLoaded(true);}}).catch(error=>{if(active)setMessage(error.message);});('serviceWorker' in navigator?navigator.serviceWorker.getRegistration():Promise.resolve(undefined)).then(reg=>reg?.pushManager?.getSubscription()).then(sub=>{if(active){setSubscribed(Boolean(sub));setDeliveryLoaded(true);}}).catch(()=>{if(active)setDeliveryLoaded(true);});return()=>{active=false;};},[offline]);
  useUnsavedChanges(loaded&&JSON.stringify(rules)!==JSON.stringify(savedRules));
  useEffect(()=>{queueMicrotask(()=>setPermission('Notification' in window?Notification.permission:'unsupported'));},[]);
  function edit(id:string,patch:Partial<AlertRule>){setRules(old=>old.map(rule=>rule.id===id?{...rule,...patch}:rule));}
  async function action(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(error){setMessage(error instanceof Error?error.message:'Notifications unavailable');}finally{setBusy(false);}}
  async function enable(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('Use Chrome on this device to enable notifications.');
    if(!publicKey)throw new Error('Push delivery has not been configured yet.');
    const allowed=await Notification.requestPermission();setPermission(allowed);if(allowed!=='granted')throw new Error('Notifications are blocked. Allow them in Chrome’s site settings to enable alerts.');
    const reg=await navigator.serviceWorker.ready,bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const sub=await reg.pushManager.getSubscription()??await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    try {await api('subscriptions','POST',sub.toJSON());}catch(error){await sub.unsubscribe();throw error;}
    setSubscribed(true);setMessage('This device is connected. Enable the alert rules you want and save.');
  }
  async function disable(){const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await api('subscriptions','DELETE',{endpoint:sub.endpoint});await sub.unsubscribe();}setSubscribed(false);setMessage('Notifications disabled on this device.');}
  function addDevice(){const device=devices[0];if(!device)return;setRules(old=>[...old,{id:crypto.randomUUID(),kind:'device_offline',deviceId:device.id,enabled:false,recovery:true}]);}
  const disabled=offline||busy||!loaded;
  if(offline)return <section className="setting-section"><h2>Notifications</h2><p>Connect to view your saved alert rules and device delivery settings. Changes are disabled offline.</p></section>;
  if(!loaded)return <section className="setting-section" role="status"><p>{message||'Loading notification preferences…'}</p></section>;
  return <section className="notification-settings setting-section"><div className="setting-heading"><span>Delivery on this device</span></div>
    <p className="source-note">Permission on this device: {permission==='granted'?'Allowed':permission==='denied'?'Blocked in Chrome settings':permission==='unsupported'?'Unavailable in this browser':'Not requested'} · Delivery: {!deliveryLoaded?'Checking…':subscribed?'Connected':'Not connected'}</p><div className="notification-actions"><Button variant="outline" disabled={disabled||!publicKey} onClick={()=>void action(subscribed?disable:enable)}>{subscribed?'Disable on this device':'Enable on this device'}</Button><Button variant="outline" disabled={disabled||!subscribed} onClick={()=>void action(async()=>{const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(!sub)throw new Error('Enable notifications first.');await api('test','POST',{endpoint:sub.endpoint});setMessage('Test notification queued for this device.');})}>Send test</Button></div>
    <h3>Alert rules</h3><p className="source-note">Choose which events should notify you. New device alerts start disabled.</p>{rules.map(rule=>{
      const device=devices.find(d=>d.id===rule.deviceId),cap=device?.capabilities.find(c=>c.code===rule.code);
      return <fieldset key={rule.id} className="alert-rule" disabled={disabled}><div className="alert-rule-heading"><strong>{rule.kind==='low_battery'?'Low battery':rule.kind==='stale_solar'?'Solar readings overdue':rule.kind==='high_load'?'High home load':rule.kind==='rule_ran'?'An automation changed a device':'Device alert'}</strong><Switch aria-label={`Enable ${rule.id}`} checked={rule.enabled} onCheckedChange={enabled=>edit(rule.id,{enabled})}/></div>
        {rule.kind==='low_battery'&&<label>Battery level (%)<Input type="number" min="1" max="99" placeholder="Use battery reserve setting" value={rule.threshold==null?'':Number(rule.threshold)} onChange={e=>edit(rule.id,{threshold:e.target.value===''?null:Number(e.target.value)})}/></label>}
        {rule.kind==='high_load'&&<label>Home load above (kW)<Input type="number" min="0.1" max="20" step="0.1" value={Number(rule.threshold??2.5)} onChange={e=>edit(rule.id,{threshold:Number(e.target.value)})}/></label>}
        {rule.kind==='stale_solar'&&<label>No readings for (minutes)<Input type="number" min="5" max="1440" value={Number(rule.threshold??15)} onChange={e=>edit(rule.id,{threshold:Number(e.target.value)})}/></label>}
        {rule.deviceId&&<>
          <label>Device<select value={rule.deviceId} onChange={e=>edit(rule.id,{deviceId:e.target.value,code:undefined,kind:'device_offline',operator:undefined,threshold:undefined})}>{devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Alert type<select value={rule.kind} onChange={e=>{const kind=e.target.value as AlertRule['kind'],candidate=device&&eligibleCapabilities(device).find(c=>kind==='switch_change'?c.type==='Boolean'&&c.code.startsWith('switch'):true);edit(rule.id,{kind,code:candidate?.code,operator:'change',threshold:undefined});}}><option value="device_offline">Offline / online</option>{device?.capabilities.some(c=>c.type==='Boolean'&&c.code.startsWith('switch'))&&<option value="switch_change">Switch changes</option>}{device&&eligibleCapabilities(device).length>0&&<option value="sensor">Sensor reading</option>}</select></label>
          {rule.kind!=='device_offline'&&<label>Reading<select value={rule.code??''} onChange={e=>edit(rule.id,{code:e.target.value,operator:'change',threshold:undefined})}>{device&&eligibleCapabilities(device).filter(c=>rule.kind!=='switch_change'||(c.type==='Boolean'&&c.code.startsWith('switch'))).map(c=><option key={c.code} value={c.code}>{c.name}{c.unit?` (${c.unit})`:''}</option>)}</select></label>}
          {rule.kind==='sensor'&&<><label>Condition<select value={rule.operator} onChange={e=>edit(rule.id,{operator:e.target.value as AlertRule['operator'],threshold:cap?.type==='Boolean'?true:cap?.type==='Enum'?cap.options?.[0]:cap?.min??0})}><option value="change">Value changes</option><option value="equals">Equals</option>{cap?.type==='Integer'&&<><option value="above">Above</option><option value="below">Below</option></>}</select></label>{rule.operator!=='change'&&(cap?.type==='Boolean'?<label>Value<select value={String(rule.threshold)} onChange={e=>edit(rule.id,{threshold:e.target.value==='true'})}><option value="true">True</option><option value="false">False</option></select></label>:cap?.type==='Enum'?<label>Value<select value={String(rule.threshold??'')} onChange={e=>edit(rule.id,{threshold:e.target.value})}>{cap.options?.map(v=><option key={v}>{v}</option>)}</select></label>:<label>Threshold ({cap?.unit})<Input type="number" min={cap?.min} max={cap?.max} step={cap?.step??'any'} value={Number(rule.threshold??0)} onChange={e=>edit(rule.id,{threshold:Number(e.target.value)})}/></label>)}</>}
        </>}
        {rule.kind!=='switch_change'&&rule.kind!=='rule_ran'&&rule.operator!=='change'&&<label className="alert-recovery">Notify on recovery<Switch checked={rule.recovery} onCheckedChange={recovery=>edit(rule.id,{recovery})}/></label>}
        {rule.deviceId&&<Button variant="outline" onClick={()=>setRules(old=>old.filter(r=>r.id!==rule.id))}>Remove rule</Button>}
      </fieldset>;
    })}
    <div className="notification-actions"><Button variant="outline" disabled={disabled||!devices.length||rules.length>=100} onClick={addDevice}>Add device alert</Button><Button disabled={disabled} onClick={()=>void action(async()=>{const data=await api('preferences','PUT',{rules});setRules(data.rules);setSavedRules(data.rules);setMessage('Alert rules saved.');})}>Save alert rules</Button></div>
    <details className="report-diagnostics"><summary>Evaluation health</summary><p className="source-note">Automatic checks require the external scheduler. The intended interval is five minutes; events between checks may be missed.</p>{health&&<p className="source-note">Last alert check: {health.evaluated_at?new Date(health.evaluated_at).toLocaleString('en-PK',{timeZone:'Asia/Karachi'}):'Not run yet'}{health.error?` · ${health.error}`:''}</p>}</details>
    {message&&<p className="connection-message" role="status">{message}</p>}
  </section>;
}
