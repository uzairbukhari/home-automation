'use client';
import {ArrowLeft,BatteryCharging,Bell,ChevronRight,KeyRound,Palette,ReceiptText,UserRound} from 'lucide-react';
import {StorageHealth} from './storage-health';
import {SettingsPanel} from './settings-panel';
import {NotificationSettings} from './notification-settings';
import {AppearanceSettings} from './appearance-settings';
import {useUrlState} from '@/hooks/use-app-navigation';
import type {ReactNode} from 'react';
import {workerMessage} from './mobile-support';
import type {Settings} from '@/lib/settings';
import type {TuyaDashboardDevice} from '@/lib/providers/tuya';
const categories=[{id:'storage',title:'Collection & Storage',note:'Data retention, provider usage and scheduler health',icon:ReceiptText},{id:'connections',title:'Connections',note:'Solar inverter and smart devices',icon:KeyRound},{id:'billing',title:'Electricity & Billing',note:'Tariffs, taxes and billing cycles',icon:ReceiptText},{id:'battery',title:'Battery',note:'Capacity and reserve',icon:BatteryCharging},{id:'notifications',title:'Notifications',note:'Delivery on this device and alert rules',icon:Bell},{id:'appearance',title:'Appearance',note:'System, light or dark theme',icon:Palette},{id:'account',title:'Account & App',note:'Your account and offline access',icon:UserRound}];
// Sign-out uses the host-owned authentication route after removing private copies.
/* eslint-disable @next/next/no-location-assign-relative-destination */
export function SettingsScreen({settings,onChange,devices,viewerName,onConnections,connections}:{connections:ReactNode;settings:Settings;onChange:(settings:Settings)=>void;devices:TuyaDashboardDevice[];viewerName:string;onConnections:()=>void}) {
 const [category,setCategory,close]=useUrlState('category','',categories.map(c=>c.id));
 const current=categories.find(c=>c.id===category)??categories.find(c=>c.id==='connections')!;
 const active=current.id;
 return <section className="settings-screen" data-detail={Boolean(category)}><nav className="settings-categories" aria-label="Settings categories">{[{title:'Your home',ids:['connections','battery','billing']},{title:'Preferences',ids:['notifications','appearance']},{title:'System',ids:['storage','account']}].map(group=><section className="settings-category-group" key={group.title}><h2>{group.title}</h2>{group.ids.map(id=>{const {title,note,icon:Icon}=categories.find(item=>item.id===id)!;return <button key={id} aria-current={active===id?'page':undefined} onClick={()=>setCategory(id,true)}><span className="category-icon"><Icon/></span><span><strong>{title}</strong><small>{note}</small></span><ChevronRight/></button>;})}</section>)}</nav><div className="settings-detail"><div className="detail-page-heading"><button className="icon-button" aria-label="Back to Settings" onClick={close}><ArrowLeft/></button><div><h2>{current.title}</h2><p>{current.note}</p></div></div>
 {active==='storage'&&<StorageHealth/>}
 {active==='connections'&&connections}
 {(active==='billing'||active==='battery')&&<SettingsPanel key={active} category={active as 'billing'|'battery'} embedded settings={settings} onChange={onChange} onManageConnections={onConnections} devices={devices}/>}
 {category==='notifications'&&<NotificationSettings devices={devices}/>}
 {category==='appearance'&&<AppearanceSettings/>}
 {category==='account'&&<section className="setting-section"><h3>{viewerName}</h3><p>Photon Energy Home · Personal dashboard</p><div className="account-detail"><strong>Offline reports</strong><p>Previously viewed reports stay available on this device for up to 30 days. Saved timestamps appear offline. Device commands and changes require a connection.</p></div><div className="account-detail"><strong>Reporting</strong><p>Asia/Karachi · PKR · IESCO</p><a href="https://iesco.com.pk/tariff-guide" target="_blank" rel="noreferrer">View tariff source</a></div><p>Signing out removes saved private data from this device.</p><a className="signout-action" href="/api/auth/logout" onClick={async event=>{event.preventDefault();try{await workerMessage({type:'CLEAR_PRIVATE'});}catch{if(navigator.serviceWorker?.controller)return;}for(const key of Object.keys(sessionStorage))if(key.startsWith('photon-navigation-'))sessionStorage.removeItem(key);location.assign('/api/auth/logout');}}>Sign out</a></section>}
 </div></section>;
}
