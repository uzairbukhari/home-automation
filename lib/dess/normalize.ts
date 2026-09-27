// Maps raw DessMonitor "last data" points into a typed snapshot.
//
// Real responses are a flat array of `{ title, val, unit }`, where `title`
// is a human-readable English string (confirmed via api.dessmonitor.com's
// docs and real device fixtures from the open-source ha-dessmonitor
// project) — NOT a stable machine id. Different inverter models/firmwares
// (DessMonitor "devcodes") use different wording for the same
// measurement, so each logical value below is matched against a list of
// known title variants, case-insensitively. If this account's device uses
// wording not covered here, `npm run dess:probe` will show the real
// titles — add them to the relevant list.

export interface InverterSnapshot {
  pvW: number;
  loadW: number;
  batteryW: number; // positive = charging, negative = discharging
  batterySoc: number;
  batteryV: number | null;
  batteryA: number | null;
  gridW: number | null;
  gridV: number | null;
  inverterTempC: number | null;
  mode: string | null;
  pvV: number | null;
  pvA: number | null;
  gridHz: number | null;
  outputV: number | null;
  outputHz: number | null;
  loadPct: number | null;
}

type RawPoint = { title: string; val: string; unit?: string };

const TITLES = {
  pv: ["pv power", "pv input power", "pv charge power", "pv total charger power"],
  pv1: ["pv1 charger power"],
  pv2: ["pv2 charger power"],
  load: ["output active power", "pload", "load active power"],
  grid: ["grid power", "pgrid", "ac input active power", "mains power"],
  batteryPower: ["battery power", "batt power"],
  // "cell voltage" confirmed (on an HPVINV02/devcode 6468 unit) to be the
  // pack voltage the charge/discharge current is measured against — V*A
  // against it lines up with the reported Output Active Power.
  batteryVoltage: ["battery voltage", "bms battery voltage", "inverter voltage", "cell voltage"],
  batteryCurrent: ["battery current", "batt current", "bms battery current"],
  batteryChargeCurrent: ["battery charging current"],
  batteryDischargeCurrent: ["battery discharge current"],
  batterySoc: ["soc", "state of charge", "battery capacity"],
  gridVoltage: ["grid voltage", "ac input voltage"],
  temperature: [
    "maximum temperature",
    "inverting temperature",
    "inv module termperature", // sic — real API typo, kept as-is
    "dc module termperature",
    "ac radiator temperature",
    "dc radiator temperature",
    "boost temperature",
    "inverter heat sink temperature",
    "inverter radiator temperature",
    "pv radiator temperature",
    "pv temperature",
    "transformer temperature",
  ],
  mode: ["pattern", "operating mode", "work state", "working state"],
  pvVoltage: ["pv input voltage", "pv voltage", "pv1 input voltage"],
  pvCurrent: ["pv input current", "pv current", "pv1 input current"],
  gridFrequency: ["ac input frequency", "grid frequency"],
  outputVoltage: ["output voltage", "ac output voltage"],
  outputFrequency: ["output frequency", "ac output frequency"],
  loadPercent: ["ac output load", "output load percent", "load percent", "load percentage"],
} as const;

function byTitle(points: RawPoint[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of points) {
    const key = p.title?.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, p.val);
  }
  return map;
}

function firstNum(map: Map<string, string>, titles: readonly string[]): number | null {
  for (const t of titles) {
    const v = map.get(t);
    if (v != null) {
      const n = Number.parseFloat(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function firstStr(map: Map<string, string>, titles: readonly string[]): string | null {
  for (const t of titles) {
    const v = map.get(t);
    if (v != null) return v;
  }
  return null;
}

export function normalizeSnapshot(points: RawPoint[]): InverterSnapshot {
  const map = byTitle(points);

  const pvCombined = firstNum(map, TITLES.pv);
  const pv1 = firstNum(map, TITLES.pv1);
  const pv2 = firstNum(map, TITLES.pv2);
  const pvW = pvCombined ?? (pv1 != null || pv2 != null ? (pv1 ?? 0) + (pv2 ?? 0) : 0);

  const batteryV = firstNum(map, TITLES.batteryVoltage);
  const chargeA = firstNum(map, TITLES.batteryChargeCurrent);
  const dischargeA = firstNum(map, TITLES.batteryDischargeCurrent);
  const netCurrent = firstNum(map, TITLES.batteryCurrent);
  const batteryPowerDirect = firstNum(map, TITLES.batteryPower);

  let batteryW: number;
  if (batteryPowerDirect != null) {
    batteryW = batteryPowerDirect;
  } else if (batteryV != null && (chargeA != null || dischargeA != null)) {
    batteryW = batteryV * ((chargeA ?? 0) - (dischargeA ?? 0));
  } else if (batteryV != null && netCurrent != null) {
    batteryW = batteryV * netCurrent;
  } else {
    batteryW = 0;
  }

  const batteryA =
    netCurrent ?? (chargeA != null || dischargeA != null ? (chargeA ?? 0) - (dischargeA ?? 0) : null);

  return {
    pvW,
    loadW: firstNum(map, TITLES.load) ?? 0,
    batteryW,
    batterySoc: firstNum(map, TITLES.batterySoc) ?? 0,
    batteryV: batteryV,
    batteryA,
    gridW: firstNum(map, TITLES.grid),
    gridV: firstNum(map, TITLES.gridVoltage),
    inverterTempC: firstNum(map, TITLES.temperature),
    mode: firstStr(map, TITLES.mode),
    pvV: firstNum(map, TITLES.pvVoltage),
    pvA: firstNum(map, TITLES.pvCurrent),
    gridHz: firstNum(map, TITLES.gridFrequency),
    outputV: firstNum(map, TITLES.outputVoltage),
    outputHz: firstNum(map, TITLES.outputFrequency),
    loadPct: firstNum(map, TITLES.loadPercent),
  };
}
