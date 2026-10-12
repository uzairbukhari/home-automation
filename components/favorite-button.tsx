'use client';
import { Star } from 'lucide-react';
import { useOffline } from './mobile-support';
export function FavoriteButton({active,busy=false,onClick,label}:{active:boolean;busy?:boolean;onClick:()=>void;label:string}){
 const offline=useOffline();
 return <button type="button" className={`favorite-button ${active?'active':''}`} aria-label={`${active?'Remove':'Add'} ${label} ${active?'from':'to'} dashboard`} aria-pressed={active} disabled={busy||offline} onClick={event=>{event.stopPropagation();onClick();}}><Star fill={active?'currentColor':'none'} size={18}/></button>;
}
