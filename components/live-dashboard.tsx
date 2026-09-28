"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  Sun,
  Home,
  UtilityPole,
  Wallet,
  PieChart,
  BatteryCharging,
  ShieldCheck,
  ShieldAlert,
  CloudOff,
  KeyRound,
  Activity,
  ArrowRight,
  AlertTriangle,
  AlertOctagon,
  Info,
} from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { formatPkr, cn } from "@/lib/utils";
import { PowerScene } from "@/components/flow/power-scene";
import { BatteryGauge } from "@/components/battery-gauge";
import { KpiTile } from "@/components/kpi-tile";
import { TodayCurve } from "@/components/charts/today-curve";
import { Panel, EmptyState } from "@/components/ui/panel";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StatList } from "@/components/ui/stat-list";
import { SyncedAgo } from "@/components/ui/synced-ago";
import { DeviceCard } from "@/components/device-card";
import type { AlertItem, IngestStatus, LiveResponse } from "@/lib/types";

const REFRESH_MS = 30_000;

const SOURCES = [
  { key: "dess", label: "DessMonitor" },
  { key: "tuya", label: "Tuya Cloud" },
];

const kw = (w: number) => (Math.abs(w) / 1000).toFixed(2);

export function LiveDashboard({ initial }: { initial: LiveResponse }) {
  const { data } = useSWR<LiveResponse>("/api/live", fetcher, {
    fallbackData: initial,
    refreshInterval: REFRESH_MS,
  });

  const live = data ?? initial;
  const inv = live.inverter;
  const today = live.today;
  const gridW = inv?.gridW ?? null;

  const activeDevices = [...live.devices]
    .filter((d) => d.online && (d.powerW ?? 0) > 1)
    .sort((a, b) => (b.powerW ?? 0) - (a.powerW ?? 0))
    .slice(0, 4);
  const onlineCount = live.devices.filter((d) => d.online).length;

  return (
    <>
      <ConnectionBanner ingest={live.ingest} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Energy flow"
          title="Your home, at a glance"
          action={
            <span className="text-sm text-[var(--text-muted)]">
              {inv ? <SyncedAgo ts={inv.ts} /> : "Awaiting first live reading"}
            </span>
          }
        >
          <PowerScene
            pvW={inv?.pvW ?? 0}
            loadW={inv?.loadW ?? 0}
            batteryW={inv?.batteryW ?? 0}
            gridW={gridW}
            batterySoc={inv?.batterySoc ?? 0}
            mode={inv?.mode ?? null}
          />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-[var(--border)] pt-5 text-sm text-[var(--text-muted)]">
            <span className="flex items-center gap-2">
              <ShieldCheck size={15} /> {inv?.mode ?? "Mode unknown"}
            </span>
            <span className="flex items-center gap-2">
              <Sun size={15} /> {live.settings.panelKwp} kWp array
            </span>
            <span className="flex items-center gap-2">
              <Activity size={15} /> {REFRESH_MS / 1000} sec refresh
            </span>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-4 md:gap-6">
          <KpiTile
            variant="hero"
            label="Solar today"
            value={today.pvKwh.toFixed(2)}
            unit="kWh"
            sub={`${today.specificYield.toFixed(2)} kWh per kWp installed`}
            accent="var(--series-4)"
          />
          <KpiTile
            variant="hero"
            label="Home load"
            value={kw(inv?.loadW ?? 0)}
            unit="kW"
            sub={inv?.loadPct != null ? `${Math.round(inv.loadPct)}% inverter load` : "Measured at inverter output"}
            accent="var(--series-1)"
          />
          <KpiTile
            variant="hero"
            label={gridW != null && gridW < -10 ? "Grid export" : "Grid import"}
            value={gridW == null ? "—" : kw(gridW)}
            unit="kW"
            sub={gridW == null || Math.abs(gridW) < 10 ? "Currently off-grid" : gridW > 0 ? "Drawing from the grid" : "Sending to the grid"}
            accent="var(--series-2)"
          />
          <KpiTile
            variant="hero"
            label="Battery"
            value={Math.round(inv?.batterySoc ?? 0).toString()}
            unit="%"
            sub={[
              inv?.batteryV != null ? `${inv.batteryV.toFixed(1)} V` : null,
              inv?.batteryA != null ? `${Math.abs(inv.batteryA).toFixed(1)} A ${(inv.batteryW ?? 0) >= 0 ? "charge" : "discharge"}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No battery telemetry"}
            accent="var(--series-3)"
          />
        </div>
      </div>

      <Panel
        eyebrow="Today"
        title="Production and demand"
        action={
          <>
            <Pill dot="var(--series-4)">Solar</Pill>
            <Pill dot="var(--series-1)">Home</Pill>
            <Pill dot="var(--series-3)">Battery</Pill>
            <Pill dot="var(--series-2)">Grid</Pill>
          </>
        }
      >
        {live.todayCurve.length > 1 ? (
          <>
            <p className="-mt-1 mb-3 text-xs text-[var(--text-muted)]">{live.todayCurve.length} readings since midnight</p>
            <TodayCurve points={live.todayCurve} />
          </>
        ) : (
          <EmptyState>Not enough readings yet today — check back after a few poll cycles.</EmptyState>
        )}
      </Panel>

      <Panel eyebrow="Energy today" title="Where your power came from">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiTile
            icon={Sun}
            accent="var(--series-4)"
            label="Solar produced"
            value={today.pvKwh.toFixed(2)}
            unit="kWh"
            sub="Inverter energy counter"
          />
          <KpiTile
            icon={Home}
            accent="var(--series-1)"
            label="Home energy"
            value={today.loadKwh.toFixed(2)}
            unit="kWh"
            sub="Integrated from measured output power"
          />
          <KpiTile
            icon={UtilityPole}
            accent="var(--series-2)"
            label="Grid imported"
            value={today.gridImportKwh.toFixed(2)}
            unit="kWh"
            sub={today.gridExportKwh > 0.01 ? `${today.gridExportKwh.toFixed(2)} kWh exported` : "Integrated from measured mains power"}
          />
          <KpiTile
            icon={BatteryCharging}
            accent="var(--series-3)"
            label="Battery"
            value={today.battDischargeKwh.toFixed(2)}
            unit="kWh out"
            sub={`${today.battChargeKwh.toFixed(2)} kWh charged in`}
          />
          <KpiTile
            icon={Wallet}
            accent="var(--series-6)"
            label="Estimated savings"
            value={formatPkr(today.savingsPkr)}
            sub="Versus buying every unit from the grid"
          />
          <KpiTile
            icon={PieChart}
            accent="var(--series-7)"
            label="Self-powered"
            value={Math.round(today.selfSufficiency * 100).toString()}
            unit="%"
            sub={`Share of home energy not from the grid · ${Math.round(today.selfConsumption * 100)}% of solar used on site`}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel eyebrow="Solar & inverter" title="Electrical health">
          <StatList
            items={[
              { label: "Solar power", value: `${kw(inv?.pvW ?? 0)} kW` },
              { label: "PV input", value: inv?.pvV != null ? `${inv.pvV.toFixed(1)} V` : "—" },
              {
                label: "Grid",
                value: inv?.gridV != null ? `${inv.gridV.toFixed(1)} V · ${inv.gridHz?.toFixed(1) ?? "—"} Hz` : "—",
              },
              { label: "Output", value: inv?.outputV != null ? `${inv.outputV.toFixed(1)} V` : "—" },
              { label: "Inverter temperature", value: inv?.inverterTempC != null ? `${inv.inverterTempC.toFixed(0)} °C` : "—" },
              { label: "Inverter load", value: inv?.loadPct != null ? `${Math.round(inv.loadPct)}%` : "—" },
              { label: "Battery voltage", value: inv?.batteryV != null ? `${inv.batteryV.toFixed(1)} V` : "—" },
              { label: "Operating mode", value: inv?.mode ?? "—" },
            ]}
          />
        </Panel>

        <Panel
          eyebrow="Battery"
          title="Stored energy"
          action={<Pill>{live.settings.batteryKwh.toFixed(1)} kWh bank</Pill>}
        >
          <BatteryGauge
            socPercent={inv?.batterySoc ?? 0}
            capacityKwh={live.settings.batteryKwh}
            rateW={inv?.batteryW ?? 0}
            voltage={inv?.batteryV ?? null}
          />
        </Panel>
      </div>

      <Panel
        eyebrow="Tuya devices"
        title="Active right now"
        action={
          <Link
            href="/devices"
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            All {live.devices.length} devices <ArrowRight size={14} />
          </Link>
        }
      >
        {activeDevices.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {activeDevices.map((d) => (
              <DeviceCard key={d.id} device={d} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            No device is drawing power right now · {onlineCount} of {live.devices.length} online.
          </p>
        )}
      </Panel>

      <AlertsPanel alerts={live.alerts} />
    </>
  );
}

function ConnectionBanner({ ingest }: { ingest: IngestStatus[] }) {
  const bySource = new Map(ingest.map((i) => [i.source, i]));
  const failing = SOURCES.filter((s) => bySource.get(s.key)?.ok === false);
  const missing = SOURCES.filter((s) => !bySource.has(s.key));

  const state: { tone: PillTone; icon: typeof ShieldCheck; title: string; badge: string; detail: string } =
    failing.length > 0
      ? {
          tone: "bad",
          icon: ShieldAlert,
          title: `${failing.map((s) => s.label).join(" and ")} not responding`,
          badge: "Attention",
          detail: bySource.get(failing[0].key)?.error ?? "The last poll failed. Readings below may be stale.",
        }
      : missing.length > 0
        ? {
            tone: "warn",
            icon: CloudOff,
            title: "Waiting for the first poll",
            badge: "Setup",
            detail: `No data yet from ${missing.map((s) => s.label).join(" and ")}. Check your provider credentials.`,
          }
        : {
            tone: "good",
            icon: ShieldCheck,
            title: "Photon system connected",
            badge: "Live",
            detail: "Inverter and device readings are polled from your providers automatically.",
          };

  const Icon = state.icon;
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[18px] border p-4 md:flex-row md:items-center md:justify-between md:p-5",
        state.tone === "good" && "border-[#28584c] bg-[linear-gradient(90deg,#102a29,#101d2d)]",
        state.tone === "warn" && "border-[#5a4c26] bg-[linear-gradient(90deg,#2a2412,#101d2d)]",
        state.tone === "bad" && "border-[#6b3337] bg-[linear-gradient(90deg,#2d1619,#101d2d)]"
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--text-secondary)]">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2.5 text-[17px] text-[var(--text-primary)]">
            {state.title} <Pill tone={state.tone}>{state.badge}</Pill>
          </p>
          <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{state.detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {SOURCES.map((s) => {
          const run = bySource.get(s.key);
          const tone: PillTone = run == null ? "neutral" : run.ok ? "good" : "bad";
          return (
            <Pill key={s.key} tone={tone} className="px-3.5 py-2 rounded-xl text-sm" icon={run?.ok ? <ShieldCheck size={13} /> : <CloudOff size={13} />}>
              {s.label}
            </Pill>
          );
        })}
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] px-3.5 py-2 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
        >
          <KeyRound size={14} /> Manage connections
        </Link>
      </div>
    </div>
  );
}

const SEVERITY: Record<AlertItem["severity"], { tone: PillTone; icon: typeof Info; label: string }> = {
  critical: { tone: "bad", icon: AlertOctagon, label: "Critical" },
  warning: { tone: "warn", icon: AlertTriangle, label: "Warning" },
  info: { tone: "neutral", icon: Info, label: "Info" },
};

function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <div className="card flex items-center gap-3 px-5 py-4 text-sm text-[var(--text-muted)] md:px-7">
        <ShieldCheck size={17} className="text-[var(--status-good)]" />
        All systems normal — no alerts right now.
      </div>
    );
  }
  return (
    <Panel eyebrow="Alerts" title="Needs your attention">
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {alerts.map((a) => {
          const { tone, icon: Icon, label } = SEVERITY[a.severity];
          return (
            <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <Icon size={17} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{a.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{a.detail}</p>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
