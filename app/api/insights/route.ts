import { NextResponse } from "next/server";
import {
  getReadingsForOutageDetection,
  getRecentEnergyDaily,
  getRecentBatteryHealth,
  getAllBatteryHealthDaily,
  getTuyaEnergyTotalsByDevice,
  getSettings,
} from "@/lib/queries";
import {
  detectOutages,
  topConsumers,
  co2AvoidedKg,
  treeEquivalent,
  batteryDepthOfDischarge,
  inverterEfficiency,
} from "@/lib/insights";
import { cumulativeBatteryCycles } from "@/lib/metrics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));

  const [readings, dailyRows, batteryHealth, allBatteryHealth, deviceEnergy, settings] = await Promise.all([
    getReadingsForOutageDetection(days),
    getRecentEnergyDaily(days),
    getRecentBatteryHealth(days),
    getAllBatteryHealthDaily(),
    getTuyaEnergyTotalsByDevice(days),
    getSettings(),
  ]);

  const outages = detectOutages(readings);

  const avoidedGridKwh = dailyRows.reduce((sum, d) => sum + Math.max(0, d.pvKwh - d.gridExportKwh) + d.battDischargeKwh, 0);
  const co2Kg = co2AvoidedKg(avoidedGridKwh, settings.gridCo2KgPerKwh);

  const batteryDoDTrend = batteryHealth.map((b) => ({
    date: b.date,
    dod: batteryDepthOfDischarge(b.minSocPct ?? 0, b.maxSocPct ?? 0),
  }));
  const lifetimeCycles = cumulativeBatteryCycles(allBatteryHealth, settings.batteryKwh);

  const efficiencyTrend = dailyRows.map((d) => ({ date: d.date, efficiency: inverterEfficiency(d) }));

  const devices = topConsumers(deviceEnergy, 8);

  return NextResponse.json({
    days,
    outages,
    co2: { avoidedGridKwh, co2Kg, treeEquivalent: treeEquivalent(co2Kg) },
    batteryDoDTrend,
    lifetimeCycles,
    efficiencyTrend,
    topConsumers: devices,
  });
}
