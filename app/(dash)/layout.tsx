import { Nav } from "@/components/nav";
import { HudBackground } from "@/components/hud/hud-background";
import { CommandBar } from "@/components/hud/command-bar";
import {
  getLatestIngestRunBySource,
  getLatestInverterReading,
  getTuyaDevicesWithStatus,
  getSettings,
} from "@/lib/queries";
import { generateAlerts } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [latestRuns, latest, deviceRows, settings] = await Promise.all([
    getLatestIngestRunBySource(["dess", "tuya"]),
    getLatestInverterReading(),
    getTuyaDevicesWithStatus(),
    getSettings(),
  ]);

  const latestBySource = new Map<string, boolean>();
  for (const [source, run] of latestRuns) latestBySource.set(source, run.ok);
  const ingestFailing = ["dess", "tuya"].filter((s) => latestBySource.get(s) === false);

  const inverter = latest
    ? {
        ts: latest.ts.toISOString(),
        pvW: latest.pvW,
        loadW: latest.loadW,
        batteryW: latest.batteryW,
        batterySoc: latest.batterySoc,
        batteryV: latest.batteryV,
        batteryA: latest.batteryA,
        gridW: latest.gridW,
        gridV: latest.gridV,
        gridHz: latest.gridHz,
        pvV: latest.pvV,
        outputV: latest.outputV,
        loadPct: latest.loadPct,
        inverterTempC: latest.inverterTempC,
        mode: latest.mode,
      }
    : null;
  const devices = deviceRows.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    online: d.online,
    room: d.room,
    status: (d.lastStatus as Array<{ code: string; value: string | number | boolean }> | null) ?? [],
    powerW: null,
    kwhToday: 0,
  }));
  const alertCount = generateAlerts({ inverter, devices, settings, ingestFailing }).length;

  return (
    <div className="flex min-h-screen w-full">
      <HudBackground />
      <Nav />
      <div className="flex-1 min-w-0 flex flex-col">
        <CommandBar
          dessOk={latestBySource.get("dess") ?? null}
          tuyaOk={latestBySource.get("tuya") ?? null}
          alertCount={alertCount}
        />
        <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8 flex flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
