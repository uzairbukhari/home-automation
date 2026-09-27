import { getLiveData } from "@/lib/live-data";
import { LiveDashboard } from "@/components/live-dashboard";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const initial = await getLiveData();
  return <LiveDashboard initial={initial} />;
}
