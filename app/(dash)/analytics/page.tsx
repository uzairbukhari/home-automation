import {
  getRecentEnergyDaily,
  getRecentEnergyHourly,
  getRecentBatteryHealth,
  getAllBatteryHealthDaily,
  getReadingsForOutageDetection,
  getTuyaEnergyTotalsByDevice,
  getSettings,
} from "@/lib/queries";
import { selfSufficiency, selfConsumption, specificYield, trendComparison, weekdayHourPattern } from "@/lib/metrics";
import { detectOutages, topConsumers, co2AvoidedKg, treeEquivalent } from "@/lib/insights";
import { EnergyBars } from "@/components/charts/energy-bars";
import { RatioTrend } from "@/components/charts/ratio-trend";
import { PeakLoadHeatmap } from "@/components/charts/peak-load-heatmap";
import { KpiTile } from "@/components/kpi-tile";
import { TrendComparisonCard } from "@/components/trend-comparison-card";
import { BatteryHealthCard } from "@/components/battery-health-card";
import { HudPanel } from "@/components/hud/hud-panel";
import { formatKwh } from "@/lib/utils";
import { Sun, Home, Zap, Gauge, Leaf, ZapOff, PlugZap, Percent } from "lucide-react";

export const dynamic = "force-dynamic";

function shortDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function AnalyticsPage() {
  const [rows60, settings, hourlyRows, recentBatteryHealth, allBatteryHealth, outageReadings, deviceEnergy] =
    await Promise.all([
      getRecentEnergyDaily(60),
      getSettings(),
      getRecentEnergyHourly(60),
      getRecentBatteryHealth(30),
      getAllBatteryHealthDaily(),
      getReadingsForOutageDetection(30),
      getTuyaEnergyTotalsByDevice(30),
    ]);
  const rows = rows60.slice(-30);
  const trend7 = trendComparison(rows60, 7);
  const trend30 = trendComparison(rows60, 30);
  const weekdayPattern = weekdayHourPattern(hourlyRows);
  const outages = detectOutages(outageReadings);
  const devices = topConsumers(deviceEnergy, 6);

  const barPoints = rows.map((r) => ({
    label: shortDate(r.date),
    pvKwh: r.pvKwh,
    loadKwh: r.loadKwh,
    gridImportKwh: r.gridImportKwh,
  }));

  const ratioPoints = rows.map((r) => ({
    label: shortDate(r.date),
    selfSufficiency: selfSufficiency(r),
    selfConsumption: selfConsumption(r),
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      pvKwh: acc.pvKwh + r.pvKwh,
      loadKwh: acc.loadKwh + r.loadKwh,
      gridImportKwh: acc.gridImportKwh + r.gridImportKwh,
      battDischargeKwh: acc.battDischargeKwh + r.battDischargeKwh,
      gridExportKwh: acc.gridExportKwh + r.gridExportKwh,
    }),
    { pvKwh: 0, loadKwh: 0, gridImportKwh: 0, battDischargeKwh: 0, gridExportKwh: 0 }
  );
  const avgYield = rows.length ? specificYield(totals.pvKwh, settings.panelKwp) / rows.length : 0;
  const avoidedGridKwh = Math.max(0, totals.pvKwh - totals.gridExportKwh) + totals.battDischargeKwh;
  const co2Kg = co2AvoidedKg(avoidedGridKwh, settings.gridCo2KgPerKwh);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-[var(--text-primary)]">
          Analytics
        </h1>
        <p className="font-readout text-xs text-[var(--text-muted)]">Last {rows.length || 30} days</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Produced" value={formatKwh(totals.pvKwh, 0)} icon={Sun} accent="var(--series-4)" />
        <KpiTile label="Consumed" value={formatKwh(totals.loadKwh, 0)} icon={Home} accent="var(--series-1)" />
        <KpiTile label="Grid imported" value={formatKwh(totals.gridImportKwh, 0)} icon={Zap} accent="var(--series-2)" />
        <KpiTile label="Avg specific yield" value={`${avgYield.toFixed(2)} kWh/kWp`} icon={Gauge} accent="var(--series-3)" />
      </div>

      <HudPanel title="Energy balance" icon={Gauge}>
        {barPoints.length ? <EnergyBars points={barPoints} /> : <EmptyState />}
      </HudPanel>

      <HudPanel title="Self-sufficiency & self-consumption" icon={Percent}>
        {ratioPoints.length ? <RatioTrend points={ratioPoints} /> : <EmptyState />}
      </HudPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendComparisonCard title="Last 7 days vs prior 7" result={trend7} />
        <TrendComparisonCard title="Last 30 days vs prior 30" result={trend30} />
      </div>

      <HudPanel title="Peak-load pattern" icon={Gauge}>
        {hourlyRows.length ? (
          <PeakLoadHeatmap points={weekdayPattern} />
        ) : (
          <p className="text-sm text-[var(--text-muted)] py-16 text-center">
            No hourly history yet — this fills in as the poll job runs over the coming days.
          </p>
        )}
      </HudPanel>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HudPanel title="Grid outages" icon={ZapOff} bodyClassName="flex flex-col gap-2 p-5">
          <div className="flex items-end gap-2">
            <span className="font-readout text-3xl font-semibold text-[var(--text-primary)] tabular-nums">
              {outages.count}
            </span>
            <span className="text-xs text-[var(--text-muted)] pb-1">in last 30d</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {outages.totalMinutes > 0
              ? `${Math.round(outages.totalMinutes)} min total, longest ${Math.round(outages.longestMinutes)} min`
              : "No outages detected"}
          </p>
        </HudPanel>

        <HudPanel title="CO₂ avoided" icon={Leaf} bodyClassName="flex flex-col gap-2 p-5">
          <div className="flex items-end gap-2">
            <span className="font-readout text-3xl font-semibold text-[var(--status-good)] tabular-nums">
              {co2Kg.toFixed(0)}
            </span>
            <span className="text-xs text-[var(--text-muted)] pb-1">kg CO₂</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">≈ {treeEquivalent(co2Kg).toFixed(1)} tree-years</p>
        </HudPanel>

        <HudPanel title="Top consumers" icon={PlugZap} bodyClassName="flex flex-col gap-2 p-5">
          {devices.length ? (
            <ul className="flex flex-col gap-1.5">
              {devices.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)] truncate">{d.name}</span>
                  <span className="font-readout text-[var(--text-primary)] tabular-nums shrink-0">
                    {d.kwhToday.toFixed(1)} kWh
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No device energy data yet.</p>
          )}
        </HudPanel>
      </div>

      {allBatteryHealth.length ? (
        <BatteryHealthCard recentRows={recentBatteryHealth} allRows={allBatteryHealth} batteryKwh={settings.batteryKwh} />
      ) : (
        <HudPanel title="Battery health">
          <p className="text-sm text-[var(--text-muted)] py-4 text-center">
            No battery health history yet — this fills in as the poll job runs.
          </p>
        </HudPanel>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-sm text-[var(--text-muted)] py-16 text-center">
      No daily history yet — this fills in once the poll job has run for a few days.
    </p>
  );
}
