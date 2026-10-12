import { getOwnerUser } from '@/lib/owner-auth';
import { cachedDevices } from '@/lib/tuya-store';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});try{const {id}=await params,device=(await cachedDevices(true)).find(d=>d.id===id);return device?Response.json({device},{headers:{'cache-control':'private, no-store'}}):Response.json({error:'Device is not linked to this home'},{status:404});}catch(error){return Response.json({error:String(error)},{status:503});}}
