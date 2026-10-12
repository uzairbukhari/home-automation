import { requireOwnerUser } from '@/lib/owner-auth';
import { ReportScreen } from '@/components/report-screen';
export const dynamic='force-dynamic';
export default async function Page(){await requireOwnerUser('/reports');return <ReportScreen/>;}
