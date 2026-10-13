/** A reading below this is the grid being off: the inverter reports ~0 V when mains power is lost. */
export const OUTAGE_BELOW_V = 100;
/** Readings further apart than this are not joined into one continuous stretch. */
const GAP_MS = 15 * 60_000;
/** An isolated reading stands for one normal logging interval. */
const NOMINAL_MS = 5 * 60_000;
export const VOLTAGE_BANDS = [
  ['critical', 'Under 180 V'],
  ['low', '180 to 198 V'],
  ['normal', '198 to 242 V'],
  ['high', 'Over 242 V'],
] as const;
export type VoltageBand = (typeof VOLTAGE_BANDS)[number][0];

export type GridPoint = { stamp: number; voltage: number | null; frequency: number | null; homeW: number | null };
export type Outage = { start: string; end: string; minutes: number; homeKwh: number | null };
export type GridDay = {
  date: string;
  samples: number;
  coveredHours: number;
  downMinutes: number;
  outages: Outage[];
  carriedKwh: number | null;
  voltage: { min: number; max: number; avg: number } | null;
  frequency: { min: number; max: number } | null;
  bandHours: Record<VoltageBand, number>;
};

export const voltageBand = (v: number): VoltageBand =>
  v < 180 ? 'critical' : v < 198 ? 'low' : v <= 242 ? 'normal' : 'high';

/** Turns one day of inverter readings into outages, voltage health and the energy the battery carried through outages. */
export function summarizeGrid(points: GridPoint[], date: string): GridDay {
  const start = Date.parse(`${date}T00:00:00+05:00`),
    end = start + 86_400_000,
    sorted = points.filter((p) => p.stamp >= start && p.stamp < end).sort((a, b) => a.stamp - b.stamp),
    day: GridDay = {
      date,
      samples: sorted.length,
      coveredHours: 0,
      downMinutes: 0,
      outages: [],
      carriedKwh: null,
      voltage: null,
      frequency: null,
      bandHours: { critical: 0, low: 0, normal: 0, high: 0 },
    };
  let open: { start: number; end: number; homeKwh: number | null } | null = null,
    weighted = 0,
    weight = 0;
  const close = () => {
    if (!open) return;
    const minutes = Math.round((open.end - open.start) / 60_000);
    day.outages.push({
      start: new Date(open.start).toISOString(),
      end: new Date(open.end).toISOString(),
      minutes,
      homeKwh: open.homeKwh,
    });
    day.downMinutes += minutes;
    if (open.homeKwh !== null) day.carriedKwh = (day.carriedKwh ?? 0) + open.homeKwh;
    open = null;
  };
  sorted.forEach((p, i) => {
    const next = sorted[i + 1],
      length = next && next.stamp - p.stamp <= GAP_MS ? next.stamp - p.stamp : NOMINAL_MS,
      until = Math.min(end, p.stamp + length),
      hours = (until - p.stamp) / 3_600_000;
    if (p.frequency !== null && p.frequency > 0) {
      day.frequency = day.frequency
        ? { min: Math.min(day.frequency.min, p.frequency), max: Math.max(day.frequency.max, p.frequency) }
        : { min: p.frequency, max: p.frequency };
    }
    if (p.voltage === null) {
      close();
      return;
    }
    day.coveredHours += hours;
    if (p.voltage < OUTAGE_BELOW_V) {
      const kwh = p.homeW === null ? null : (p.homeW * hours) / 1000;
      if (open && p.stamp <= open.end + GAP_MS) {
        open.end = until;
        if (kwh !== null) open.homeKwh = (open.homeKwh ?? 0) + kwh;
      } else {
        close();
        open = { start: p.stamp, end: until, homeKwh: kwh };
      }
      return;
    }
    close();
    day.bandHours[voltageBand(p.voltage)] += hours;
    day.voltage = day.voltage
      ? { ...day.voltage, min: Math.min(day.voltage.min, p.voltage), max: Math.max(day.voltage.max, p.voltage) }
      : { min: p.voltage, max: p.voltage, avg: p.voltage };
    weighted += p.voltage * hours;
    weight += hours;
  });
  close();
  if (day.voltage && weight > 0) day.voltage.avg = weighted / weight;
  return day;
}

export type GridTotals = {
  outages: number;
  downHours: number;
  daysWithOutage: number;
  longest: Outage | null;
  carriedKwh: number | null;
  avgVoltage: number | null;
  lowestVoltage: number | null;
  outOfBandHours: number;
  coveredDays: number;
};

export function gridTotals(days: GridDay[]): GridTotals {
  const outages = days.flatMap((d) => d.outages),
    volts = days.filter((d) => d.voltage),
    weight = volts.reduce((n, d) => n + Math.max(d.coveredHours - d.downMinutes / 60, 0.01), 0);
  return {
    outages: outages.length,
    downHours: days.reduce((n, d) => n + d.downMinutes, 0) / 60,
    daysWithOutage: days.filter((d) => d.outages.length).length,
    longest: outages.reduce<Outage | null>((best, o) => (!best || o.minutes > best.minutes ? o : best), null),
    carriedKwh: days.some((d) => d.carriedKwh !== null) ? days.reduce((n, d) => n + (d.carriedKwh ?? 0), 0) : null,
    avgVoltage: volts.length
      ? volts.reduce((n, d) => n + d.voltage!.avg * Math.max(d.coveredHours - d.downMinutes / 60, 0.01), 0) / weight
      : null,
    lowestVoltage: volts.length ? Math.min(...volts.map((d) => d.voltage!.min)) : null,
    outOfBandHours: days.reduce((n, d) => n + d.bandHours.critical + d.bandHours.low + d.bandHours.high, 0),
    coveredDays: days.length,
  };
}

const hoursText = (h: number) => (h < 1 ? `${Math.round(h * 60)} minutes` : `${h.toFixed(1)} hours`);

/** One plain sentence about how steady the grid has been. */
export function gridVerdict(totals: GridTotals, spanDays: number) {
  if (!totals.coveredDays) return null;
  if (!totals.outages) {
    return `No power cuts recorded in the last ${spanDays} days${totals.outOfBandHours >= 1 ? `, but voltage was outside the safe band for ${hoursText(totals.outOfBandHours)}` : ', and voltage stayed in the safe band'}.`;
  }
  const carried =
    totals.carriedKwh === null
      ? ''
      : ` The battery and solar carried the house for ${totals.carriedKwh.toFixed(1)} kWh of that.`;
  return `${totals.outages} power ${totals.outages === 1 ? 'cut' : 'cuts'} in ${spanDays} days, ${hoursText(totals.downHours)} without grid power.${carried}`;
}
