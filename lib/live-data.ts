import {
  getLatestInverterReading,
  getTodayInverterReadings,
  getTuyaDevicesWithStatus,
  getTuyaEnergyToday,
  getRecentEnergyDaily,
  getRecentIngestRuns,
  getSettings,
  todayKey,
} from "@/lib/queries";
import { selfSufficiency, selfConsumption, estimatedSavingsPkr, specificYield } from "@/lib/metrics";
import { generateAlerts } from "@/lib/insights";
import type { LiveResponse, LiveDevice, IngestStatus } from "@/lib/types";

function devicePowerW(status: Array<{ code: string; value: unknown }>): number | null {
  const v = status.find((s) => s.code === "cur_power")?.value;
  return typeof v === "number" ? v / 10 : null;
}

/** Shared by app/(dash)/page.tsx (initial server render) and /api/live (polling refresh). */
export async function getLiveData(): Promise<LiveResponse> {
  const [latest, todayReadings, deviceRows, tuyaEnergyToday, [todayDaily], settings, ingestRuns] = await Promise.all([
    getLatestInverterReading(),
    getTodayInverterReadings(),
    getTuyaDevicesWithStatus(),
    getTuyaEnergyToday(),
    getRecentEnergyDaily(1),
    getSettings(),
    getRecentIngestRuns(20),
  ]);

  // getRecentEnergyDaily(1) returns the single most recent row, which is
  // only actually "today" once a poll has run today — otherwise (e.g. right
  // after local midnight, before the first poll) it would be yesterday's
  // row, and must not be mislabeled as today's.
  const daily =
    todayDaily && todayDaily.date === todayKey()
      ? todayDaily
      : {
          pvKwh: 0,
          loadKwh: 0,
          gridImportKwh: 0,
          gridExportKwh: 0,
          battChargeKwh: 0,
          battDischargeKwh: 0,
        };

  const devices: LiveDevice[] = deviceRows.map((d) => {
    const status = (d.lastStatus as Array<{ code: string; value: string | number | boolean }> | null) ?? [];
    return {
      id: d.id,
      name: d.name,
      category: d.category,
      online: d.online,
      room: d.room,
      status,
      powerW: devicePowerW(status),
      kwhToday: tuyaEnergyToday.get(d.id) ?? 0,
    };
  });

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

  // Latest run per source, for the alert rule and the Settings → System panel.
  const latestBySource = new Map<string, (typeof ingestRuns)[number]>();
  for (const run of ingestRuns) {
    if (!latestBySource.has(run.source)) latestBySource.set(run.source, run);
  }
  const ingest: IngestStatus[] = Array.from(latestBySource.values()).map((r) => ({
    source: r.source,
    ok: r.ok,
    startedAt: r.startedAt.toISOString(),
    durationMs: r.durationMs,
    error: r.error,
  }));
  const ingestFailing = ingest.filter((i) => !i.ok && (i.source === "dess" || i.source === "tuya")).map((i) => i.source);

  const alerts = generateAlerts({ inverter, devices, settings, ingestFailing });

  return {
    inverter,
    todayCurve: todayReadings.map((r) => ({
      ts: r.ts.getTime(),
      pvW: r.pvW,
      loadW: r.loadW,
      batteryW: r.batteryW,
      gridW: r.gridW,
    })),
    devices,
    today: {
      ...daily,
      selfSufficiency: selfSufficiency(daily),
      selfConsumption: selfConsumption(daily),
      specificYield: specificYield(daily.pvKwh, settings.panelKwp),
      savingsPkr: estimatedSavingsPkr(daily, settings),
    },
    settings,
    alerts,
    ingest,
  };
}
