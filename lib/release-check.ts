import { database } from './jobs';
import { cachedDevices } from './tuya-store';
import { cachedSnapshot } from './solar-store';
import { validateAutomation,observeConditions,type AutomationRule } from './automation-types';

// The migration pauses existing rules. First successful collection validates them without commands.
export async function releaseCheck(providersHealthy:boolean){
 const db=database(),row=await db.prepare("SELECT data FROM upgrade_backup WHERE kind='release_control' AND record_key='photon-v2'").first<{data:string}>();
 if(!row)return false;
 const gate=JSON.parse(row.data) as {paused:number;status:string};if(gate.status==='verified')return false;
 if(!providersHealthy)return true;
 const [devices,solar,rules]=await Promise.all([cachedDevices(true),cachedSnapshot(true,false),db.prepare('SELECT config FROM automation_rules').all<{config:string}>()]);
 for(const item of rules.results){const rule=JSON.parse(item.config) as AutomationRule;if(!rule.enabled)continue;validateAutomation(rule,devices);const inputs=observeConditions(rule.conditions,rule.logic,solar,devices);if(!inputs.valid)return true;}
 await db.batch([db.prepare("UPDATE automation_control SET paused=? WHERE id='global'").bind(gate.paused),db.prepare("UPDATE upgrade_backup SET data=? WHERE kind='release_control' AND record_key='photon-v2'").bind(JSON.stringify({...gate,status:'verified',verifiedAt:new Date().toISOString()}))]);
 return true; // Resume normal evaluation on the next tick, never during cutover validation.
}
