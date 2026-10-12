import { getOwnerUser } from '@/lib/owner-auth';
import { controlProvider } from '@/lib/providers/registry';
export async function GET(request:Request,context:{params:Promise<{provider:string;id:string}>}) {
  if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});
  try{const {provider,id}=await context.params;if(provider!=='tuya')return Response.json({error:'Energy history is unsupported for this provider'},{status:400});
    return Response.json(await controlProvider(provider).energy(id,new URL(request.url).searchParams.get('range')??'7'),{headers:{'cache-control':'private, no-store'}});
  }catch(error){return Response.json({error:String(error)},{status:400});}
}
