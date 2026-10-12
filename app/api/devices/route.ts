import { getOwnerUser } from '@/lib/owner-auth';
import { providerRegistry } from '@/lib/providers/registry';
import { providerPolicy } from '@/lib/provider-policy';
export async function GET(){if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});
  return Response.json({devices:await providerRegistry.tuya.list(),synchronization:providerPolicy('tuya')},{headers:{'cache-control':'private, no-store'}});
}
