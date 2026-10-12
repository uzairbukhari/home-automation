// Only refresh bookkeeping is held here; private report bodies remain in the database.
type Entry={running:boolean;until:number;error?:string};
const jobs=new Map<string,Entry>();
export function deferRefresh(key:string,task:()=>Promise<unknown>,schedule:(task:()=>Promise<void>)=>void,ttl=300000){
 const previous=jobs.get(key),now=Date.now();
 if(previous&&(previous.running||previous.until>now))return {refreshing:previous.running,error:previous.error};
 for(const [id,entry] of jobs)if(!entry.running&&entry.until<=now)jobs.delete(id);
 const entry:Entry={running:true,until:0};jobs.set(key,entry);
 try{schedule(async()=>{try{await task();entry.until=Date.now()+ttl;entry.error=undefined;}catch(error){entry.until=Date.now()+15000;entry.error=error instanceof Error?error.message:'Provider refresh failed';}finally{entry.running=false;}});}catch(error){jobs.delete(key);throw error;}
 return {refreshing:true,error:previous?.error};
}
