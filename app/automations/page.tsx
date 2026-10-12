import { requireOwnerUser } from '@/lib/owner-auth';
import { AutomationScreen } from '@/components/automation-screen';
export const dynamic='force-dynamic';
export default async function Page(){await requireOwnerUser('/automations');return <AutomationScreen/>;}
