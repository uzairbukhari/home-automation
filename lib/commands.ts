import { TuyaProvider, validateCommand, type TuyaDashboardDevice } from './providers/tuya';
import { cachedDevices, logCommand, updateCommand } from './tuya-store';
import { claimJob, database, finishJob, iso } from './jobs';

export async function executeCommand(deviceId:string,code:string,value:unknown,options:{origin?:'manual'|'automation';runId?:string;confirm?:boolean;devices?:TuyaDashboardDevice[]}={}) {
  const db=database(),device=(options.devices??await cachedDevices(true)).find(d=>d.id===deviceId);
  if(!device)throw new Error('Device is not linked to this home');
  const cap=device.capabilities.find(c=>c.code===code&&c.writable);if(!cap)throw new Error('Unsupported control');
  if(cap.type==='Integer'&&!cap.metadataVerified)throw new Error('Control metadata is unverified');
  const raw=validateCommand(cap,value),origin=options.origin??'manual';
  if(!device.online||device.stale)throw new Error('Device is offline or its status is stale');
  const job=await claimJob(`command:${deviceId}:${code}`,0,600000);if(!job)throw new Error('A command is already pending for this channel');
  let id:number|undefined;
  try{
    const pending=await db.prepare("SELECT id FROM tuya_command_log WHERE device_id=? AND code=? AND status IN ('pending','accepted','uncertain') LIMIT 1").bind(deviceId,code).first();if(pending)throw new Error('A command is already pending for this channel');
    if(origin==='manual')await db.prepare('INSERT INTO channel_overrides(device_id,code,until) VALUES (?,?,?) ON CONFLICT(device_id,code) DO UPDATE SET until=excluded.until').bind(deviceId,code,new Date(Date.now()+3600000).toISOString()).run();
    const point=device.datapoints.find(p=>p.code===code),same=point&&Date.now()-Date.parse(point.collectedAt??point.updatedAt)<600000&&JSON.stringify(point.raw)===JSON.stringify(raw);
    id=await logCommand(deviceId,code,value,same?'confirmed':'pending');if(!id)throw new Error('Command could not be recorded');
    await db.prepare('INSERT INTO command_context(command_id,raw_value,origin,run_id,expires_at) VALUES (?,?,?,?,?)').bind(id,JSON.stringify(raw),origin,options.runId??null,new Date(Date.now()+600000).toISOString()).run();
    if(same){await updateCommand(id,'confirmed');return{commandId:id,status:'confirmed',skipped:true};}
    try{await new TuyaProvider().sendCommand(deviceId,code,value,device);await updateCommand(id,'accepted');}
    catch(error){const message=error instanceof Error?error.message:'Delivery failed',definite=/^Tuya \d+:/.test(message)&&!/429|500|502|503|504/.test(message);await updateCommand(id,definite?'failed':'uncertain',message);return{commandId:id,status:definite?'failed':'uncertain',error:message};}
    if(options.confirm){try{const statuses=await new TuyaProvider().getDeviceStatus(deviceId,true),p=statuses.find(p=>p.code===code);if(p){const stamp=new Date().toISOString(),{decodeTuya}=await import('./tuya-format'),decoded=decodeTuya(p.value,cap);await db.prepare('INSERT INTO tuya_latest(device_id,code,value_json,numeric_value,unit,source_timestamp,collected_at,quality) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(device_id,code) DO UPDATE SET value_json=excluded.value_json,numeric_value=excluded.numeric_value,unit=excluded.unit,source_timestamp=excluded.source_timestamp,collected_at=excluded.collected_at,quality=excluded.quality').bind(deviceId,code,JSON.stringify(p.value),decoded.numericValue,decoded.unit,p.t?new Date(p.t>1e12?p.t:p.t*1000).toISOString():stamp,stamp,'good').run();if(JSON.stringify(p.value)===JSON.stringify(raw))await updateCommand(id,'confirmed');}}catch{/* Accepted delivery stays accepted even when the confirmation read fails. */}}
    const row=await db.prepare('SELECT status FROM tuya_command_log WHERE id=?').bind(id).first<{status:string}>();return{commandId:id,status:row?.status??'accepted'};
  }finally{await finishJob(job);}
}
export async function reconcileCommands(now=new Date()){
  const db=database(),rows=await db.prepare("SELECT l.id,l.device_id,l.code,l.requested_at,c.raw_value,c.expires_at FROM tuya_command_log l JOIN command_context c ON l.id=c.command_id WHERE l.status IN ('pending','accepted','uncertain')").all<{id:number;device_id:string;code:string;requested_at:string;raw_value:string;expires_at:string}>();
  for(const row of rows.results){const point=await db.prepare('SELECT value_json,collected_at FROM tuya_latest WHERE device_id=? AND code=?').bind(row.device_id,row.code).first<{value_json:string;collected_at:string}>();if(point&&point.collected_at>=iso(row.requested_at)&&point.collected_at<=now.toISOString()&&+now-Date.parse(point.collected_at)<=600000&&point.value_json===row.raw_value)await updateCommand(row.id,'confirmed');else if(row.expires_at<=now.toISOString())await updateCommand(row.id,'expired','Device confirmation was not received within ten minutes');}
  await db.prepare("UPDATE automation_actions SET status=(SELECT status FROM tuya_command_log WHERE id=command_id),error=(SELECT error FROM tuya_command_log WHERE id=command_id) WHERE command_id IS NOT NULL AND status IN ('pending','accepted','uncertain')").run();
  await db.prepare("UPDATE automation_actions SET status='expired',error='Execution interrupted before delivery could be recorded; not replayed' WHERE command_id IS NULL AND status='pending' AND run_id IN (SELECT id FROM automation_runs WHERE started_at<?)").bind(new Date(+now-600000).toISOString()).run();
  await db.prepare("UPDATE automation_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM automation_actions a WHERE a.run_id=automation_runs.id AND a.status IN ('pending','accepted','uncertain')) THEN 'pending' WHEN EXISTS(SELECT 1 FROM automation_actions a WHERE a.run_id=automation_runs.id AND a.status IN ('failed','expired')) THEN 'partial_failure' ELSE 'confirmed' END WHERE status IN ('pending','executing') AND EXISTS(SELECT 1 FROM automation_actions WHERE run_id=automation_runs.id)").run();
}
