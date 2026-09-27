// Derived, meaningful data points built on top of the raw readings/rollups
// in lib/queries.ts. Kept pure (no I/O) so it's easy to unit test — see
// lib/insights.test.ts. Callers (API routes / server components) fetch the
// rows and pass them in.

import type { AlertItem, LiveDevice, LiveInverter } from "@/lib/types";
import type { TariffSettings } from "@/lib/metrics";

// --- Devices ---

export interface DeviceUsage {
  id: string;
  name: string;
  kwhToday: number;
  sharePct: number; // share of total device energy today, 0-100
}

/** Ranks devices by today's energy use and expresses each as a share of the tracked total. */
export function topConsumers(devices: Array<{ id: string; name: string; kwhToday: number }>, limit = 5): DeviceUsage[] {
  const total = devices.reduce((sum, d) => sum + d.kwhToday, 0);
  return [...devices]
    .sort((a, b) => b.kwhToday - a.kwhToday)
    .slice(0, limit)
    .map((d) => ({ id: d.id, name: d.name, kwhToday: d.kwhToday, sharePct: total > 0 ? (d.kwhToday / total) * 100 : 0 }));
}

// --- Grid / outages ---

export interface OutageRange {
  startTs: number;
  endTs: number;
  minutes: number;
}

export interface OutageSummary {
  count: number;
  totalMinutes: number;
  longestMinutes: number;
  ranges: OutageRange[];
}

/**
 * Detects grid-outage windows from a chronological series of readings: any
 * stretch where grid voltage reads near zero (or is unreported) while the
 * inverter isn't in a grid-connected mode. Adjacent readings under
 * `maxGapMinutes` apart are merged into one outage window.
 */
export function detectOutages(
  readings: Array<{ ts: Date; gridV: number | null; mode: string | null }>,
  maxGapMinutes = 15
): OutageSummary {
  const isDown = (r: { gridV: number | null; mode: string | null }) => {
    const modeLower = r.mode?.toLowerCase() ?? "";
    const gridLikelyDown = r.gridV == null || r.gridV < 100;
    const modeSaysOffGrid = modeLower.includes("battery") || modeLower.includes("off-grid") || modeLower.includes("solar");
    return gridLikelyDown && (r.mode == null || modeSaysOffGrid);
  };

  const ranges: OutageRange[] = [];
  let current: { start: Date; end: Date } | null = null;

  for (const r of readings) {
    if (isDown(r)) {
      if (current && (r.ts.getTime() - current.end.getTime()) / 60_000 <= maxGapMinutes) {
        current.end = r.ts;
      } else {
        if (current) ranges.push(toRange(current));
        current = { start: r.ts, end: r.ts };
      }
    }
  }
  if (current) ranges.push(toRange(current));

  const totalMinutes = ranges.reduce((s, r) => s + r.minutes, 0);
  const longestMinutes = ranges.reduce((m, r) => Math.max(m, r.minutes), 0);
  return { count: ranges.length, totalMinutes, longestMinutes, ranges };

  function toRange(c: { start: Date; end: Date }): OutageRange {
    return { startTs: c.start.getTime(), endTs: c.end.getTime(), minutes: (c.end.getTime() - c.start.getTime()) / 60_000 };
  }
}

// --- Solar ---

/** Fraction of nameplate capacity the panels are producing right now, [0, 1+]. */
export function solarCapacityFactor(pvW: number, panelKwp: number): number {
  if (panelKwp <= 0) return 0;
  return pvW / (panelKwp * 1000);
}

// --- Battery ---

/** Depth of discharge for a day: the SoC range actually used, in percentage points. */
export function batteryDepthOfDischarge(minSocPct: number, maxSocPct: number): number {
  return Math.max(0, maxSocPct - minSocPct);
}

// --- Inverter ---

/** Rough conversion/system efficiency: load served vs. total energy sourced (pv + discharge + import). */
export function inverterEfficiency(day: {
  pvKwh: number;
  battDischargeKwh: number;
  gridImportKwh: number;
  loadKwh: number;
}): number | null {
  const sourced = day.pvKwh + day.battDischargeKwh + day.gridImportKwh;
  if (sourced <= 0) return null;
  return Math.min(1, day.loadKwh / sourced);
}

// --- Environment ---

/** kg of CO2 avoided by not drawing that energy from the grid. */
export function co2AvoidedKg(avoidedGridKwh: number, factorKgPerKwh: number): number {
  return Math.max(0, avoidedGridKwh) * factorKgPerKwh;
}

/** Rough tree-years equivalent for a CO2 mass (≈21 kg CO2 absorbed per mature tree per year). */
export function treeEquivalent(co2Kg: number): number {
  return co2Kg / 21;
}

// --- Alerts ---

export function generateAlerts(params: {
  inverter: LiveInverter | null;
  devices: LiveDevice[];
  settings: TariffSettings;
  ingestFailing: string[]; // source names currently failing
}): AlertItem[] {
  const alerts: AlertItem[] = [];
  const { inverter, devices, ingestFailing } = params;

  if (inverter) {
    if (inverter.batterySoc <= 15) {
      alerts.push({
        id: "battery-low",
        severity: inverter.batterySoc <= 8 ? "critical" : "warning",
        title: "Battery low",
        detail: `State of charge at ${inverter.batterySoc.toFixed(0)}%.`,
      });
    }
    if (inverter.inverterTempC != null && inverter.inverterTempC >= 55) {
      alerts.push({
        id: "inverter-hot",
        severity: inverter.inverterTempC >= 65 ? "critical" : "warning",
        title: "Inverter running hot",
        detail: `${inverter.inverterTempC.toFixed(0)}°C — check ventilation.`,
      });
    }
    const modeLower = inverter.mode?.toLowerCase() ?? "";
    if (modeLower.includes("battery") || modeLower.includes("off-grid")) {
      alerts.push({
        id: "grid-outage",
        severity: "warning",
        title: "Grid outage",
        detail: `Running on ${inverter.mode}.`,
      });
    }
    const ageMinutes = (Date.now() - new Date(inverter.ts).getTime()) / 60_000;
    if (ageMinutes > 15) {
      alerts.push({
        id: "stale-reading",
        severity: ageMinutes > 60 ? "critical" : "warning",
        title: "Inverter data stale",
        detail: `Last reading ${Math.round(ageMinutes)} min ago.`,
      });
    }
  } else {
    alerts.push({ id: "no-inverter-data", severity: "warning", title: "No inverter data yet", detail: "Run a poll to populate readings." });
  }

  const offlineDevices = devices.filter((d) => !d.online);
  if (offlineDevices.length > 0) {
    alerts.push({
      id: "devices-offline",
      severity: "info",
      title: `${offlineDevices.length} device${offlineDevices.length > 1 ? "s" : ""} offline`,
      detail: offlineDevices.map((d) => d.name).join(", "),
    });
  }

  for (const source of ingestFailing) {
    alerts.push({
      id: `ingest-failing-${source}`,
      severity: "warning",
      title: `${source} ingestion failing`,
      detail: "Check Settings → System for the last error.",
    });
  }

  const severityRank: Record<AlertItem["severity"], number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
