import { iescoTariff, unprotectedRate } from './tariff';
import { shiftDate } from './measurements';

/** Rated size of the solar array in kW (the owner's answer, 2026-10-13). */
export const ARRAY_KW = 3.6;
/** Where the house is, for weather only: Islamabad, in the IESCO supply area. Approximate on purpose. */
export const SITE = { latitude: 33.68, longitude: 73.05 };

const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

export type BillForecast = {
  elapsedDays: number;
  cycleDays: number;
  usedKwh: number;
  projectedKwh: number;
  rate: number;
  energyCost: number;
  slabMax: number | null;
  nextRate: number | null;
  unitsToNext: number | null;
  crossesNext: boolean;
};

/** Projects this cycle's grid units from the pace so far and says where that lands on the IESCO slabs. */
/** The last day of a billing cycle that starts on `from` (billing days are 1 to 28, so the next month always has that day). */
export function cycleEnd(from: string) {
  const year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7)),
    next =
      month === 12
        ? `${year + 1}-01-${from.slice(8)}`
        : `${year}-${String(month + 1).padStart(2, '0')}-${from.slice(8)}`;
  return shiftDate(next, -1);
}

export function billForecast(gridKwh: number | null, from: string, today: string): BillForecast | null {
  if (gridKwh === null || !from) return null;
  const cycleDays = dayCount(from, cycleEnd(from)),
    elapsedDays = Math.min(cycleDays, Math.max(1, dayCount(from, today)));
  if (cycleDays < 1) return null;
  const projectedKwh = (gridKwh / elapsedDays) * cycleDays,
    rate = unprotectedRate(projectedKwh),
    slabIndex = iescoTariff.slabs.findIndex((s) => projectedKwh <= s.max),
    slab = iescoTariff.slabs[slabIndex],
    next = iescoTariff.slabs[slabIndex + 1],
    slabMax = slab && Number.isFinite(slab.max) ? slab.max : null;
  return {
    elapsedDays,
    cycleDays,
    usedKwh: gridKwh,
    projectedKwh,
    rate,
    energyCost: projectedKwh * rate,
    slabMax,
    nextRate: next?.rate ?? null,
    unitsToNext: slabMax === null ? null : Math.max(0, slabMax - projectedKwh),
    // The slab is chosen by total units, so crossing a limit raises the rate on every unit, not just the extra ones.
    crossesNext: slabMax !== null && slabMax - projectedKwh < 15,
  };
}

export function billVerdict(f: BillForecast | null) {
  if (!f) return null;
  const pace = `On this pace you will import about ${Math.round(f.projectedKwh)} units this cycle, an energy charge near Rs ${Math.round(f.energyCost).toLocaleString('en-PK')} before taxes.`;
  if (f.slabMax === null) return `${pace} You are in the top slab.`;
  return f.crossesNext
    ? `${pace} Only ${Math.max(0, Math.round(f.unitsToNext!))} units from the ${f.slabMax}-unit limit: crossing it raises the rate on every unit from Rs ${f.rate.toFixed(2)} to Rs ${f.nextRate?.toFixed(2)}.`
    : `${pace} That is ${Math.round(f.unitsToNext!)} units under the ${f.slabMax}-unit slab limit.`;
}

/** The lowest steady load of the house: the lower quartile of hourly average home power across days. */
export function baseload(days: Array<{ home: Array<number | null> }>) {
  const values = days.flatMap((d) => d.home.filter((v): v is number => v !== null && v > 0)).sort((a, b) => a - b);
  if (values.length < 24) return null;
  const watts = values[Math.floor(values.length * 0.25)];
  return { watts, kwhPerMonth: (watts * 24 * 30) / 1000 };
}

export type YieldPoint = { date: string; kwhPerKw: number; kwh: number };

/** Daily solar energy per kW of array: the fair way to compare a cloudy week with a clear one, or this year with next. */
export function yieldSeries(
  buckets: Array<{ date: string; solar: number | null }>,
  today: string,
  days = 60,
  kw = ARRAY_KW,
): YieldPoint[] {
  const from = shiftDate(today, -(days - 1));
  return buckets
    .filter((b) => b.date >= from && b.date <= today && b.solar !== null && b.solar > 0)
    .map((b) => ({ date: b.date, kwh: b.solar!, kwhPerKw: Number((b.solar! / kw).toFixed(2)) }));
}

export function yieldVerdict(points: YieldPoint[]) {
  if (points.length < 3) return null;
  const average = points.reduce((n, p) => n + p.kwhPerKw, 0) / points.length,
    best = points.reduce((a, b) => (b.kwhPerKw > a.kwhPerKw ? b : a));
  return `The array averaged ${average.toFixed(1)} kWh per kW per day over ${points.length} days, best ${best.kwhPerKw.toFixed(1)} on ${new Date(`${best.date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}.`;
}
