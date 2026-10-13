import { appDb } from './db';
import { env } from 'cloudflare:workers';
import { cachedDevices } from './tuya-store';
import { savedSettings } from './settings-store';
import { transition,validateRules,type AlertRule,type AlertState,type AlertObservation } from './notification-types';
import type { DessSnapshot } from './providers/dessmonitor';
import type { TuyaDashboardDevice } from './providers/tuya';
import { decodeTuya } from './tuya-format';
import { appAlertStatement,ensureAppAlerts } from './app-alerts';

export function notificationDb(){if(!appDb())throw new Error('Notification storage is unavailable.');return appDb();}
export function pushConfig(){const e=env as unknown as Record<string,unknown>;return {subject:String(e.VAPID_SUBJECT??''),publicKey:String(e.VAPID_PUBLIC_KEY??''),privateKey:String(e.VAPID_PRIVATE_KEY??'')};}
export async function rulesFor(userId:string){return (await notificationDb().prepare('SELECT config FROM notification_rules WHERE user_id=? ORDER BY id').bind(userId).all<{config:string}>()).results.map(r=>JSON.parse(r.config) as AlertRule);}
export async function saveRules(userId:string,input:unknown,devices:TuyaDashboardDevice[]){
  const rules=validateRules(input,devices),db=notificationDb(),previous=await rulesFor(userId),statements=[];
  for(const old of previous)if(!rules.some(r=>r.id===old.id&&JSON.stringify(r)===JSON.stringify(old))){
    statements.push(db.prepare('DELETE FROM notification_state WHERE user_id=? AND rule_id=?').bind(userId,old.id));
    statements.push(db.prepare("UPDATE notification_deliveries SET status='cancelled' WHERE user_id=? AND rule_id=? AND status='pending'").bind(userId,old.id));
  }
  statements.push(db.prepare('DELETE FROM notification_rules WHERE user_id=?').bind(userId));
  for(const r of rules)statements.push(db.prepare('INSERT INTO notification_rules(user_id,id,config) VALUES (?,?,?)').bind(userId,r.id,JSON.stringify(r)));
  await db.batch(statements);return rules;
}
export function validateSubscription(input:unknown){
  const s=input as {endpoint?:unknown;expirationTime?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
  if(!s||typeof s.endpoint!=='string'||s.endpoint.length>2048)throw new Error('Invalid push subscription.');
  const url=new URL(s.endpoint);
  // Chrome on supported Android uses FCM. Prevent arbitrary server-side URL fetches.
  if(url.protocol!=='https:'||url.hostname!=='fcm.googleapis.com'||url.port||url.username||url.password||!url.pathname.startsWith('/fcm/send/'))throw new Error('Use Chrome to enable notifications.');
  if(typeof s.keys?.p256dh!=='string'||!/^[\w-]{87}$/.test(s.keys.p256dh)||typeof s.keys.auth!=='string'||!/^[\w-]{22}$/.test(s.keys.auth))throw new Error('Invalid push keys.');
  return {endpoint:s.endpoint,expirationTime:typeof s.expirationTime==='number'?s.expirationTime:null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function subscriptionId(endpoint:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function subscribe(userId:string,input:unknown){
  const sub=validateSubscription(input),id=await subscriptionId(sub.endpoint),db=notificationDb();
  const count=await db.prepare('SELECT COUNT(*) count FROM push_subscriptions WHERE user_id=?').bind(userId).first<{count:number}>();
  const existing=await db.prepare('SELECT user_id FROM push_subscriptions WHERE id=?').bind(id).first<{user_id:string}>();
  if(existing&&existing.user_id!==userId)throw new Error('Subscription belongs to another account.');
  if(!existing&&(count?.count??0)>=20)throw new Error('Remove an old phone subscription first.');
  await db.prepare('INSERT INTO push_subscriptions(id,user_id,subscription,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription').bind(id,userId,JSON.stringify(sub),new Date().toISOString()).run();return id;
}
export async function unsubscribe(userId:string,endpoint:string){const id=await subscriptionId(endpoint),db=notificationDb();await db.batch([db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND id=?').bind(userId,id),db.prepare("UPDATE notification_deliveries SET status='cancelled' WHERE user_id=? AND subscription_id=? AND status='pending'").bind(userId,id)]);}
async function observations(now:Date){
  const db=notificationDb(),solarRow=await db.prepare("SELECT capabilities FROM device_catalog WHERE source='dessmonitor' ORDER BY updated_at DESC LIMIT 1").first<{capabilities:string}>();
  const solar=solarRow?JSON.parse(solarRow.capabilities) as DessSnapshot:null;
  const devices=await cachedDevices();
  // cachedDevices intentionally marks everything offline for UI. Use recorded status for alerts.
  const catalog=await db.prepare("SELECT id,online,updated_at FROM device_catalog WHERE source='tuya'").all<{id:string;online:number;updated_at:string}>();
  for(const d of devices){const row=catalog.results.find(r=>r.id===d.id);d.online=Boolean(row?.online);d.stale=!row||now.getTime()-Date.parse(row.updated_at+'Z')>15*60000;d.updatedAt=row?.updated_at+'Z'||d.updatedAt;}
  return {solar,devices};
}
export function observe(rule:AlertRule,solar:DessSnapshot|null,devices:TuyaDashboardDevice[],reserve:number,now:Date):AlertObservation|null {
  if(rule.kind==='stale_solar')return {value:solar?.updatedAt??null,timestamp:now.toISOString(),active:!solar||now.getTime()-Date.parse(solar.updatedAt)>(Number(rule.threshold??15)*60000)};
  if(rule.kind==='low_battery'){
    const reading=solar?.readings.find(r=>r.metric==='battery_soc');
    if(reading?.value==null||reading.quality==='missing'||now.getTime()-Date.parse(reading.sourceTimestamp)>15*60000)return null;
    return {value:reading.value,timestamp:reading.sourceTimestamp,active:reading.value<=Number(rule.threshold??reserve)};
  }
  const d=devices.find(d=>d.id===rule.deviceId);if(!d||d.stale)return null;
  if(rule.kind==='device_offline')return {value:d.online,timestamp:d.updatedAt,active:!d.online};
  if(!d.online)return null;
  const cap=d.capabilities.find(c=>c.code===rule.code),point=d.datapoints.find(p=>p.code===rule.code);
  if(!cap||!point||!point.available)return null;
  // Apply the same physical units as the dashboard (including special unit decoding).
  const value=cap.type==='Integer'?decodeTuya(point.raw,cap).numericValue:point.raw;
  if(value===null||!['string','number','boolean'].includes(typeof value))return null;
  const scalar=value as number|string|boolean;
  const active=rule.operator==='above'?typeof scalar==='number'&&scalar>Number(rule.threshold):rule.operator==='below'?typeof scalar==='number'&&scalar<Number(rule.threshold):rule.operator==='equals'?scalar===rule.threshold:false;
  return {value:scalar,timestamp:point.updatedAt,active};
}
function message(rule:AlertRule,observation:AlertObservation,recovered:boolean,devices:TuyaDashboardDevice[]){
  const name=devices.find(d=>d.id===rule.deviceId)?.name??'Device';
  const title=recovered?'Photon · recovered':'Photon · alert';
  const body=rule.kind==='low_battery'?`Battery ${observation.value}%${recovered?' · above reserve again':''}`:rule.kind==='stale_solar'?recovered?'Solar readings are updating again.':'Solar readings are overdue.':rule.kind==='device_offline'?`${name} is ${recovered?'online again':'offline'}.`:`${name} · ${rule.code}: ${String(observation.value)}${recovered?' · condition cleared':''}`;
  return {title,body,url:rule.deviceId?`/devices?device=${encodeURIComponent(rule.deviceId)}`:'/solar'};
}
export async function evaluateAlerts(now=new Date()){
  const db=notificationDb(),token=crypto.randomUUID(),stamp=now.toISOString();
  await db.prepare("INSERT OR IGNORE INTO notification_health(id) VALUES ('evaluator')").run();
  const lease=await db.prepare("UPDATE notification_health SET lease_token=?,lease_until=? WHERE id='evaluator' AND (lease_until IS NULL OR lease_until<?) RETURNING id").bind(token,new Date(now.getTime()+5*60000).toISOString(),stamp).first();
  if(!lease)return {status:'already_running',events:0};
  let events=0;
  try {
    await ensureAppAlerts();
    const {solar,devices}=await observations(now),rows=await db.prepare('SELECT user_id,config FROM notification_rules ORDER BY user_id,id LIMIT 101').all<{user_id:string;config:string}>();
    for(const row of rows.results){
      const rule=JSON.parse(row.config) as AlertRule;if(!rule.enabled)continue;
      const reserve=(await savedSettings(row.user_id)).threshold,observation=observe(rule,solar,devices,reserve,now);if(!observation)continue;
      const old=await db.prepare('SELECT state FROM notification_state WHERE user_id=? AND rule_id=?').bind(row.user_id,rule.id).first<{state:string}>();
      const update=transition(old?JSON.parse(old.state) as AlertState:null,observation,rule);if(!update)continue;
      const statements=[db.prepare('INSERT INTO notification_state(user_id,rule_id,state) VALUES (?,?,?) ON CONFLICT(user_id,rule_id) DO UPDATE SET state=excluded.state').bind(row.user_id,rule.id,JSON.stringify(update.state))];
      if(update.event){
        const eventId=`${row.user_id}:${rule.id}:${update.state.sequence}:${observation.timestamp}`;
        const payload={...message(rule,observation,update.recovered,devices),accountId:row.user_id,eventId};
        const subscriptions=await db.prepare('SELECT id FROM push_subscriptions WHERE user_id=?').bind(row.user_id).all<{id:string}>();
        statements.push(appAlertStatement(row.user_id,{eventId,title:payload.title,body:payload.body,url:payload.url},stamp));
        for(const s of subscriptions.results)statements.push(db.prepare('INSERT OR IGNORE INTO notification_deliveries(event_id,subscription_id,user_id,rule_id,payload,next_attempt,created_at) VALUES (?,?,?,?,?,?,?)').bind(eventId,s.id,row.user_id,rule.id,JSON.stringify(payload),stamp,stamp));
        events++;
      }
      await db.batch(statements);
    }
    await deliverPending(now);
    await db.prepare("UPDATE notification_health SET evaluated_at=?,error=NULL WHERE id='evaluator' AND lease_token=?").bind(stamp,token).run();
    await db.prepare("DELETE FROM notification_deliveries WHERE status!='pending' AND created_at<?").bind(new Date(now.getTime()-30*86400000).toISOString()).run();
    return {status:'completed',events};
  }catch(error){await db.prepare("UPDATE notification_health SET error=? WHERE id='evaluator' AND lease_token=?").bind(error instanceof Error?error.message:'Alert evaluation failed',token).run();throw error;}
  finally{await db.prepare("UPDATE notification_health SET lease_until=NULL,lease_token=NULL WHERE id='evaluator' AND lease_token=?").bind(token).run();}
}
export async function deliverPending(now=new Date()){
  const db=notificationDb(),config=pushConfig();if(!config.privateKey||!config.publicKey||!config.subject)throw new Error('Push delivery is not configured.');
  const {buildPushPayload}=await import('@block65/webcrypto-web-push');
  const rows=await db.prepare("SELECT d.*,s.subscription FROM notification_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id AND s.user_id=d.user_id WHERE d.status='pending' AND d.next_attempt<=? ORDER BY d.next_attempt LIMIT 20").bind(now.toISOString()).all<{event_id:string;subscription_id:string;user_id:string;payload:string;subscription:string;attempts:number;created_at:string}>();
  for(const row of rows.results){
    let status='pending',error:string|null=null;
    try{
      if(now.getTime()-Date.parse(row.created_at)>24*3600000){status='expired';}
      else {
        const subscription=validateSubscription(JSON.parse(row.subscription)),payload=await buildPushPayload({data:row.payload,options:{ttl:3600}},subscription,config);
        const response=await fetch(subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(10000)});
        if(response.status===404||response.status===410){await unsubscribe(row.user_id,subscription.endpoint);status='expired';}
        else if(response.ok){status='sent';await db.prepare("UPDATE notification_health SET delivered_at=? WHERE id='evaluator'").bind(now.toISOString()).run();}
        else {error=`Push service returned ${response.status}`;if(response.status!==429&&response.status<500)status='failed';}
      }
    }catch(reason){error=reason instanceof Error?reason.message:'Push delivery failed';}
    const attempts=row.attempts+1;if(attempts>=6&&status==='pending')status='failed';
    await db.prepare('UPDATE notification_deliveries SET status=?,attempts=?,next_attempt=?,error=? WHERE event_id=? AND subscription_id=?').bind(status,attempts,new Date(now.getTime()+Math.min(3600,300*2**row.attempts)*1000).toISOString(),error,row.event_id,row.subscription_id).run();
  }
}
export async function testNotification(userId:string,endpoint:string){
  const db=notificationDb(),id=await subscriptionId(endpoint),subscription=await db.prepare('SELECT id FROM push_subscriptions WHERE user_id=? AND id=?').bind(userId,id).first();
  if(!subscription)throw new Error('Enable notifications on this phone first.');
  const now=new Date().toISOString(),eventId=crypto.randomUUID();
  await db.prepare('INSERT INTO notification_deliveries(event_id,subscription_id,user_id,rule_id,payload,next_attempt,created_at) VALUES (?,?,?,?,?,?,?)').bind(eventId,id,userId,'test',JSON.stringify({title:'Photon',body:'Notifications are connected on this phone.',url:'/',eventId,accountId:userId}),now,now).run();
  // The scheduled evaluator owns dispatch, including retries and its durable lease.
  await evaluateAlerts();return eventId;
}
