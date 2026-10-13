import { redirect } from 'next/navigation';
import { requireOwnerUser } from '@/lib/owner-auth';
export const dynamic='force-dynamic';
// Appliance reports now live in Energy > Costs; keep the old address working for bookmarks.
export default async function Page(){await requireOwnerUser('/solar?section=costs');redirect('/solar?section=costs');}
