import { env } from '@/lib/env';
import { runCollection } from '@/lib/collection';
import { isDatabaseBlocked } from '@/lib/turso';
import { trackUsage } from '@/lib/usage';
// Hosts that cap function time (Vercel) get the full minute a collection can need.
export const maxDuration = 60;
export async function POST(request:Request){const e=env as unknown as Record<string,unknown>,supplied=request.headers.get('x-collection-secret');if(!supplied||![e.NOTIFICATION_COLLECTION_SECRET,e.NOTIFICATION_SCHEDULE_SECRET].some(v=>typeof v==='string'&&v&&v===supplied))return Response.json({error:'Unauthorized'},{status:401});try{const result=await trackUsage('collection',()=>runCollection());return Response.json(result,{status:result.status==='failed'?502:200});}catch(error){// Answered 200 so the scheduler does not count failures or disable the job; collection resumes by itself when the quota resets.
if(isDatabaseBlocked(error))return Response.json({status:'database_blocked',error:'Turso quota reached; collection resumes after the monthly reset.'});return Response.json({error:String(error)},{status:502});}}
