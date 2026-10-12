import { getOwnerUser } from '@/lib/owner-auth';
import { env } from 'cloudflare:workers';
import { saveRoomOverride } from '@/lib/tuya-store';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!(await getOwnerUser()))return Response.json({error:'Unauthorized'},{status:401});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin'},{status:403});
 try{const {id}=await params;if(!env.DB)throw new Error('Room storage is unavailable');if(!await env.DB.prepare("SELECT id FROM device_catalog WHERE id=? AND source='tuya'").bind(id).first())return Response.json({error:'Device is not linked to this Tuya account'},{status:404});const body=await request.json() as {room?:unknown};if(typeof body.room!=='string'||body.room.trim().length>60||/[\u0000-\u001f]/.test(body.room))return Response.json({error:'Enter a valid room name of up to 60 characters'},{status:400});const room=body.room.trim()||'Unassigned';await saveRoomOverride(id,room);return Response.json({saved:true,room});}catch(error){return Response.json({error:error instanceof Error?error.message:'Room could not be saved'},{status:503});}
}
