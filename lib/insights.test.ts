import { describe, it, expect } from "vitest";
import {
  topConsumers,
  detectOutages,
  solarCapacityFactor,
  batteryDepthOfDischarge,
  inverterEfficiency,
  co2AvoidedKg,
  treeEquivalent,
  generateAlerts,
} from "./insights";
import type { LiveInverter, LiveDevice } from "./types";
import type { TariffSettings } from "./metrics";

describe("topConsumers", () => {
  it("ranks by kWh and computes share of the tracked total", () => {
    const result = topConsumers([
      { id: "a", name: "AC", kwhToday: 6 },
      { id: "b", name: "Fridge", kwhToday: 3 },
      { id: "c", name: "Lamp", kwhToday: 1 },
    ]);
    expect(result[0].id).toBe("a");
    expect(result[0].sharePct).toBeCloseTo(60, 5);
    expect(result[1].sharePct).toBeCloseTo(30, 5);
  });

  it("returns empty shares when nothing consumed anything", () => {
    const result = topConsumers([{ id: "a", name: "AC", kwhToday: 0 }]);
    expect(result[0].sharePct).toBe(0);
  });
});

describe("detectOutages", () => {
  it("merges a contiguous low-grid-voltage stretch into one outage", () => {
    const base = new Date("2026-01-01T10:00:00Z").getTime();
    const readings = [
      { ts: new Date(base), gridV: 230, mode: "Line Mode" },
      { ts: new Date(base + 5 * 60_000), gridV: 0, mode: "Battery mode" },
      { ts: new Date(base + 10 * 60_000), gridV: 0, mode: "Battery mode" },
      { ts: new Date(base + 15 * 60_000), gridV: 230, mode: "Line Mode" },
    ];
    const summary = detectOutages(readings);
    expect(summary.count).toBe(1);
    expect(summary.totalMinutes).toBe(5);
  });

  it("reports no outages when grid stays up", () => {
    const base = new Date("2026-01-01T10:00:00Z").getTime();
    const readings = [
      { ts: new Date(base), gridV: 230, mode: "Line Mode" },
      { ts: new Date(base + 5 * 60_000), gridV: 231, mode: "Line Mode" },
    ];
    expect(detectOutages(readings).count).toBe(0);
  });
});

describe("solarCapacityFactor", () => {
  it("computes fraction of nameplate capacity", () => {
    expect(solarCapacityFactor(1750, 3.5)).toBeCloseTo(0.5, 5);
  });
  it("returns 0 for non-positive capacity", () => {
    expect(solarCapacityFactor(1000, 0)).toBe(0);
  });
});

describe("batteryDepthOfDischarge", () => {
  it("is the SoC range used", () => {
    expect(batteryDepthOfDischarge(40, 95)).toBe(55);
  });
  it("never goes negative", () => {
    expect(batteryDepthOfDischarge(95, 40)).toBe(0);
  });
});

describe("inverterEfficiency", () => {
  it("is load / total sourced energy", () => {
    const eff = inverterEfficiency({ pvKwh: 8, battDischargeKwh: 2, gridImportKwh: 0, loadKwh: 9 });
    expect(eff).toBeCloseTo(0.9, 5);
  });
  it("returns null when nothing was sourced", () => {
    expect(inverterEfficiency({ pvKwh: 0, battDischargeKwh: 0, gridImportKwh: 0, loadKwh: 0 })).toBeNull();
  });
});

describe("co2AvoidedKg / treeEquivalent", () => {
  it("scales linearly with avoided kWh and the grid factor", () => {
    expect(co2AvoidedKg(10, 0.45)).toBeCloseTo(4.5, 5);
  });
  it("clamps negative avoided energy to 0", () => {
    expect(co2AvoidedKg(-5, 0.45)).toBe(0);
  });
  it("converts CO2 kg to a rough tree-year equivalent", () => {
    expect(treeEquivalent(21)).toBeCloseTo(1, 5);
  });
});

describe("generateAlerts", () => {
  const settings: TariffSettings = {
    currency: "PKR",
    flatRatePerKwh: 45,
    peakRatePerKwh: null,
    offPeakRatePerKwh: null,
    peakStartHour: null,
    peakEndHour: null,
    systemCostPkr: null,
    panelKwp: 3.5,
    batteryKwh: 5.2,
    gridCo2KgPerKwh: 0.45,
  };

  function inv(overrides: Partial<LiveInverter> = {}): LiveInverter {
    return {
      ts: new Date().toISOString(),
      pvW: 1000,
      loadW: 500,
      batteryW: 100,
      batterySoc: 80,
      batteryV: 53,
      batteryA: 2,
      gridW: 0,
      gridV: 230,
      gridHz: 50,
      pvV: 300,
      outputV: 230,
      loadPct: 20,
      inverterTempC: 40,
      mode: "Line Mode",
      ...overrides,
    };
  }

  it("flags low battery as warning, critically low as critical", () => {
    const warn = generateAlerts({ inverter: inv({ batterySoc: 12 }), devices: [], settings, ingestFailing: [] });
    expect(warn.find((a) => a.id === "battery-low")?.severity).toBe("warning");

    const crit = generateAlerts({ inverter: inv({ batterySoc: 5 }), devices: [], settings, ingestFailing: [] });
    expect(crit.find((a) => a.id === "battery-low")?.severity).toBe("critical");
  });

  it("flags an off-grid mode as a grid-outage alert", () => {
    const alerts = generateAlerts({ inverter: inv({ mode: "Battery mode" }), devices: [], settings, ingestFailing: [] });
    expect(alerts.some((a) => a.id === "grid-outage")).toBe(true);
  });

  it("sorts critical before warning before info", () => {
    const devices: LiveDevice[] = [
      { id: "d1", name: "Lamp", category: "dj", online: false, room: null, status: [], powerW: null, kwhToday: 0 },
    ];
    const alerts = generateAlerts({ inverter: inv({ batterySoc: 5 }), devices, settings, ingestFailing: ["dess"] });
    const severities = alerts.map((a) => a.severity);
    const firstWarningIdx = severities.indexOf("warning");
    const firstInfoIdx = severities.indexOf("info");
    expect(severities[0]).toBe("critical");
    expect(firstWarningIdx).toBeLessThan(firstInfoIdx);
  });

  it("has no alerts for a healthy, fresh, online system", () => {
    const alerts = generateAlerts({ inverter: inv(), devices: [], settings, ingestFailing: [] });
    expect(alerts).toEqual([]);
  });
});
