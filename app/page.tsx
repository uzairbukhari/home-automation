import { requireOwnerUser } from "@/lib/owner-auth";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireOwnerUser('/');
  return <Dashboard viewerName={user?.fullName ?? user?.email ?? "Private preview"} />;
}
