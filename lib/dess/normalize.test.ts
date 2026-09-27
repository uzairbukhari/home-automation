import { describe, it, expect } from "vitest";
import { normalizeSnapshot } from "./normalize";

// Real response shape confirmed from api.dessmonitor.com docs and the
// open-source ha-dessmonitor project's test fixtures: a flat array of
// {title, val, unit} — this is devcode 2477's actual queryDeviceLastData
// output (idle, Line Mode, battery full).
const REAL_FIXTURE = [
  { title: "Working State", val: "Line Mode", unit: "" },
  { title: "AC Input Voltage", val: "244.8", unit: "V" },
  { title: "AC Input Frequency", val: "49.9", unit: "Hz" },
  { title: "PV Input Voltage", val: "359.6", unit: "V" },
  { title: "PV Input Power", val: "2534", unit: "W" },
  { title: "Battery Voltage", val: "53.2", unit: "V" },
  { title: "Battery Capacity", val: "100", unit: "%" },
  { title: "Battery Charging Current", val: "0", unit: "A" },
  { title: "Battery Discharge Current", val: "0", unit: "A" },
  { title: "Output Voltage", val: "244.8", unit: "V" },
  { title: "Output Frequency", val: "49.9", unit: "Hz" },
  { title: "Output Apparent Power", val: "1564", unit: "VA" },
  { title: "Output Active Power", val: "1556", unit: "W" },
  { title: "AC Output Load", val: "28", unit: "%" },
];

// Real queryDeviceLastData output from a live HPVINV02 (devcode 6468) unit —
// captured via `npm run dess:probe` while off-grid, running on battery.
const REAL_HPVINV02_FIXTURE = [
  { title: "pattern", val: "Battery mode" },
  { title: "grid voltage", val: "233.7", unit: "V" },
  { title: "Mains power", val: "0", unit: "W" },
  { title: "output voltage", val: "229.8", unit: "V" },
  { title: "Output active power", val: "550", unit: "W" },
  { title: "cell voltage", val: "26.1", unit: "V" },
  { title: "battery capacity", val: "83", unit: "%" },
  { title: "Battery charging current", val: "0", unit: "A" },
  { title: "Battery discharge current", val: "22", unit: "A" },
  { title: "PV power", val: "0", unit: "W" },
  { title: "Maximum temperature", val: "44", unit: "℃" },
];

describe("normalizeSnapshot", () => {
  it("maps a real HPVINV02 (devcode 6468) fixture — off-grid, battery mode", () => {
    const result = normalizeSnapshot(REAL_HPVINV02_FIXTURE);
    expect(result.pvW).toBe(0);
    expect(result.loadW).toBe(550);
    expect(result.gridW).toBe(0);
    expect(result.gridV).toBe(233.7);
    expect(result.batterySoc).toBe(83);
    expect(result.batteryV).toBe(26.1);
    expect(result.batteryA).toBe(-22);
    expect(result.batteryW).toBeCloseTo(-574.2, 5); // discharging: matches ~Output active power
    expect(result.mode).toBe("Battery mode");
    expect(result.inverterTempC).toBe(44);
  });

  it("maps a real devcode 2477 fixture", () => {
    const result = normalizeSnapshot(REAL_FIXTURE);
    expect(result.pvW).toBe(2534);
    expect(result.loadW).toBe(1556);
    expect(result.batterySoc).toBe(100);
    expect(result.batteryV).toBe(53.2);
    expect(result.mode).toBe("Line Mode");
    // Idle: charge and discharge current both 0 -> derived battery power is 0.
    expect(result.batteryW).toBe(0);
    expect(result.batteryA).toBe(0);
    // This device doesn't report grid power/voltage directly (only "AC Input
    // Voltage", which is aliased to gridVoltage but there's no matching
    // "grid power"/"ac input active power" title in this fixture).
    expect(result.gridW).toBeNull();
    expect(result.gridV).toBe(244.8);
  });

  it("derives battery power (signed) from voltage and charge/discharge current", () => {
    const charging = [
      { title: "Battery Voltage", val: "53.2" },
      { title: "Battery Charging Current", val: "10" },
      { title: "Battery Discharge Current", val: "0" },
    ];
    expect(normalizeSnapshot(charging).batteryW).toBeCloseTo(532, 5);

    const discharging = [
      { title: "Battery Voltage", val: "53.2" },
      { title: "Battery Charging Current", val: "0" },
      { title: "Battery Discharge Current", val: "8" },
    ];
    expect(normalizeSnapshot(discharging).batteryW).toBeCloseTo(-425.6, 5);
  });

  it("prefers a direct battery power title over deriving from V*A", () => {
    const points = [
      { title: "Battery Power", val: "-300" },
      { title: "Battery Voltage", val: "53.2" },
      { title: "Battery Charging Current", val: "10" },
    ];
    expect(normalizeSnapshot(points).batteryW).toBe(-300);
  });

  it("sums split PV1/PV2 charger power when there's no combined PV title", () => {
    const points = [
      { title: "PV1 Charger Power", val: "800" },
      { title: "PV2 Charger Power", val: "650" },
    ];
    expect(normalizeSnapshot(points).pvW).toBe(1450);
  });

  it("matches titles case-insensitively", () => {
    const points = [{ title: "GRID VOLTAGE", val: "231" }];
    expect(normalizeSnapshot(points).gridV).toBe(231);
  });

  it("defaults missing numeric fields to 0 and unknown fields to null", () => {
    const result = normalizeSnapshot([]);
    expect(result).toEqual({
      pvW: 0,
      loadW: 0,
      batteryW: 0,
      batterySoc: 0,
      batteryV: null,
      batteryA: null,
      gridW: null,
      gridV: null,
      inverterTempC: null,
      mode: null,
      pvV: null,
      pvA: null,
      gridHz: null,
      outputV: null,
      outputHz: null,
      loadPct: null,
    });
  });

  it("maps PV voltage, grid/output frequency, and load percent from devcode 2477 fixture", () => {
    const result = normalizeSnapshot(REAL_FIXTURE);
    expect(result.pvV).toBe(359.6);
    expect(result.gridHz).toBe(49.9);
    expect(result.outputV).toBe(244.8);
    expect(result.outputHz).toBe(49.9);
    expect(result.loadPct).toBe(28);
  });

  it("ignores unparseable numeric values", () => {
    const result = normalizeSnapshot([{ title: "PV Power", val: "N/A" }]);
    expect(result.pvW).toBe(0);
  });
});
