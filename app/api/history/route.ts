import { NextResponse } from "next/server";
import { getRecentEnergyDaily, getSettings } from "@/lib/queries";
import { selfSufficiency, selfConsumption, specificYield, estimatedSavingsPkr } from "@/lib/metrics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));

  const [rows, settings] = await Promise.all([getRecentEnergyDaily(days), getSettings()]);

  const daily = rows.map((r) => ({
    date: r.date,
    pvKwh: r.pvKwh,
    loadKwh: r.loadKwh,
    gridImportKwh: r.gridImportKwh,
    gridExportKwh: r.gridExportKwh,
    battChargeKwh: r.battChargeKwh,
    battDischargeKwh: r.battDischargeKwh,
    selfSufficiency: selfSufficiency(r),
    selfConsumption: selfConsumption(r),
    specificYield: specificYield(r.pvKwh, settings.panelKwp),
    savingsPkr: estimatedSavingsPkr(r, settings),
  }));

  const totals = daily.reduce(
    (acc, d) => ({
      pvKwh: acc.pvKwh + d.pvKwh,
      loadKwh: acc.loadKwh + d.loadKwh,
      gridImportKwh: acc.gridImportKwh + d.gridImportKwh,
      savingsPkr: acc.savingsPkr + d.savingsPkr,
    }),
    { pvKwh: 0, loadKwh: 0, gridImportKwh: 0, savingsPkr: 0 }
  );

  return NextResponse.json({ daily, totals, settings });
}
