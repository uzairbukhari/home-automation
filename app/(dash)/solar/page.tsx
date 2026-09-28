import {
  getAllEnergyDaily,
  getRecentEnergyHourly,
  getRecentBatteryHealth,
  getAllBatteryHealthDaily,
  getReadingsForOutageDetection,
  getSettings,
} from "@/lib/queries";
import {
  selfSufficiency,
  selfConsumption,
  specificYield,
  trendComparison,
  weekdayHourPattern,
  estimatedSavingsPkr,
  paybackProgress,
} from "@/lib/metrics";
import { detectOutages, co2AvoidedKg, treeEquivalent } from "@/lib/insights";
import { EnergyBars } from "@/components/charts/energy-bars";
import { RatioTrend } from "@/components/charts/ratio-trend";
import { PeakLoadHeatmap } from "@/components/charts/peak-load-heatmap";
import { SavingsBars } from "@/components/charts/savings-bars";
import { KpiTile, Value } from "@/components/kpi-tile";
import { TrendComparisonCard } from "@/components/trend-comparison-card";
import { BatteryHealthCard } from "@/components/battery-health-card";
import { Panel, PageHeader, EmptyState } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { formatPkr } from "@/lib/utils";
import { Sun, Home, UtilityPole, Gauge, Leaf, TreePine, Wallet, Target, ZapOff, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

type DailyRow = Awaited<ReturnType<typeof getAllEnergyDaily>>[number];

function shortDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sumPv(rows: DailyRow[]) {
  return rows.reduce((sum, r) => sum + r.pvKwh, 0);
}

export default async function SolarPage() {
  const [allRows, settings, hourlyRows, recentBatteryHealth, allBatteryHealth, outageReadings] = await Promise.all([
    getAllEnergyDaily(),
    getSettings(),
    getRecentEnergyHourly(60),
    getRecentBatteryHealth(30),
    getAllBatteryHealthDaily(),
    getReadingsForOutageDetection(30),
  ]);

  const rows60 = allRows.slice(-60);
  const rows = rows60.slice(-30);
  const trend7 = trendComparison(rows60, 7);
  const trend30 = trendComparison(rows60, 30);
  const weekdayPattern = weekdayHourPattern(hourlyRows);
  const outages = detectOutages(outageReadings);

  // Month/year windows keyed off the newest recorded day, so they follow the
  // data's own calendar rather than the server clock's timezone.
  const latestDate = allRows.at(-1)?.date ?? "";
  const periods = [
    { label: "Last 30 days", kwh: sumPv(rows) },
    { label: "This month", kwh: sumPv(allRows.filter((r) => r.date.startsWith(latestDate.slice(0, 7)))) },
    { label: "This year", kwh: sumPv(allRows.filter((r) => r.date.startsWith(latestDate.slice(0, 4)))) },
    { label: "Lifetime solar", kwh: sumPv(allRows) },
  ];

  const totals = rows.reduce(
    (acc, r) => ({
      pvKwh: acc.pvKwh + r.pvKwh,
      loadKwh: acc.loadKwh + r.loadKwh,
      gridImportKwh: acc.gridImportKwh + r.gridImportKwh,
    }),
    { pvKwh: 0, loadKwh: 0, gridImportKwh: 0 }
  );
  const avgYield = rows.length ? specificYield(totals.pvKwh, settings.panelKwp) / rows.length : 0;

  const perDaySavings = allRows.map((r) => ({ date: r.date, pkr: estimatedSavingsPkr(r, settings) }));
  const lifetimeSavings = perDaySavings.reduce((sum, d) => sum + d.pkr, 0);
  const progress = paybackProgress(lifetimeSavings, settings.systemCostPkr);
  const avoidedGridKwh = allRows.reduce((sum, r) => sum + Math.max(0, r.pvKwh - r.gridExportKwh) + r.battDischargeKwh, 0);
  const co2Kg = co2AvoidedKg(avoidedGridKwh, settings.gridCo2KgPerKwh);
  const noTariff = settings.flatRatePerKwh == null && settings.peakRatePerKwh == null;

  const byMonth = new Map<string, number>();
  for (const d of perDaySavings) {
    const key = d.date.slice(0, 7); // YYYY-MM
    byMonth.set(key, (byMonth.get(key) ?? 0) + d.pkr);
  }
  const monthlyPoints = Array.from(byMonth.entries())
    .slice(-12)
    .map(([key, pkr]) => ({
      label: new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      pkr,
    }));

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

  return (
    <>
      <PageHeader
        eyebrow="Solar system"
        title="Production, savings and health"
        sub={`${settings.panelKwp} kWp array · ${settings.batteryKwh} kWh battery · ${allRows.length} days recorded`}
      />

      <Panel eyebrow="Energy history" title="Solar production" bodyClassName="flex flex-col gap-6">
        <div className="tile grid grid-cols-2 lg:grid-cols-4">
          {periods.map((p, i) => (
            <div
              key={p.label}
              className={[
                "px-5 py-4",
                i % 2 === 1 ? "border-l border-[var(--border)]" : "",
                i >= 2 ? "border-t border-[var(--border)] lg:border-t-0" : "",
                i === 2 ? "lg:border-l" : "",
              ].join(" ")}
            >
              <p className="text-xs text-[var(--text-muted)]">{p.label}</p>
              <Value value={p.kwh >= 100 ? p.kwh.toFixed(0) : p.kwh.toFixed(2)} unit="kWh" className="mt-1 block text-2xl" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile icon={Sun} accent="var(--series-4)" label="Solar produced" value={totals.pvKwh.toFixed(1)} unit="kWh" sub="Last 30 days" />
          <KpiTile icon={Home} accent="var(--series-1)" label="Home energy" value={totals.loadKwh.toFixed(1)} unit="kWh" sub="Last 30 days" />
          <KpiTile icon={UtilityPole} accent="var(--series-2)" label="Grid imported" value={totals.gridImportKwh.toFixed(1)} unit="kWh" sub="Last 30 days" />
          <KpiTile
            icon={Gauge}
            accent="var(--series-3)"
            label="Specific yield"
            value={avgYield.toFixed(2)}
            unit="kWh/kWp"
            sub="Daily average per installed kWp"
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Daily totals"
        title="Last 30 days by day"
        action={
          <>
            <Pill dot="var(--series-4)">Solar</Pill>
            <Pill dot="var(--series-1)">Home</Pill>
            <Pill dot="var(--series-2)">Grid</Pill>
            <Pill>{rows.length} days</Pill>
          </>
        }
      >
        {barPoints.length ? <EnergyBars points={barPoints} /> : <NoHistory />}
      </Panel>

      <Panel eyebrow="Savings" title="What solar has saved you" bodyClassName="flex flex-col gap-6">
        {noTariff && (
          <p className="tile px-4 py-3 text-sm text-[var(--status-warning)]">
            No electricity rate configured yet — set your PKR rate in{" "}
            <a href="/settings" className="underline">
              Settings
            </a>{" "}
            to see savings figures.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile icon={Wallet} accent="var(--series-6)" label="Lifetime savings" value={formatPkr(lifetimeSavings)} sub="Versus buying every unit from the grid" />
          <KpiTile
            icon={Target}
            accent="var(--series-7)"
            label="Payback progress"
            value={settings.systemCostPkr ? Math.round(progress * 100).toString() : "—"}
            unit={settings.systemCostPkr ? "%" : undefined}
            sub={settings.systemCostPkr ? `of ${formatPkr(settings.systemCostPkr)} system cost` : "Set the system cost in Settings"}
          >
            {settings.systemCostPkr != null && (
              <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--surface-3)]">
                <div className="h-full rounded-full bg-[var(--series-7)]" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
              </div>
            )}
          </KpiTile>
          <KpiTile icon={Leaf} accent="var(--status-good)" label="CO₂ avoided" value={co2Kg.toFixed(0)} unit="kg" sub={`${avoidedGridKwh.toFixed(0)} kWh not drawn from the grid`} />
          <KpiTile icon={TreePine} accent="var(--status-good)" label="Tree equivalent" value={treeEquivalent(co2Kg).toFixed(1)} unit="tree-years" sub="Mature trees' annual CO₂ absorption" />
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Monthly savings</p>
          {monthlyPoints.length ? <SavingsBars points={monthlyPoints} /> : <NoHistory />}
        </div>
      </Panel>

      <Panel
        eyebrow="Performance"
        title="Self-sufficiency and self-consumption"
        action={
          <>
            <Pill dot="var(--series-4)">Self-sufficiency</Pill>
            <Pill dot="var(--series-3)">Self-consumption</Pill>
          </>
        }
      >
        {ratioPoints.length ? <RatioTrend points={ratioPoints} /> : <NoHistory />}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <TrendComparisonCard title="Last 7 days vs prior 7" result={trend7} />
          <TrendComparisonCard title="Last 30 days vs prior 30" result={trend30} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel eyebrow="Patterns" title="When your home uses power" action={<Pill>Avg load by weekday × hour</Pill>}>
          {hourlyRows.length ? (
            <PeakLoadHeatmap points={weekdayPattern} />
          ) : (
            <EmptyState>No hourly history yet — this fills in as the poll job runs over the coming days.</EmptyState>
          )}
        </Panel>

        <Panel eyebrow="Grid" title="Outages, last 30 days">
          <div className="flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--series-5)_13%,transparent)] text-[var(--series-5)]">
              <ZapOff size={19} />
            </span>
            <Value value={outages.count} unit={outages.count === 1 ? "outage" : "outages"} className="text-4xl" />
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {outages.totalMinutes > 0
              ? `${Math.round(outages.totalMinutes)} min without grid in total; the longest lasted ${Math.round(outages.longestMinutes)} min.`
              : "No grid outages detected in the last 30 days."}
          </p>
        </Panel>
      </div>

      <Panel eyebrow="Battery performance" title="Operating statistics">
        {allBatteryHealth.length ? (
          <BatteryHealthCard recentRows={recentBatteryHealth} allRows={allBatteryHealth} batteryKwh={settings.batteryKwh} />
        ) : (
          <EmptyState>No battery health history yet — this fills in as the poll job runs.</EmptyState>
        )}
      </Panel>

      <div className="flex items-start gap-3 rounded-[14px] border border-[#28584c] bg-[#0f2224] px-5 py-4 text-sm text-[var(--text-muted)]">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[var(--status-good)]" />
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Measured where available.</span> Daily totals come
          from the inverter&apos;s energy counters and integrated power readings. Savings value solar used on site plus battery
          discharge at your saved tariff (peak and off-peak rates are averaged); fixed charges and taxes are excluded.
        </p>
      </div>
    </>
  );
}

function NoHistory() {
  return <EmptyState>No daily history yet — this fills in once the poll job has run for a few days.</EmptyState>;
}
