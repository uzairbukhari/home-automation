import { getTuyaDevicesWithStatus, getTuyaEnergyToday } from "@/lib/queries";
import { DeviceCard } from "@/components/device-card";
import { HudPanel } from "@/components/hud/hud-panel";
import { Plug } from "lucide-react";

export const dynamic = "force-dynamic";

function devicePowerW(status: Array<{ code: string; value: unknown }>): number | null {
  const v = status.find((s) => s.code === "cur_power")?.value;
  return typeof v === "number" ? v / 10 : null;
}

export default async function DevicesPage() {
  const [devices, energyToday] = await Promise.all([getTuyaDevicesWithStatus(), getTuyaEnergyToday()]);

  const byRoom = new Map<string, typeof devices>();
  for (const d of devices) {
    const room = d.room ?? "Unassigned";
    byRoom.set(room, [...(byRoom.get(room) ?? []), d]);
  }

  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-[var(--text-primary)]">Devices</h1>
        <p className="font-readout text-xs text-[var(--text-muted)]">
          {onlineCount}/{devices.length} online
        </p>
      </header>

      {devices.length === 0 ? (
        <HudPanel>
          <div className="p-4 text-center text-sm text-[var(--text-muted)]">
            No Tuya devices found yet. Confirm TUYA_ACCESS_ID / TUYA_ACCESS_SECRET / TUYA_UID are set and a poll has
            run (<code className="text-[var(--text-secondary)]">npm run tuya:probe</code> to test the connection
            directly).
          </div>
        </HudPanel>
      ) : (
        Array.from(byRoom.entries()).map(([room, roomDevices]) => (
          <HudPanel key={room} title={room} icon={Plug} frame={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {roomDevices.map((d) => (
                <DeviceCard
                  key={d.id}
                  device={{
                    id: d.id,
                    name: d.name,
                    category: d.category,
                    online: d.online,
                    room: d.room,
                    status: (d.lastStatus as Array<{ code: string; value: string | number | boolean }> | null) ?? [],
                    powerW: devicePowerW(
                      (d.lastStatus as Array<{ code: string; value: string | number | boolean }> | null) ?? []
                    ),
                    kwhToday: energyToday.get(d.id) ?? 0,
                  }}
                />
              ))}
            </div>
          </HudPanel>
        ))
      )}
    </div>
  );
}
