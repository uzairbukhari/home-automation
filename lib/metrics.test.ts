import { describe, it, expect } from "vitest";
import {
  selfSufficiency,
  selfConsumption,
  specificYield,
  estimatedSavingsPkr,
  paybackProgress,
  batteryTimeToBoundMinutes,
  dailyBatteryCycles,
  rateForHour,
  computeEnergyDelta,
  cumulativeBatteryCycles,
  hourlyPattern,
  weekdayHourPattern,
  trendComparison,
  type DailyEnergy,
  type TariffSettings,
} from "./metrics";

const baseTariff: TariffSettings = {
  currency: "PKR",
  flatRatePerKwh: 55,
  peakRatePerKwh: null,
  offPeakRatePerKwh: null,
  peakStartHour: null,
  peakEndHour: null,
  systemCostPkr: 500_000,
  panelKwp: 3.5,
  batteryKwh: 5.2,
  gridCo2KgPerKwh: 0.45,
};

const day: DailyEnergy = {
  pvKwh: 20,
  loadKwh: 15,
  gridImportKwh: 2,
  gridExportKwh: 3,
  battChargeKwh: 6,
  battDischargeKwh: 5,
};

describe("selfSufficiency", () => {
  it("computes the share of load not covered by grid import", () => {
    expect(selfSufficiency(day)).toBeCloseTo((15 - 2) / 15, 5);
  });

  it("returns 0 when there is no load", () => {
    expect(selfSufficiency({ ...day, loadKwh: 0 })).toBe(0);
  });

  it("clamps at 0 when grid import exceeds load (edge case)", () => {
    expect(selfSufficiency({ ...day, loadKwh: 5, gridImportKwh: 8 })).toBe(0);
  });
});

describe("selfConsumption", () => {
  it("computes the share of solar used directly", () => {
    expect(selfConsumption(day)).toBeCloseTo((20 - 3) / 20, 5);
  });

  it("returns 1 when there is no production", () => {
    expect(selfConsumption({ ...day, pvKwh: 0 })).toBe(1);
  });
});

describe("specificYield", () => {
  it("divides produced energy by installed kWp", () => {
    expect(specificYield(14, 3.5)).toBe(4);
  });

  it("returns 0 for zero or negative capacity", () => {
    expect(specificYield(14, 0)).toBe(0);
  });
});

describe("estimatedSavingsPkr", () => {
  it("uses the flat rate against solar used directly + battery discharge", () => {
    const avoidedKwh = (20 - 3) + 5; // 22
    expect(estimatedSavingsPkr(day, baseTariff)).toBeCloseTo(avoidedKwh * 55, 5);
  });

  it("averages peak/off-peak when no flat rate is set", () => {
    const tariff: TariffSettings = {
      ...baseTariff,
      flatRatePerKwh: null,
      peakRatePerKwh: 70,
      offPeakRatePerKwh: 30,
    };
    const avoidedKwh = (20 - 3) + 5;
    expect(estimatedSavingsPkr(day, tariff)).toBeCloseTo(avoidedKwh * 50, 5);
  });

  it("returns 0 when no tariff is configured", () => {
    const tariff: TariffSettings = { ...baseTariff, flatRatePerKwh: null };
    expect(estimatedSavingsPkr(day, tariff)).toBe(0);
  });
});

describe("rateForHour", () => {
  const touTariff: TariffSettings = {
    ...baseTariff,
    flatRatePerKwh: null,
    peakRatePerKwh: 70,
    offPeakRatePerKwh: 30,
    peakStartHour: 18,
    peakEndHour: 22,
  };

  it("returns peak rate inside the peak window", () => {
    expect(rateForHour(19, touTariff)).toBe(70);
  });

  it("returns off-peak rate outside the peak window", () => {
    expect(rateForHour(10, touTariff)).toBe(30);
  });

  it("handles a peak window wrapping past midnight", () => {
    const wrapping: TariffSettings = { ...touTariff, peakStartHour: 22, peakEndHour: 6 };
    expect(rateForHour(23, wrapping)).toBe(70);
    expect(rateForHour(3, wrapping)).toBe(70);
    expect(rateForHour(10, wrapping)).toBe(30);
  });

  it("falls back to flat rate when no TOU window is configured", () => {
    expect(rateForHour(10, baseTariff)).toBe(55);
  });
});

describe("paybackProgress", () => {
  it("computes fraction of system cost recovered", () => {
    expect(paybackProgress(100_000, 500_000)).toBeCloseTo(0.2, 5);
  });

  it("returns 0 without a system cost", () => {
    expect(paybackProgress(100_000, null)).toBe(0);
  });

  it("clamps at 1 once fully paid back", () => {
    expect(paybackProgress(600_000, 500_000)).toBe(1);
  });
});

describe("batteryTimeToBoundMinutes", () => {
  it("estimates minutes to full while charging", () => {
    // 5.2kWh capacity, 50% SOC, charging at 1000W -> 2600Wh remaining / 1000W * 60
    const result = batteryTimeToBoundMinutes(50, 5.2, 1000);
    expect(result).toEqual({ direction: "charging", minutes: 156 });
  });

  it("estimates minutes to empty while discharging", () => {
    // 50% of 5.2kWh = 2600Wh, at 500W discharge -> 312 minutes
    const result = batteryTimeToBoundMinutes(50, 5.2, -500);
    expect(result).toEqual({ direction: "discharging", minutes: 312 });
  });

  it("returns null when idle", () => {
    expect(batteryTimeToBoundMinutes(50, 5.2, 2)).toBeNull();
  });

  it("returns null when already full and charging", () => {
    expect(batteryTimeToBoundMinutes(100, 5.2, 500)).toBeNull();
  });

  it("returns null when already empty and discharging", () => {
    expect(batteryTimeToBoundMinutes(0, 5.2, -500)).toBeNull();
  });
});

describe("dailyBatteryCycles", () => {
  it("divides discharge energy by capacity", () => {
    expect(dailyBatteryCycles(2.6, 5.2)).toBe(0.5);
  });
});

describe("computeEnergyDelta", () => {
  const base = {
    previousTs: new Date("2026-01-01T12:00:00Z"),
    now: new Date("2026-01-01T12:30:00Z"), // 0.5h later
    pvW: 2000,
    loadW: 1000,
    gridW: 200,
    batteryW: -400,
    previousPvW: 1000,
    previousLoadW: 800,
    previousGridW: 0,
    previousBatteryW: -200,
  };

  it("integrates trapezoidally between previous and now", () => {
    const delta = computeEnergyDelta(base);
    // avgPv = 1500W over 0.5h = 0.75kWh
    expect(delta).not.toBeNull();
    expect(delta!.hours).toBeCloseTo(0.5, 5);
    expect(delta!.pvKwh).toBeCloseTo(0.75, 5);
    expect(delta!.loadKwh).toBeCloseTo(0.45, 5); // avg 900W * 0.5h
    expect(delta!.gridImportKwh).toBeCloseTo(0.05, 5); // avg 100W * 0.5h
    expect(delta!.gridExportKwh).toBe(0);
    expect(delta!.battChargeKwh).toBe(0);
    expect(delta!.battDischargeKwh).toBeCloseTo(0.15, 5); // avg -300W * 0.5h
  });

  it("returns null when there is no previous reading", () => {
    expect(computeEnergyDelta({ ...base, previousTs: null })).toBeNull();
  });

  it("returns null when the gap is zero or negative (clock issues)", () => {
    expect(computeEnergyDelta({ ...base, now: base.previousTs })).toBeNull();
  });

  it("returns null when the gap exceeds an hour (long outage)", () => {
    expect(
      computeEnergyDelta({ ...base, now: new Date("2026-01-01T14:00:00Z") })
    ).toBeNull();
  });
});

describe("cumulativeBatteryCycles", () => {
  it("sums per-day cycle contributions across rows", () => {
    const rows = [{ dischargeKwh: 2.6 }, { dischargeKwh: 5.2 }, { dischargeKwh: 1.3 }];
    expect(cumulativeBatteryCycles(rows, 5.2)).toBeCloseTo(0.5 + 1 + 0.25, 5);
  });

  it("returns 0 for an empty array", () => {
    expect(cumulativeBatteryCycles([], 5.2)).toBe(0);
  });

  it("returns 0 for zero capacity", () => {
    expect(cumulativeBatteryCycles([{ dischargeKwh: 5 }], 0)).toBe(0);
  });
});

describe("hourlyPattern", () => {
  it("averages Wh across days with data for each hour and zero-fills the rest", () => {
    const rows = [
      { hourOfDay: 12, pvWh: 800, loadWh: 400, sampleCount: 6 },
      { hourOfDay: 12, pvWh: 1000, loadWh: 600, sampleCount: 6 },
      { hourOfDay: 18, pvWh: 0, loadWh: 900, sampleCount: 6 },
    ];
    const pattern = hourlyPattern(rows);
    expect(pattern).toHaveLength(24);
    expect(pattern[12]).toEqual({ hour: 12, avgPvW: 900, avgLoadW: 500, samples: 2 });
    expect(pattern[18]).toEqual({ hour: 18, avgPvW: 0, avgLoadW: 900, samples: 1 });
    expect(pattern[0]).toEqual({ hour: 0, avgPvW: 0, avgLoadW: 0, samples: 0 });
  });
});

describe("weekdayHourPattern", () => {
  it("groups by weekday derived from date and hour, averaging load", () => {
    // 2026-01-04 is a Sunday (weekday 0), 2026-01-11 is also a Sunday.
    const rows = [
      { date: "2026-01-04", hourOfDay: 9, loadWh: 300 },
      { date: "2026-01-11", hourOfDay: 9, loadWh: 500 },
      { date: "2026-01-05", hourOfDay: 9, loadWh: 1000 }, // Monday
    ];
    const pattern = weekdayHourPattern(rows);
    const sunday9am = pattern.find((p) => p.weekday === 0 && p.hour === 9);
    const monday9am = pattern.find((p) => p.weekday === 1 && p.hour === 9);
    expect(sunday9am?.avgLoadW).toBe(400);
    expect(monday9am?.avgLoadW).toBe(1000);
  });
});

describe("trendComparison", () => {
  function dayRow(date: string, loadKwh: number): DailyEnergy & { date: string } {
    return {
      date,
      pvKwh: 0,
      loadKwh,
      gridImportKwh: 0,
      gridExportKwh: 0,
      battChargeKwh: 0,
      battDischargeKwh: 0,
    };
  }

  it("sums the last N days as current and the N before that as previous", () => {
    // referenceDate 2026-01-10; current window = Jan 4-10 (7d); previous = Dec 28-Jan 3.
    const rows = [
      dayRow("2025-12-28", 10),
      dayRow("2025-12-30", 10),
      dayRow("2026-01-04", 20),
      dayRow("2026-01-10", 30),
    ];
    const result = trendComparison(rows, 7, new Date("2026-01-10T00:00:00Z"));
    expect(result.current.loadKwh).toBe(50);
    expect(result.previous.loadKwh).toBe(20);
    expect(result.changePct.loadKwh).toBeCloseTo((50 - 20) / 20, 5);
  });

  it("returns null changePct when the previous window has no data", () => {
    const rows = [dayRow("2026-01-10", 30)];
    const result = trendComparison(rows, 7, new Date("2026-01-10T00:00:00Z"));
    expect(result.changePct.loadKwh).toBeNull();
  });
});
