import {requireOwnerUser} from '@/lib/owner-auth';
import Dashboard from '../dashboard';
export const dynamic='force-dynamic';
export default async function SettingsPage(){const user=await requireOwnerUser('/settings');return <Dashboard page="settings" viewerName={user.fullName??user.email??'Owner'}/>;}
