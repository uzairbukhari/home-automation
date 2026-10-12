import { getOwnerUser } from '@/lib/owner-auth';
import { activityPage } from '@/lib/automation-activity';
export async function GET(request:Request) {
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  try{return Response.json(await activityPage(user.userId,new URL(request.url).searchParams),{headers:{'cache-control':'private, no-store'}});}
  catch{return Response.json({error:'Activity could not be loaded; check the filters.'},{status:400});}
}
