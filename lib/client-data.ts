// Share in-flight reads only. Private responses remain owned by the account-aware worker.
const pending=new Map<string,Promise<unknown>>();
const commands=new Set<string>();
// Last values seen in this tab, so a page opens with them while fresh data loads. Never filled on the server.
const remembered=new Map<string,unknown>();
export const recall=<T,>(key:string):T|undefined=>typeof window==='undefined'?undefined:remembered.get(key) as T|undefined;
export const remember=<T,>(key:string,value:T)=>{remembered.set(key,value);return value;};
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
 const request=fetch(url,{cache:'no-store'}).then(async response=>{const body=await response.json() as T & {error?:string};if(!response.ok)throw new Error(body.error||'Unable to load data');return body;}).finally(()=>pending.delete(url));
 pending.set(url,request);return request;
}
export function foregroundPoll(refresh:()=>void,milliseconds:number) {
 let stopped=false;
 const run=()=>{if(!stopped&&document.visibilityState!=='hidden')refresh();};
 run();const timer=setInterval(run,milliseconds);
 document.addEventListener('visibilitychange',run);
 return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',run);};
}
