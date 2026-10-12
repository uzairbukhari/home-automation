import { getOwnerUser } from '@/lib/owner-auth';
export async function GET() {
  const user=await getOwnerUser();
  return user ? Response.json({accountId:user.userId},{headers:{'cache-control':'private, no-store'}}) : Response.json({error:'Unauthorized'},{status:401,headers:{'cache-control':'no-store'}});
}
