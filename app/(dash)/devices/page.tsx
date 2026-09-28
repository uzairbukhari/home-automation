import { getTuyaDevicesWithStatus, getTuyaEnergyToday, getTuyaEnergyTotalsByDevice } from "@/lib/queries";
import { topConsumers } from "@/lib/insights";
import { DeviceGrid } from "@/components/device-grid";
import { KpiTile } from "@/components/kpi-tile";
import { Panel, PageHeader, EmptyState } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Wifi, Zap, CalendarClock, ToggleRight, Gauge } from "lucide-react";

export const dynamic = "force-dynamic";

type Status = Array<{ code: string; value: string | number | boolean }>;

function devicePowerW(status: Status): number | null {
  const v = status.find((s) => s.code === "cur_power")?.value;
  return typeof v === "number" ? v / 10 : null;
}

const SWITCH_CODE_RE = /^switch(_(led|\d+))?$/;

export default async function DevicesPage() {
  const [rows, energyToday, energy30] = await Promise.all([
    getTuyaDevicesWithStatus(),
    getTuyaEnergyToday(),
    getTuyaEnergyTotalsByDevice(30),
  ]);

  const devices = rows.map((d) => {
    const status = (d.lastStatus as Status | null) ?? [];
    return {
      id: d.id,
      name: d.name,
      category: d.category,
      online: d.online,
      room: d.room,
      status,
      powerW: devicePowerW(status),
      kwhToday: energyToday.get(d.id) ?? 0,
    };
  });

  const onlineCount = devices.filter((d) => d.online).length;
  const livePowerW = devices.reduce((sum, d) => sum + (d.online ? (d.powerW ?? 0) : 0), 0);
  const kwhToday = devices.reduce((sum, d) => sum + d.kwhToday, 0);
  const switchedOn = devices.filter((d) => d.online && d.status.some((s) => SWITCH_CODE_RE.test(s.code) && s.value === true)).length;
  const consumers = topConsumers(energy30, 6);
  const maxKwh = Math.max(0.001, ...consumers.map((c) => c.kwhToday));

  return (
    <>
      <PageHeader eyebrow="Tuya devices" title="Your smart home" sub={`${onlineCount} of ${devices.length} devices online`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Wifi} accent="var(--status-good)" label="Online" value={`${onlineCount}/${devices.length}`} sub="Devices reachable via Tuya Cloud" />
        <KpiTile
          icon={Zap}
          accent="var(--series-1)"
          label="Live device power"
          value={livePowerW >= 1000 ? (livePowerW / 1000).toFixed(2) : livePowerW.toFixed(0)}
          unit={livePowerW >= 1000 ? "kW" : "W"}
          sub="Sum of metered plugs and switches"
        />
        <KpiTile icon={CalendarClock} accent="var(--series-4)" label="Energy today" value={kwhToday.toFixed(2)} unit="kWh" sub="Across metered devices" />
        <KpiTile icon={ToggleRight} accent="var(--series-7)" label="Switched on" value={switchedOn.toString()} sub="Devices with at least one output on" />
      </div>

      <Panel eyebrow="Devices and controls" title="All devices" action={<Pill>{devices.length} linked</Pill>}>
        {devices.length === 0 ? (
          <EmptyState>
            No Tuya devices found yet. Confirm TUYA_ACCESS_ID / TUYA_ACCESS_SECRET / TUYA_UID are set and a poll has run
            (<code className="text-[var(--text-secondary)]">npm run tuya:probe</code> tests the connection directly).
          </EmptyState>
        ) : (
          <DeviceGrid devices={devices} />
        )}
      </Panel>

      <Panel eyebrow="Energy use" title="Top consumers, last 30 days">
        {consumers.length && consumers[0].kwhToday > 0 ? (
          <ul className="flex flex-col gap-4">
            {consumers.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-4 text-sm">
                <span className="truncate text-[var(--text-secondary)]" title={c.name}>
                  {c.name}
                </span>
                <span className="h-2 rounded-full bg-[var(--surface-3)]">
                  <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(c.kwhToday / maxKwh) * 100}%` }} />
                </span>
                <span className="whitespace-nowrap text-right tabular-nums font-semibold text-[var(--text-primary)]">
                  {c.kwhToday.toFixed(1)} kWh <span className="font-normal text-[var(--text-muted)]">· {Math.round(c.sharePct)}%</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No device energy data yet — metered plugs report here once they have run for a day.</EmptyState>
        )}
      </Panel>

      <div className="tile flex items-start gap-3 px-5 py-4">
        <Gauge size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{devices.length} Tuya devices linked</p>
          <p className="text-xs text-[var(--text-muted)]">
            Device energy is tracked separately from the inverter, so circuit meters and appliance meters may overlap with
            the home load shown on Overview.
          </p>
        </div>
      </div>
    </>
  );
}
