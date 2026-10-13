export type SocDay = { date: string; socMin: number | null; socMax: number | null; socHours: number[] | null };
export type SocBin = { label: string; from: number; hours: number };

/** Hours spent at each charge level, grouped into ten-point bands (0 to 9, 10 to 19, ... 90 to 100). */
export function socBins(days: SocDay[]): SocBin[] {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? '90-100%' : `${i * 10}-${i * 10 + 9}%`,
    from: i * 10,
    hours: 0,
  }));
  for (const day of days)
    day.socHours?.forEach((hours, level) => {
      if (hours > 0) bins[Math.min(9, Math.floor(level / 10))].hours += hours;
    });
  return bins;
}

/** Hours at or below the reserve level, and the number of days the battery got that low. */
export function reserveHits(days: SocDay[], reserve: number) {
  let hours = 0,
    daysHit = 0;
  for (const day of days) {
    const below = (day.socHours ?? []).reduce((n, h, level) => (level <= reserve ? n + h : n), 0);
    hours += below;
    if (below >= 0.25 || (day.socMin !== null && day.socMin <= reserve)) daysHit++;
  }
  return { hours, daysHit };
}

/** Days that got to a full battery (99% or more). */
export const fullDays = (days: SocDay[]) => days.filter((d) => d.socMax !== null && d.socMax >= 99).length;

/** Discharged energy as a share of charged energy; only meaningful over weeks, when the net change in stored energy is small. */
export function roundTrip(chargedKwh: number | null | undefined, dischargedKwh: number | null | undefined) {
  if (!chargedKwh || chargedKwh < 10 || dischargedKwh == null || dischargedKwh <= 0) return null;
  const pct = (dischargedKwh / chargedKwh) * 100;
  return pct > 40 && pct <= 105 ? Math.round(pct) : null;
}

const hoursText = (h: number) => (h < 1 ? `${Math.round(h * 60)} minutes` : `${h.toFixed(h < 10 ? 1 : 0)} hours`);

export function batteryInsightVerdict(
  days: SocDay[],
  reserve: number,
  hits: { hours: number; daysHit: number },
  spanDays: number,
) {
  if (!days.length) return null;
  const full = fullDays(days);
  if (!hits.daysHit)
    return `The battery never fell to the ${reserve}% reserve in the last ${spanDays} days, and reached full on ${full} of ${days.length} days.`;
  return `The battery fell to the ${reserve}% reserve on ${hits.daysHit} of ${days.length} days, ${hoursText(hits.hours)} in total, and reached full on ${full}.`;
}
