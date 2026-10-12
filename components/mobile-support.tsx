'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const OfflineContext = createContext(false);
export const useOffline = () => useContext(OfflineContext);
export function PhotonLoading() {
  return <div className="photon-loading" role="status" aria-busy="true" aria-label="Loading Photon">
    <div className="photon-loading-brand" aria-hidden="true">
      <span className="photon-loading-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></svg></span>
      <span>Photon</span>
    </div>
    <div className="photon-loading-content" aria-hidden="true">
      <div className="photon-loading-energy">
        <div className="photon-loading-orbit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></svg></div>
        <div className="photon-loading-caption">Preparing your dashboard</div>
        <div className="photon-loading-line"/>
      </div>
      <div className="photon-loading-metrics">{Array.from({length:4},(_,index)=><div className="photon-loading-card" key={index}><span className="photon-loading-placeholder label"/><span className="photon-loading-placeholder value"/><span className="photon-loading-placeholder note"/></div>)}</div>
      <div className="photon-loading-list">{Array.from({length:2},(_,index)=><div className="photon-loading-row" key={index}><span className="photon-loading-placeholder icon"/><span className="photon-loading-placeholder label"/><span className="photon-loading-placeholder control"/></div>)}</div>
    </div>
  </div>;
}
export async function workerMessage(message: unknown) {
  const worker = navigator.serviceWorker.controller ?? (await navigator.serviceWorker.ready).active;
  if (!worker) throw new Error('Offline support is not ready. Reopen this page.');
  return new Promise<{ok:boolean;accountId:string|null}>((resolve,reject) => {
    const channel=new MessageChannel(), timer=setTimeout(()=>reject(new Error('Offline support did not respond.')),10000);
    channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data);};
    worker.postMessage(message,[channel.port2]);
  });
}
export function MobileSupport({accountId,children}:{accountId:string|null;children:ReactNode}) {
  const [switching,setSwitching]=useState(false),[offline,setOffline]=useState(false),[savedAt,setSavedAt]=useState<number|null>(null),[notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    const online=()=>{setOffline(!navigator.onLine);if(navigator.onLine)setSavedAt(null);};
    const stamp=Number(document.querySelector('meta[name="photon-offline-saved-at"]')?.getAttribute('content'));
    queueMicrotask(()=>{setOffline(!navigator.onLine||Boolean(stamp));if(stamp)setSavedAt(stamp);});
    window.addEventListener('online',online);window.addEventListener('offline',online);
    const message=(event:MessageEvent)=>{if(event.data?.type==='SAVED_COPY'){setOffline(true);setSavedAt(event.data.savedAt);}};
    navigator.serviceWorker?.addEventListener('message',message);
    async function setup(){
      if(process.env.NODE_ENV==='development'||!('serviceWorker' in navigator)){return;}
      try {
        if(navigator.onLine && !stamp) {
          const controlled=Boolean(navigator.serviceWorker.controller);
          await navigator.serviceWorker.register('/sw.js',{scope:'/'}); await navigator.serviceWorker.ready;
          // Network-only identity verification also clears stale copies after session expiry.
          const session=await fetch('/api/mobile/session',{cache:'no-store'});
          const user= session.ok ? (await session.json() as {accountId:string}).accountId : null;
          await workerMessage({type:'ACCOUNT',accountId:user});
          for(const key of Object.keys(sessionStorage))if(key.startsWith('photon-navigation-')&&(!user||!(key===`photon-navigation-${user}`||key.startsWith(`photon-navigation-${user}-`))))sessionStorage.removeItem(key);
          if(user!==accountId && accountId) {if(active)setSwitching(true);location.reload();return;}
          // A controlled page was already saved by the service worker's own navigation handler.
          if(user&&!controlled) void workerMessage({type:'WARM_PAGE',path:location.pathname+location.search}).catch(()=>{});
        }
      } catch { if(active)setNotice('Offline saving is unavailable in this browser.'); }
    }
    void setup();
    let warmTimer:ReturnType<typeof setTimeout>;
    const warm=()=>{clearTimeout(warmTimer);if(navigator.onLine&&!stamp)warmTimer=setTimeout(()=>void workerMessage({type:'WARM_PAGE',path:location.pathname+location.search}).catch(()=>{}),500);};
    let warmedPath=location.pathname;const warmOnPageChange=()=>{if(location.pathname!==warmedPath){warmedPath=location.pathname;warm();}};window.addEventListener('photon-navigation',warmOnPageChange);window.addEventListener('popstate',warmOnPageChange);
    return()=>{active=false;clearTimeout(warmTimer);window.removeEventListener('photon-navigation',warmOnPageChange);window.removeEventListener('popstate',warmOnPageChange);window.removeEventListener('online',online);window.removeEventListener('offline',online);navigator.serviceWorker?.removeEventListener('message',message);};
  },[accountId]);
  return <OfflineContext.Provider value={offline}>
    {offline&&<div className="offline-banner" role="status">Offline · saved copies{savedAt?` · saved ${new Date(savedAt).toLocaleString('en-PK',{timeZone:'Asia/Karachi'})}`:''}. Controls and changes are disabled.</div>}
    {notice&&<div className="offline-banner" role="status">{notice}</div>}
    {switching ? <PhotonLoading/> : children}
  </OfflineContext.Provider>;
}
