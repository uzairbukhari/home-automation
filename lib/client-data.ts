import { useEffect, useState } from 'react';
// Share in-flight reads only. Private responses remain owned by the account-aware worker.
const pending=new Map<string,Promise<unknown>>();
const commands=new Set<string>();
// Last values seen in this tab, so a page opens with them while fresh data loads. Never filled on the server.
const remembered=new Map<string,unknown>();
export const recall=<T,>(key:string):T|undefined=>typeof window==='undefined'?undefined:remembered.get(key) as T|undefined;
export const remember=<T,>(key:string,value:T)=>{remembered.set(key,value);return value;};
// Every successful GET through readJson is remembered by URL, so a card that opens again (another tab, a revisit) shows the last response at once and refreshes behind it.
const jsonKey=(url:string)=>'json:'+url;
export const cachedJson=<T,>(url:string)=>recall<T>(jsonKey(url));
/** Stale-while-revalidate read: the remembered response for the URL straight away (if any), replaced when the fresh one arrives. A failed refresh keeps the old data and reports the error. */
export function useJson<T>(url:string|null,fallbackError='Unable to load data'):{data:T|undefined;error:string} {
 const [state,setState]=useState<{url:string|null;data:T|undefined;error:string}>(()=>({url,data:url?cachedJson<T>(url):undefined,error:''}));
 useEffect(()=>{
  if(!url)return;
  let active=true;
  readJson<T>(url).then(data=>{if(active)setState({url,data,error:''});}).catch(reason=>{if(active)setState(previous=>({url,data:cachedJson<T>(url)??previous.data,error:reason instanceof Error?reason.message:fallbackError}));});
  return()=>{active=false;};
 },[url,fallbackError]);
 // While a new URL loads, show what it remembers, else what was on screen before.
 if(state.url===url)return{data:state.data,error:state.error};
 return{data:(url?cachedJson<T>(url):undefined)??state.data,error:''};
}
export async function sendDeviceCommand(deviceId:string,code:string,value:unknown) {
 if(commands.has(deviceId))throw new Error('A command is already in progress for this device.');
 commands.add(deviceId);
 try {
  const response=await fetch(`/api/devices/tuya/${encodeURIComponent(deviceId)}/command`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,value})});
  const data=await response.json() as {error?:string;status?:string};
  if(!response.ok||data.status==='failed'||data.status==='expired')throw new Error(data.error||'Command failed');if(data.status==='uncertain')return 'Delivery uncertain; waiting for a device update. Do not repeat the command.';
  return data.status==='confirmed'?'Device confirmed the change.':'Command accepted; awaiting device confirmation.';
 } finally {commands.delete(deviceId);}
}
export function readJson<T>(url:string):Promise<T> {
 const hit=pending.get(url);if(hit)return hit as Promise<T>;
 const request=fetch(url,{cache:'no-store'}).then(async response=>{const body=await response.json() as T & {error?:string};if(!response.ok)throw new Error(body.error||'Unable to load data');return remember(jsonKey(url),body);}).finally(()=>pending.delete(url));
 pending.set(url,request);return request;
}
export function foregroundPoll(refresh:()=>void,milliseconds:number) {
 let stopped=false;
 const run=()=>{if(!stopped&&document.visibilityState!=='hidden')refresh();};
 run();const timer=setInterval(run,milliseconds);
 document.addEventListener('visibilitychange',run);
 return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',run);};
}
// Polls once now, then again after whatever delay() says once each read finishes. Reads on return to the tab.
export function scheduledPoll(refresh:()=>Promise<void>|void,delay:()=>number) {
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,running=false;
 const run=async()=>{
  clearTimeout(timer);
  if(stopped||running||document.visibilityState==='hidden')return;
  running=true;
  try{await refresh();}finally{running=false;if(!stopped)timer=setTimeout(run,delay());}
 };
 void run();
 const visible=()=>{if(document.visibilityState!=='hidden')void run();};
 document.addEventListener('visibilitychange',visible);
 return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
}
