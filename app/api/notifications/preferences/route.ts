import { getOwnerUser,sameOrigin } from '@/lib/owner-auth';
import { cachedDevices } from '@/lib/tuya-store';
import { notificationDb,pushConfig,rulesFor,saveRules } from '@/lib/notifications';
export async function GET(){
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  try {return Response.json({rules:await rulesFor(user.userId),publicKey:pushConfig().publicKey,health:await notificationDb().prepare("SELECT evaluated_at,delivered_at,error FROM notification_health WHERE id='evaluator'").first()},{headers:{'cache-control':'private, no-store'}});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Alerts unavailable'},{status:503});}
}
export async function PUT(request:Request){
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  try {const body=await request.json() as {rules:unknown};return Response.json({rules:await saveRules(user.userId,body.rules,await cachedDevices())});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Rules could not be saved'},{status:400});}
}
