'use client';
import {useEffect,useRef,useState} from 'react';
const overlayKeys=new Set(['connection','category','device','filters','rooms','expanded','rule']);
const selections=new Map<string,Map<string,string|null>>();
let discardRequest:{promise:Promise<boolean>;resolve:(answer:boolean)=>void}|null=null;
const promptListeners=new Set<()=>void>();
const dirtyForms=new Set<{current:boolean}>();
const hasDirtyForms=()=>[...dirtyForms].some(form=>form.current);
async function allowNavigation(){if(!hasDirtyForms())return true;const discard=await confirmDiscard();if(discard)for(const form of dirtyForms)form.current=false;return discard;}
export function subscribeDiscardPrompt(listener:()=>void){promptListeners.add(listener);return()=>{promptListeners.delete(listener);};}
export function hasDiscardPrompt(){return Boolean(discardRequest);}
export function answerDiscardPrompt(answer:boolean){const current=discardRequest;discardRequest=null;current?.resolve(answer);for(const listener of promptListeners)listener();}
function confirmDiscard(){if(!discardRequest){let resolve!:(answer:boolean)=>void;const promise=new Promise<boolean>(done=>{resolve=done;});discardRequest={promise,resolve};for(const listener of promptListeners)listener();}return discardRequest.promise;}

function restoreSelections() {
 const url=new URL(location.href);
 for(const [key,value] of selections.get(url.pathname)??[]) {if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,value);}
 if(url.href!==location.href)history.replaceState(history.state,'',url);
}

export function useUrlState(key:string,fallback:string,allowed?:readonly string[]) {
 const [value,setValue]=useState(fallback);
 const allowedKey=allowed?.join('|');
 useEffect(()=>{
  const initial=new URL(location.href),saved=selections.get(initial.pathname)?.get(key);
  if(!initial.searchParams.has(key)&&saved!=null&&!overlayKeys.has(key)){initial.searchParams.set(key,saved);history.replaceState(history.state,'',initial);}
  const read=()=>{const v=new URL(location.href).searchParams.get(key);setValue(v&&(!allowedKey||allowedKey.split('|').includes(v))?v:fallback);};
  const pop=()=>{if(hasDirtyForms())return;restoreSelections();read();};
  read();window.addEventListener('popstate',pop);window.addEventListener('photon-navigation',read);
  return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('photon-navigation',read);};
 },[key,fallback,allowedKey]);
 const change=(next:string,push=false)=>{
  const apply=()=>{
  const url=new URL(location.href);if(next===fallback)url.searchParams.delete(key);else url.searchParams.set(key,next);
  if(!overlayKeys.has(key)&&key!=='section'&&key!=='report'){const saved=selections.get(url.pathname)??new Map<string,string|null>();saved.set(key,next===fallback?null:next);selections.set(url.pathname,saved);}
  if(url.href===location.href)return;
  history[push?'pushState':'replaceState'](push?{...history.state,photonOverlay:key}:history.state,'',url);
  window.dispatchEvent(new Event('photon-navigation'));
  };if(hasDirtyForms())void allowNavigation().then(allowed=>{if(allowed)apply();});else apply();
 };
 const close=()=>{const leave=()=>{if(history.state?.photonOverlay===key)history.back();else change(fallback);};if(hasDirtyForms())void allowNavigation().then(allowed=>{if(allowed)leave();});else leave();};
 return [value,change,close] as const;
}

export function useUnsavedChanges(dirty:boolean) {
 const dirtyRef=useRef(dirty);useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
 useEffect(()=>{
  dirtyForms.add(dirtyRef);
  let previous=location.href;
  const remember=()=>{previous=location.href;};
  const unload=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};
  const pop=(event:PopStateEvent)=>{if(dirtyRef.current){history.pushState(null,'',previous);event.stopImmediatePropagation();void allowNavigation().then(discard=>{if(discard)history.back();});}else previous=location.href;};
  const click=(event:MouseEvent)=>{const link=(event.target as Element).closest('a[href]') as HTMLAnchorElement|null;if(link&&link.target!=='_blank'&&!link.getAttribute('href')?.startsWith('#')&&dirtyRef.current){event.preventDefault();event.stopImmediatePropagation();void allowNavigation().then(discard=>{if(discard)location.href=link.href;});}};
  window.addEventListener('beforeunload',unload);window.addEventListener('popstate',pop,true);document.addEventListener('click',click,true);window.addEventListener('photon-navigation',remember);
  return()=>{dirtyForms.delete(dirtyRef);window.removeEventListener('beforeunload',unload);window.removeEventListener('popstate',pop,true);document.removeEventListener('click',click,true);window.removeEventListener('photon-navigation',remember);};
 },[]);
 return allowNavigation;
}
