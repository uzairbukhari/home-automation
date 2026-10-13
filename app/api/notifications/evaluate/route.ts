import { env } from 'cloudflare:workers';
import { evaluateAlerts } from '@/lib/notifications';
// Hosts that cap function time (Vercel) get the full minute a collection can need.
export const maxDuration = 60;
export async function POST(request:Request){
  const e=env as unknown as Record<string,unknown>,supplied=request.headers.get('x-collection-secret');
  if(!supplied||![e.NOTIFICATION_COLLECTION_SECRET,e.NOTIFICATION_SCHEDULE_SECRET].some(value=>typeof value==='string'&&value&&value===supplied))return Response.json({error:'Unauthorized'},{status:401});
  try{return Response.json(await evaluateAlerts());}catch(error){return Response.json({error:error instanceof Error?error.message:'Alert evaluation failed'},{status:503});}
}
