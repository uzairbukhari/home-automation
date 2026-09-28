import { Nav } from "@/components/nav";
import { getLatestIngestRunBySource } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const latestRuns = await getLatestIngestRunBySource(["dess", "tuya"]);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Nav dessOk={latestRuns.get("dess")?.ok ?? null} tuyaOk={latestRuns.get("tuya")?.ok ?? null} />
      <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-6 px-4 py-6 md:px-12 md:py-8">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--text-muted)]">
        <span className="mx-3">Photon Energy Home</span>
        <span className="mx-3">Private monitoring · Asia/Karachi · PKR</span>
      </footer>
    </div>
  );
}
