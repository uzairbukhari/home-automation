import { getOwnerUser,sameOrigin } from '@/lib/owner-auth';
import { testNotification } from '@/lib/notifications';
export async function POST(request:Request){
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  try{const body=await request.json() as {endpoint:string};if(typeof body.endpoint!=='string')throw new Error('Invalid subscription.');return Response.json({eventId:await testNotification(user.userId,body.endpoint),status:'queued'},{status:202});}catch(error){return Response.json({error:error instanceof Error?error.message:'Test failed'},{status:503});}
}
