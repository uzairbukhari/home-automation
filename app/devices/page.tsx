import { requireOwnerUser } from "@/lib/owner-auth";
import Dashboard from "../dashboard";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const user = await requireOwnerUser('/devices');
  return <Dashboard page="devices" viewerName={user?.fullName ?? user?.email ?? "Private preview"} />;
}
