"use client";

import useSWR from "swr";
import { Sun, Home, TrendingUp, Percent, Wallet, Gauge, Thermometer } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { formatWatts, formatKwh, formatPercent, formatPkr } from "@/lib/utils";
import { PowerScene } from "@/components/flow/power-scene";
import { BatteryGauge } from "@/components/battery-gauge";
import { KpiTile } from "@/components/kpi-tile";
import { TodayCurve } from "@/components/charts/today-curve";
import { HudPanel } from "@/components/hud/hud-panel";
import { AlertFeed } from "@/components/hud/alert-feed";
import { SyncedAgo } from "@/components/hud/synced-ago";
import { DeviceCard } from "@/components/device-card";
import type { LiveResponse } from "@/lib/types";

export function LiveDashboard({ initial }: { initial: LiveResponse }) {
  const { data } = useSWR<LiveResponse>("/api/live", fetcher, {
    fallbackData: initial,
    refreshInterval: 30_000,
  });

  const live = data ?? initial;
  const inv = live.inverter;
  const capacityPct = ((inv?.pvW ?? 0) / (live.settings.panelKwp * 1000)) * 100;

  const topDevices = [...live.devices]
    .filter((d) => d.online && (d.powerW ?? 0) > 1)
    .sort((a, b) => (b.powerW ?? 0) - (a.powerW ?? 0))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-[var(--text-primary)]">
            Command Deck
          </h1>
          <p className="font-readout text-xs text-[var(--text-muted)]">
            {inv ? <SyncedAgo ts={inv.ts} /> : "No inverter data yet — run a poll to populate this."}
          </p>
        </div>
      </header>

      <HudPanel scan bodyClassName="flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <PowerScene
            pvW={inv?.pvW ?? 0}
            loadW={inv?.loadW ?? 0}
            batteryW={inv?.batteryW ?? 0}
            gridW={inv?.gridW ?? null}
            batterySoc={inv?.batterySoc ?? 0}
            mode={inv?.mode ?? null}
            panelKwp={live.settings.panelKwp}
            inverterTempC={inv?.inverterTempC ?? null}
          />
        </div>
      </HudPanel>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile
          label="Solar now"
          value={formatWatts(inv?.pvW ?? 0)}
          sub={`${Math.min(100, capacityPct).toFixed(0)}% of ${live.settings.panelKwp} kW`}
          icon={Sun}
          accent="var(--series-4)"
        />
        <KpiTile
          label="Today's yield"
          value={formatKwh(live.today.pvKwh)}
          sub={`${live.today.specificYield.toFixed(2)} kWh/kWp`}
          icon={TrendingUp}
          accent="var(--series-1)"
        />
        <KpiTile
          label="Self-sufficiency"
          value={formatPercent(live.today.selfSufficiency)}
          sub={`${formatPercent(live.today.selfConsumption)} self-consumed`}
          icon={Percent}
          accent="var(--series-3)"
        />
        <KpiTile
          label="Saved today"
          value={formatPkr(live.today.savingsPkr)}
          sub={`${formatKwh(live.today.gridImportKwh)} imported`}
          icon={Wallet}
          accent="var(--series-2)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HudPanel title="Power today" icon={Gauge} className="lg:col-span-2">
          {live.todayCurve.length > 1 ? (
            <TodayCurve points={live.todayCurve} />
          ) : (
            <p className="text-sm text-[var(--text-muted)] py-16 text-center">
              Not enough readings yet today — check back after a few poll cycles.
            </p>
          )}
        </HudPanel>
        <HudPanel title="Battery module" icon={Thermometer} bodyClassName="flex flex-col items-center gap-3 p-5">
          <BatteryGauge socPercent={inv?.batterySoc ?? 0} capacityKwh={live.settings.batteryKwh} rateW={inv?.batteryW ?? 0} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full font-readout text-xs">
            <Stat label="Voltage" value={inv?.batteryV != null ? `${inv.batteryV.toFixed(1)} V` : "—"} />
            <Stat label="Current" value={inv?.batteryA != null ? `${inv.batteryA.toFixed(1)} A` : "—"} />
            <Stat label="Grid" value={inv?.gridV != null ? `${inv.gridV.toFixed(0)} V / ${inv.gridHz?.toFixed(1) ?? "—"} Hz` : "—"} />
            <Stat label="Output" value={inv?.outputV != null ? `${inv.outputV.toFixed(0)} V` : "—"} />
          </div>
        </HudPanel>
      </div>

      {topDevices.length > 0 && (
        <HudPanel title="Active devices" icon={Home}>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {topDevices.map((d) => (
              <div key={d.id} className="min-w-[220px] shrink-0">
                <DeviceCard device={d} />
              </div>
            ))}
          </div>
        </HudPanel>
      )}

      <HudPanel title="Alerts" status={live.alerts.some((a) => a.severity === "critical") ? "critical" : live.alerts.some((a) => a.severity === "warning") ? "warning" : "good"}>
        <AlertFeed alerts={live.alerts} />
      </HudPanel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-[var(--border)] py-1">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text-primary)] tabular-nums">{value}</span>
    </div>
  );
}
