import { getOwnerUser } from '@/lib/owner-auth';
import { database } from '@/lib/jobs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});const {id}=await params,row=await database().prepare('SELECT l.*,c.origin,c.expires_at FROM tuya_command_log l LEFT JOIN command_context c ON l.id=c.command_id WHERE l.id=?').bind(id).first();return row?Response.json(row,{headers:{'cache-control':'private, no-store'}}):Response.json({error:'Command not found'},{status:404});}
