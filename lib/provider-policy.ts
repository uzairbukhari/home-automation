import { env } from 'cloudflare:workers';
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
  if(!env.DB)return;
  const policy=providerPolicy(provider,now);if(!policy.verified||policy.allowance===null)return;
  const month=now.toISOString().slice(0,7),config=env as unknown as Record<string,string|undefined>;
  const external=Math.max(0,Number(config.TUYA_EXTERNAL_MONTHLY_CALLS)||0),available=Math.max(0,policy.allowance-external);
  const discretionary=Math.floor(available*.8),priority=purpose==='command'||purpose==='confirmation'||purpose==='auth';
  const days=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();
  const paced=Math.floor(discretionary*now.getUTCDate()/days);
  const limit=priority?available:purpose==='history'?Math.floor(paced*.8):paced;
  await env.DB.prepare('INSERT OR IGNORE INTO provider_budget(provider,period,used) SELECT ?,?,COUNT(*) FROM provider_requests WHERE provider=? AND substr(timestamp,1,7)=?').bind(provider,month,provider,month).run();
  const row=await env.DB.prepare('UPDATE provider_budget SET used=used+1 WHERE provider=? AND period=? AND used<? RETURNING used').bind(provider,month,limit).first();
  if(!row)throw new Error('Provider request budget reached; waiting for the next allowance window.');
}
