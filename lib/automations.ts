import { recordEvaluation } from './automation-activity';
import { database, claimJob, finishJob } from './jobs';
import { cachedDevices } from './tuya-store';
import { cachedSnapshot } from './solar-store';
import { executeCommand } from './commands';
import { observeConditions, type AutomationRule, type RuleState, type Action } from './automation-types';
export async function automationSnapshot(userId:string){const db=database(),rules=await db.prepare('SELECT r.config,s.data FROM automation_rules r LEFT JOIN automation_state s ON r.id=s.rule_id WHERE user_id=? ORDER BY r.updated_at DESC').bind(userId).all<{config:string;data:string|null}>(),runs=(await db.prepare('SELECT a.* FROM automation_runs a JOIN automation_rules r ON a.rule_id=r.id WHERE r.user_id=? ORDER BY started_at DESC LIMIT 100').bind(userId).all<{id:string;rule_id:string;started_at:string;status:string;reason:string|null;inputs:string}>()).results,actions=(await db.prepare('SELECT a.*,l.device_id,l.code FROM automation_actions a LEFT JOIN tuya_command_log l ON a.command_id=l.id WHERE a.run_id IN (SELECT a.id FROM automation_runs a JOIN automation_rules r ON a.rule_id=r.id WHERE r.user_id=? ORDER BY started_at DESC LIMIT 100)').bind(userId).all<{run_id:string;action_index:number;status:string;error:string|null;device_id:string|null;code:string|null}>()).results;return{rules:rules.results.map(r=>({rule:JSON.parse(r.config) as AutomationRule,state:r.data?JSON.parse(r.data):null})),paused:Boolean((await db.prepare("SELECT paused FROM automation_control WHERE id='global'").first<{paused:number}>())?.paused),runs:runs.map(r=>({...r,actions:actions.filter(a=>a.run_id===r.id)}))};}
export async function evaluateAutomations(now=new Date()){
  const job=await claimJob('automation-evaluation',0,240000,now);if(!job)return{status:'already_running'};const db=database();
  try{const globallyPaused=Boolean((await db.prepare("SELECT paused FROM automation_control WHERE id='global'").first<{paused:number}>())?.paused);
    const [solar,devices,rows]=await Promise.all([cachedSnapshot(true,false),cachedDevices(true),db.prepare('SELECT r.config,s.data FROM automation_rules r LEFT JOIN automation_state s ON r.id=s.rule_id').all<{config:string;data:string|null}>()]);
    const candidates:Array<{rule:AutomationRule;state:RuleState;actions:Action[];recovery:boolean;inputs:unknown[];previous:RuleState}>=[];
    for(const row of rows.results){const rule=JSON.parse(row.config) as AutomationRule;if(!rule.enabled)continue;const state:RuleState=row.data?JSON.parse(row.data):{active:false},observation=observeConditions(rule.conditions,rule.logic,solar,devices,now);const previous={...state};state.lastEvaluated=now.toISOString();state.lastInputs=observation.inputs;state.reason='Conditions not met';
      const recovery=state.active&&rule.recovery?observeConditions(rule.recovery.conditions,'all',solar,devices,now):null;
      if(globallyPaused){state.since=undefined;state.reason='Paused globally';}
      else if(!observation.valid){state.since=undefined;state.reason='Blocked: missing, invalid, future or stale readings';}
      else if(state.active){if(recovery?.match)candidates.push({rule,state,actions:rule.recovery!.actions,recovery:true,inputs:recovery.inputs,previous});else if(!rule.recovery&&!observation.match){state.active=false;state.since=undefined;}else state.reason=rule.recovery?'Waiting for recovery':'Already acted; waiting for the condition to clear';}
      else if(observation.match){state.since??=now.toISOString();if(+now-Date.parse(state.since)>=rule.durationMinutes*60000)candidates.push({rule,state,actions:rule.actions,recovery:false,inputs:observation.inputs,previous});else state.reason='Waiting for sustained condition';}
      else state.since=undefined;
      if(!candidates.some(c=>c.rule.id===rule.id))await recordEvaluation(rule,state,previous,now);
      await db.prepare('INSERT INTO automation_state(rule_id,data) VALUES (?,?) ON CONFLICT(rule_id) DO UPDATE SET data=excluded.data').bind(rule.id,JSON.stringify(state)).run();
    }
    let executed=0;const overrides=(await db.prepare('SELECT device_id,code FROM channel_overrides WHERE until>?').bind(now.toISOString()).all<{device_id:string;code:string}>()).results;
    for(const candidate of candidates){const {rule,state,actions,recovery,inputs,previous}=candidate;let reason='';
      if(state.lastAction&&+now-Date.parse(state.lastAction)<rule.cooldownMinutes*60000)reason='Waiting for cooldown';
      if(actions.some(a=>overrides.some(o=>o.device_id===a.deviceId&&o.code===a.code)))reason='Paused by a manual channel override';
      if(actions.some(a=>!devices.find(d=>d.id===a.deviceId)?.online))reason='Blocked: action device is offline or stale';
      if(actions.some(a=>candidates.some(other=>other!==candidate&&other.actions.some(b=>b.deviceId===a.deviceId&&b.code===a.code&&JSON.stringify(b.value)!==JSON.stringify(a.value)))))reason='Blocked: conflicting automation actions';
      if(reason){state.reason=reason;await recordEvaluation(rule,state,previous,now);await db.prepare('UPDATE automation_state SET data=? WHERE rule_id=?').bind(JSON.stringify(state),rule.id).run();continue;}
      const runId=crypto.randomUUID();state.active=!recovery;state.since=undefined;state.lastAction=now.toISOString();state.reason=recovery?'Recovery actions issued':'Trigger actions issued';
      const activity=await recordEvaluation(rule,state,previous,now,runId,true);
      // Commit the episode and action ledger before any physical command. Restart never replays it.
      await db.batch([...(activity?[activity]:[]),db.prepare('UPDATE automation_state SET data=? WHERE rule_id=?').bind(JSON.stringify(state),rule.id),db.prepare("INSERT INTO automation_runs(id,rule_id,started_at,status,inputs) VALUES (?,?,?,'executing',?)").bind(runId,rule.id,now.toISOString(),JSON.stringify(inputs)),...actions.map((_,index)=>db.prepare("INSERT INTO automation_actions(run_id,action_index,status) VALUES (?,?,'pending')").bind(runId,index))]);
      for(let index=0;index<actions.length;index++){const action=actions[index];try{const result=await executeCommand(action.deviceId,action.code,action.value,{origin:'automation',runId,devices});await db.prepare('UPDATE automation_actions SET command_id=?,status=?,error=? WHERE run_id=? AND action_index=?').bind(result.commandId,result.status,result.error??null,runId,index).run();}catch(error){await db.prepare("UPDATE automation_actions SET status='failed',error=? WHERE run_id=? AND action_index=?").bind(String(error),runId,index).run();await db.prepare("INSERT INTO automation_activity(rule_id,run_id,occurred_at,status,reason,inputs,rule_snapshot) VALUES (?,?,?,'failed',?,?,?)").bind(rule.id,runId,new Date().toISOString(),'Action could not be delivered; check device availability and supported controls.',JSON.stringify(inputs),JSON.stringify(rule)).run();}}
      await db.prepare("UPDATE automation_runs SET status='pending' WHERE id=?").bind(runId).run();executed++;
    }
    return{status:globallyPaused?'paused':'completed',executed,evaluated:rows.results.length};
  }catch(error){await finishJob(job,String(error),now);throw error;}finally{await finishJob(job,undefined,now);}
}
export async function simulateRule(rule:AutomationRule){
  const [solar,devices]=await Promise.all([cachedSnapshot(true,false),cachedDevices(true)]);return{...observeConditions(rule.conditions,rule.logic,solar,devices),recovery:rule.recovery?observeConditions(rule.recovery.conditions,'all',solar,devices):null,actions:rule.actions,note:'Preview only. No commands sent.'};
}
