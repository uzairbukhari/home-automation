'use client';
import { useCallback,useEffect,useState } from 'react';
import type { Favorite } from '@/lib/favorites';
import { recall,remember } from '@/lib/client-data';
export function useFavorites(){
 const [favorites,setFavorites]=useState<Favorite[]>(()=>recall<Favorite[]>('favorites')??[]),[error,setError]=useState(''),[pending,setPending]=useState(''),[loaded,setLoaded]=useState(()=>recall('favorites')!==undefined);
 useEffect(()=>{const controller=new AbortController();fetch('/api/favorites',{signal:controller.signal}).then(async response=>{const data=await response.json() as {favorites:Favorite[];error?:string};if(!response.ok)throw new Error(data.error||'Favorites could not be loaded');setFavorites(remember('favorites',data.favorites));setLoaded(true);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Favorites unavailable');});return()=>controller.abort();},[]);
 const has=useCallback((kind:Favorite['kind'],itemId:string)=>favorites.some(f=>f.kind===kind&&f.itemId===itemId),[favorites]);
 async function toggle(kind:Favorite['kind'],itemId:string){if(pending||!loaded)return;setPending(`${kind}:${itemId}`);setError('');const favorite=!has(kind,itemId);try{const response=await fetch('/api/favorites',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({kind,itemId,favorite})}),data=await response.json() as {favorites:Favorite[];error?:string};if(!response.ok)throw new Error(data.error||'Favorite could not be saved');setFavorites(previous=>remember('favorites',favorite?[...previous,{kind,itemId}]:previous.filter(f=>f.kind!==kind||f.itemId!==itemId)));}catch(reason){setError(reason instanceof Error?reason.message:'Favorite could not be saved');}finally{setPending('');}}
 return{favorites,has,toggle,error,pending,loaded};
}
