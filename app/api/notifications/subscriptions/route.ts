import { getOwnerUser,sameOrigin } from '@/lib/owner-auth';
import { subscribe,unsubscribe } from '@/lib/notifications';
export async function POST(request:Request){
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  try{return Response.json({id:await subscribe(user.userId,await request.json())});}catch(error){return Response.json({error:error instanceof Error?error.message:'Subscription failed'},{status:400});}
}
export async function DELETE(request:Request){
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  try{const body=await request.json() as {endpoint:string};if(typeof body.endpoint!=='string')throw new Error('Invalid subscription.');await unsubscribe(user.userId,body.endpoint);return Response.json({removed:true});}catch(error){return Response.json({error:error instanceof Error?error.message:'Subscription removal failed'},{status:400});}
}
