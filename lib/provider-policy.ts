import { appDb } from './db';
import { env } from '@/lib/env';
export type ProviderId='dessmonitor'|'tuya';
export type DeviceRef={provider:ProviderId;id:string};
export function providerPolicy(provider:ProviderId,now=new Date()) {
  const config=env as unknown as Record<string,string|undefined>;
  const allowance=Number(config.TUYA_MONTHLY_ALLOWANCE),expires=Date.parse(config.TUYA_ENTITLEMENT_EXPIRES??'');
  const verified=provider==='tuya'&&Number.isSafeInteger(allowance)&&allowance>0&&expires>+now;
  const requested=Number(config.TUYA_POLL_SECONDS??300);
  return {provider,verified,allowance:verified?allowance:null,
    intervalMs:provider==='dessmonitor'?300000:verified?Math.max(60000,Number.isFinite(requested)?requested*1000:300000):300000,
    foreground:verified&&config.TUYA_FOREGROUND_REFRESH==='true',
    limitation:provider==='tuya'&&!verified?'Five-minute updates until the account allowance is verified.':null};
}

// Reserve before the network call so concurrent workers share the same hard cap.
export async function reserveProviderRequest(provider:ProviderId,purpose:string,now=new Date()) {
  if(!appDb())return;
  const policy=providerPolicy(provider,now);if(!policy.verified||policy.allowance===null)return;
  const month=now.toISOString().slice(0,7),config=env as unknown as Record<string,string|undefined>;
  const external=Math.max(0,Number(config.TUYA_EXTERNAL_MONTHLY_CALLS)||0),available=Math.max(0,policy.allowance-external);
  const discretionary=Math.floor(available*.8),priority=purpose==='command'||purpose==='confirmation'||purpose==='auth';
  const days=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();
  const paced=Math.floor(discretionary*now.getUTCDate()/days);
  const limit=priority?available:purpose==='history'?Math.floor(paced*.8):paced;
  // The month's calls are counted once, when its budget row does not exist yet; the range (not substr) lets the timestamp index serve it.
  const next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  await appDb().prepare('INSERT OR IGNORE INTO provider_budget(provider,period,used) SELECT ?,?,(SELECT COUNT(*) FROM provider_requests WHERE provider=? AND timestamp>=? AND timestamp<?) WHERE NOT EXISTS (SELECT 1 FROM provider_budget WHERE provider=? AND period=?)').bind(provider,month,provider,month+'-01',next,provider,month).run();
  const row=await appDb().prepare('UPDATE provider_budget SET used=used+1 WHERE provider=? AND period=? AND used<? RETURNING used').bind(provider,month,limit).first();
  if(!row)throw new Error('Provider request budget reached; waiting for the next allowance window.');
}
