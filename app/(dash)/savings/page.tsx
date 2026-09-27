import { getAllEnergyDaily, getSettings } from "@/lib/queries";
import { estimatedSavingsPkr, paybackProgress } from "@/lib/metrics";
import { co2AvoidedKg, treeEquivalent } from "@/lib/insights";
import { SavingsBars } from "@/components/charts/savings-bars";
import { KpiTile } from "@/components/kpi-tile";
import { HudPanel } from "@/components/hud/hud-panel";
import { formatPkr, formatPercent } from "@/lib/utils";
import { Wallet, TrendingUp, Target, Leaf, TreePine } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SavingsPage() {
  const [rows, settings] = await Promise.all([getAllEnergyDaily(), getSettings()]);

  const perDaySavings = rows.map((r) => ({ date: r.date, pkr: estimatedSavingsPkr(r, settings) }));
  const lifetimeSavings = perDaySavings.reduce((sum, d) => sum + d.pkr, 0);
  const progress = paybackProgress(lifetimeSavings, settings.systemCostPkr);

  const avoidedGridKwh = rows.reduce((sum, r) => sum + Math.max(0, r.pvKwh - r.gridExportKwh) + r.battDischargeKwh, 0);
  const co2Kg = co2AvoidedKg(avoidedGridKwh, settings.gridCo2KgPerKwh);

  const byMonth = new Map<string, number>();
  for (const d of perDaySavings) {
    const key = d.date.slice(0, 7); // YYYY-MM
    byMonth.set(key, (byMonth.get(key) ?? 0) + d.pkr);
  }
  const monthlyPoints = Array.from(byMonth.entries())
    .slice(-12)
    .map(([key, pkr]) => ({
      label: new Date(key + "-01T00:00:00").toLocaleDateString([], { month: "short", year: "2-digit" }),
      pkr,
    }));

  const noTariff = settings.flatRatePerKwh == null && settings.peakRatePerKwh == null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-[var(--text-primary)]">Savings</h1>
        <p className="font-readout text-xs text-[var(--text-muted)]">Estimated versus buying every unit from the grid</p>
      </header>

      {noTariff && (
        <div className="glass-card p-4 text-sm text-[var(--status-warning)]">
          No electricity rate configured yet. Set your PKR rate on the{" "}
          <a href="/settings" className="underline">
            Settings
          </a>{" "}
          page to see savings figures.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile label="Lifetime savings" value={formatPkr(lifetimeSavings)} icon={Wallet} accent="var(--series-1)" />
        <KpiTile
          label="System cost"
          value={settings.systemCostPkr ? formatPkr(settings.systemCostPkr) : "Not set"}
          icon={Target}
          accent="var(--series-2)"
        />
        <KpiTile label="Payback progress" value={formatPercent(progress)} icon={TrendingUp} accent="var(--series-3)" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiTile
          label="Lifetime CO₂ avoided"
          value={`${co2Kg.toFixed(0)} kg`}
          sub={`${avoidedGridKwh.toFixed(0)} kWh not drawn from the grid`}
          icon={Leaf}
          accent="var(--status-good)"
        />
        <KpiTile
          label="Tree-year equivalent"
          value={treeEquivalent(co2Kg).toFixed(1)}
          sub="mature trees' worth of annual CO₂ absorption"
          icon={TreePine}
          accent="var(--status-good)"
        />
      </div>

      {settings.systemCostPkr != null && (
        <HudPanel bodyClassName="p-5">
          <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-2">
            <span>Payback progress</span>
            <span className="font-readout tabular-nums">
              {formatPkr(lifetimeSavings)} / {formatPkr(settings.systemCostPkr)}
            </span>
          </div>
          <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: "linear-gradient(90deg, var(--series-1), var(--hud-accent))",
                boxShadow: "0 0 12px -2px var(--hud-accent)",
              }}
            />
          </div>
        </HudPanel>
      )}

      <HudPanel title="Monthly savings" icon={Wallet}>
        {monthlyPoints.length ? (
          <SavingsBars points={monthlyPoints} />
        ) : (
          <p className="text-sm text-[var(--text-muted)] py-16 text-center">
            No history yet — this fills in as daily energy data accumulates.
          </p>
        )}
      </HudPanel>
    </div>
  );
}
