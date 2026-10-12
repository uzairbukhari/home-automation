'use client';
import {useEffect,useState} from 'react';
export type Appearance='system'|'light'|'dark';
export const appearanceScript=`(()=>{try{const p=localStorage.getItem('photon-appearance')||'system';const d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';}catch{}})()`;
function apply(value:Appearance) {
 const dark=value==='dark'||(value==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
 document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111a1e':'#f7f7f2');
}
export function AppearanceListener(){useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)'),sync=()=>apply((localStorage.getItem('photon-appearance') as Appearance)||'system');sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);return null;}
export function AppearanceSettings(){const [value,setValue]=useState<Appearance>('system');useEffect(()=>{queueMicrotask(()=>setValue((localStorage.getItem('photon-appearance') as Appearance)||'system'));},[]);return <section className="setting-section"><h2>Appearance</h2><p className="source-note">Choose a theme for this device. System follows your device’s appearance.</p><div className="appearance-options" role="radiogroup" aria-label="Appearance">{(['system','light','dark'] as const).map(mode=><button key={mode} role="radio" aria-checked={value===mode} onClick={()=>{localStorage.setItem('photon-appearance',mode);setValue(mode);apply(mode);}}><span className={`theme-preview ${mode}`}/>{mode[0].toUpperCase()+mode.slice(1)}</button>)}</div></section>;}
