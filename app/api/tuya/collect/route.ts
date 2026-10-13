import { env } from '@/lib/env';
import { runCollection } from '@/lib/collection';
// Hosts that cap function time (Vercel) get the full minute a collection can need.
export const maxDuration = 60;
export async function POST(request:Request){const e=env as unknown as Record<string,unknown>,secret=e.TUYA_COLLECTION_SECRET;if(typeof secret!=='string'||!secret||(request.headers.get('x-collection-secret')!==secret&&request.headers.get('authorization')!=='Bearer '+secret))return Response.json({error:'Unauthorized'},{status:401});try{const result=await runCollection();return Response.json(result,{status:result.status==='failed'?502:200});}catch(error){return Response.json({error:String(error)},{status:502});}}
