'use client';
import {useEffect,useState,type ReactNode,type ComponentProps} from 'react';
// Use the public router directly: this Vinext build loses the private exports
// loaded dynamically by next/link in production (navigation and prefetch).
export function OfflineLink({href,onClick,...props}:ComponentProps<'a'>){
 const router=useRouter();
 return <a {...props} href={href} onClick={event=>{
  onClick?.(event);
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||props.target&&props.target!=='_self'||props.download!==undefined||!href||!navigator.onLine)return;
  const target=new URL(href,location.href);
  if(target.origin!==location.origin||target.pathname===location.pathname&&target.search===location.search&&target.hash)return;
  event.preventDefault();
  const samePage=target.pathname===location.pathname;
  router.push(target.pathname+target.search+target.hash);
  // Same-page links only change the query string; let URL-backed state re-read it.
  if(samePage){let frames=0;const settle=()=>{if(location.search===target.search||++frames>30)window.dispatchEvent(new Event('photon-navigation'));else requestAnimationFrame(settle);};requestAnimationFrame(settle);}
 }}/>;
}
const Link=OfflineLink;
import {usePathname,useRouter} from 'next/navigation';
import {House,SunMedium,SlidersHorizontal,Settings2,Zap,Workflow} from 'lucide-react';
export type AppPage='overview'|'solar'|'devices'|'settings'|'automations'|'reports';
const destinations=[{page:'overview',title:'Home',href:'/',icon:House},{page:'devices',title:'Devices',href:'/devices',icon:SlidersHorizontal},{page:'solar',title:'Energy',href:'/solar',icon:SunMedium},{page:'automations',title:'Rules',href:'/automations',icon:Workflow}] as const;
export function PhotonShell({children}:{children:ReactNode}) {
 const path=usePathname(),[pending,setPending]=useState<string|null>(null);
 const selected=path==='/reports'?'/solar':path;
 useEffect(()=>{queueMicrotask(()=>setPending(null));},[path]);
 const title=path==='/settings'?'Settings':path==='/reports'?'Energy reports':destinations.find(d=>d.href===path)?.title??'Photon';
 return <main className="dashboard-shell photon-app"><a className="skip-link" href="#main-content">Skip to content</a><header className="app-topbar"><div className="app-title"><span className="app-logo"><Zap/></span><div><small>YOUR HOME</small><h1>{pending?destinations.find(d=>d.href===pending)?.title??title:title}</h1></div></div><Link className="settings-link" href="/settings" aria-label="Settings"><Settings2/></Link></header><aside className="app-sidebar"><Link href="/" className="sidebar-brand" aria-label="Photon home"><span className="app-logo"><Zap/></span><span>photon<small>Energy & home</small></span></Link><nav className="app-navigation" aria-label="Main navigation">{destinations.map(({title,href,icon:Icon})=><Link key={href} href={href} aria-current={(pending??selected)===href?'page':undefined} onClick={e=>{if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey&&href!==path)setPending(href);}}><Icon/><span>{title}</span></Link>)}</nav><div className="sidebar-bottom"><span className="sidebar-home"><span className="status-dot live"/>Personal home</span><Link href="/settings" aria-current={path==='/settings'?'page':undefined}><Settings2/><span>Settings</span></Link></div></aside>{pending&&<div className="navigation-progress" role="status">Opening {destinations.find(d=>d.href===pending)?.title}…</div>}<div id="main-content" className="dashboard-content" tabIndex={-1}>{children}</div><footer className="app-footer">Photon · Asia/Karachi · PKR</footer></main>;
}
export function AppShell({page,status,children}:{page:AppPage;status:ReactNode;children:ReactNode}) {
 useEffect(()=>{
  const account=document.querySelector('meta[name="photon-account"]')?.getAttribute('content')??'',key=`photon-navigation-${account}-${page}-scroll`;
  try{if(!new URL(location.href).searchParams.has('device'))requestAnimationFrame(()=>window.scrollTo(0,Number(sessionStorage.getItem(key)||0)));}catch{}
  const remember=()=>{try{sessionStorage.setItem(key,String(window.scrollY));}catch{}};
  window.addEventListener('scroll',remember,{passive:true});return()=>window.removeEventListener('scroll',remember);
 },[page]);
 return <div className={`${page}-page`}><div className="page-freshness" role="status">{status}</div>{children}</div>;
}
