import { appDb } from '@/lib/db';
import { getOwnerUser } from '@/lib/owner-auth';
import { chartIds, type Favorite } from '@/lib/favorites';

export async function GET() {
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  try { if(!appDb())throw new Error('Favorites storage is unavailable');
    const rows=await appDb().prepare('SELECT kind,item_id AS itemId FROM dashboard_favorites WHERE user_id=? ORDER BY created_at,item_id').bind(user.userId).all<Favorite>();
    return Response.json({favorites:rows.results},{headers:{'cache-control':'private, no-store'}});
  } catch(error){return Response.json({error:error instanceof Error?error.message:'Favorites unavailable'},{status:503});}
}
export async function PUT(request:Request) {
  const user=await getOwnerUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin'},{status:403});
  try { if(!appDb())throw new Error('Favorites storage is unavailable');
    const {kind,itemId,favorite}=await request.json() as {kind:unknown;itemId:unknown;favorite:unknown};
    if((kind!=='device'&&kind!=='chart')||typeof itemId!=='string'||itemId.length>128||typeof favorite!=='boolean')return Response.json({error:'Invalid favorite'},{status:400});
    if(kind==='chart'&&!chartIds.includes(itemId as typeof chartIds[number]))return Response.json({error:'Unknown chart'},{status:400});
    if(kind==='device'&&favorite&&!await appDb().prepare("SELECT id FROM device_catalog WHERE id=? AND source='tuya'").bind(itemId).first())return Response.json({error:'Device is unavailable'},{status:404});
    await (favorite?appDb().prepare('INSERT OR IGNORE INTO dashboard_favorites (user_id,kind,item_id) VALUES (?,?,?)'):appDb().prepare('DELETE FROM dashboard_favorites WHERE user_id=? AND kind=? AND item_id=?')).bind(user.userId,kind,itemId).run();
    return Response.json({saved:true});
  } catch(error){return Response.json({error:error instanceof Error?error.message:'Favorite could not be saved'},{status:503});}
}
