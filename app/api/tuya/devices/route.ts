import { getOwnerUser } from '@/lib/owner-auth';
import { cachedDevices, latestCollection } from '@/lib/tuya-store';
export async function GET(){if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});try{const devices=await cachedDevices(true);return Response.json({devices,refreshedAt:new Date().toISOString(),collection:await latestCollection()},{headers:{'cache-control':'private, no-store'}});}catch(error){return Response.json({error:String(error)},{status:503});}}
