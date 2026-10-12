import { validDate } from './measurements';
import { database } from './jobs';
import type { AutomationRule, RuleState } from './automation-types';

export async function recordEvaluation(rule: AutomationRule, state: RuleState, previous: RuleState, now: Date, runId?: string, defer=false) {
  const inputs = state.lastInputs ?? [];
  const fingerprint = JSON.stringify([inputs, state.reason, state.active, rule]);
  if (state.activityFingerprint === fingerprint && !runId) return;
  const status = runId ? 'triggered' : state.reason?.startsWith('Blocked') ? 'blocked' : state.reason?.includes('Paused') ? 'blocked' : state.reason === 'Conditions not met' ? 'unmatched' : 'waiting';
  const statement=database().prepare('INSERT INTO automation_activity(rule_id,run_id,occurred_at,status,reason,inputs,previous_inputs,rule_snapshot) VALUES (?,?,?,?,?,?,?,?)')
    .bind(rule.id, runId ?? null, now.toISOString(), status, state.reason ?? '', JSON.stringify(inputs), JSON.stringify(previous.lastInputs ?? []), JSON.stringify(rule));
  state.activityFingerprint = fingerprint;
  if(defer)return statement;
  await statement.run();
}

export async function activityPage(userId: string, params: URLSearchParams) {
  const cursor = Number(params.get('cursor') ?? Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(cursor) || cursor < 1) throw new Error('Invalid cursor');
  const rule = params.get('rule') ?? '', status = params.get('status') ?? '', from = params.get('from') ?? '', to = params.get('to') ?? '9999';
  if ((from && !validDate(from)) || (to !== '9999' && !validDate(to))) throw new Error('Invalid date');
  const rows = await database().prepare(`SELECT a.*,r.config FROM automation_activity a JOIN automation_rules r ON r.id=a.rule_id
    WHERE r.user_id=? AND a.id<? AND (?='' OR a.rule_id=?) AND (?='' OR a.status=?) AND a.occurred_at>=? AND a.occurred_at<? ORDER BY a.id DESC LIMIT 51`)
    .bind(userId, cursor, rule, rule, status, status, from ? new Date(from+'T00:00:00+05:00').toISOString() : '', to === '9999' ? to : new Date(Date.parse(to+'T00:00:00+05:00')+86400000).toISOString()).all<{id:number;config:string;inputs:string;previous_inputs:string;rule_snapshot:string;[key:string]:unknown}>();
  const items=rows.results.slice(0,50).map(({config,...row})=>({...row,name:(JSON.parse(config) as AutomationRule).name,inputs:JSON.parse(row.inputs),previousInputs:JSON.parse(row.previous_inputs),rule:JSON.parse(row.rule_snapshot)}));
  return {items,nextCursor:rows.results.length>50?items.at(-1)!.id:null};
}
