'use client';
import {useEffect,useState} from 'react';
import {readJson} from '@/lib/client-data';
import {freshnessLabel} from '@/lib/freshness';
import type {ProviderStatus} from '@/lib/providers/types';
import {useOffline} from './mobile-support';
export function ProviderStatusList(){
 const offline=useOffline(),[providers,setProviders]=useState<ProviderStatus[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;readJson<{providers:ProviderStatus[]}>('/api/connection-status').then(data=>{if(active)setProviders(data.providers);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Provider status unavailable');});return()=>{active=false;};},[]);
 return <section className="setting-section"><h3>Provider status</h3>{!providers&&<p role="status">{error||(offline?'Reconnect to check provider status.':'Checking saved provider status…')}</p>}{providers?.map(provider=><div className="provider-status-row" key={provider.provider}><div><strong>{provider.provider==='tuya'?'Smart Life / Tuya':'DessMonitor'}</strong><p>{provider.status==='connected'?'Last collection succeeded':provider.status==='degraded'?'Collection needs attention':'No collection recorded'}{offline?' · saved status':''}</p><small>{provider.lastSuccessAt?freshnessLabel(provider.lastSuccessAt):'No successful collection timestamp'}</small>{provider.blocker&&<p className="report-error">{provider.blocker}</p>}</div><span className="status-dot" aria-hidden="true"/></div>)}<a href="/settings?category=storage">Review collection health and refresh providers</a></section>;
}
