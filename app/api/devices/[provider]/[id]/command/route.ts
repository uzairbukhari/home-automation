import { getOwnerUser,sameOrigin } from '@/lib/owner-auth';
import { controlProvider } from '@/lib/providers/registry';
export async function POST(request:Request,context:{params:Promise<{provider:string;id:string}>}) {
 if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
 try{const {provider,id}=await context.params;if(provider!=='tuya')throw new Error('Unsupported provider control');const {code,value}=await request.json() as {code:string;value:unknown};
 return Response.json({...await controlProvider(provider).command(id,code,value),requestedState:{code,value}});
 }catch(error){return Response.json({error:String(error)},{status:400});}
}
