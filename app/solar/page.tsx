import { requireOwnerUser } from "@/lib/owner-auth";
import Dashboard from "../dashboard";

export const dynamic = "force-dynamic";

export default async function SolarPage() {
  const user = await requireOwnerUser('/solar');
  return <Dashboard page="solar" viewerName={user?.fullName ?? user?.email ?? "Private preview"} />;
}
