// Plain-English sentences for the top of each Energy tab, computed only from the user's own numbers.
const kwh = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Share of home use that did not come from the grid, 0 to 100, or null when it cannot be known. */
export function selfSufficiency(homeKwh: number | null | undefined, gridKwh: number | null | undefined) {
  if (homeKwh == null || gridKwh == null || homeKwh <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - gridKwh / homeKwh) * 100)));
}

export function todayVerdict(
  t: { homeKwh: number | null; gridKwh: number | null; solarKwh: number | null } | null | undefined,
) {
  const share = selfSufficiency(t?.homeKwh, t?.gridKwh);
  if (!t || share === null || (t.homeKwh ?? 0) < 0.2) return 'Not enough readings yet today to summarise.';
  const grid = t.gridKwh ?? 0;
  const solar = t.solarKwh != null ? ` Solar made ${kwh(t.solarKwh)} kWh.` : '';
  return grid < 0.05
    ? `No grid power used today: solar and battery covered all of the ${kwh(t.homeKwh!)} kWh the home used.${solar}`
    : `Solar and battery covered ${share}% of today's use; ${kwh(grid)} kWh came from the grid.${solar}`;
}

type Bucket = { date: string; solar: number | null };

/** Total, daily average and best bucket for a bar chart of solar energy. */
export function solarBucketVerdict(buckets: Bucket[], unit: 'day' | 'month' | 'year', label: (date: string) => string) {
  const present = buckets.filter((b): b is { date: string; solar: number } => b.solar !== null && b.solar > 0);
  if (!present.length) return null;
  const total = present.reduce((n, b) => n + b.solar, 0);
  const best = present.reduce((a, b) => (b.solar > a.solar ? b : a));
  const average = total / present.length;
  return `Solar made ${kwh(total)} kWh over ${present.length} ${unit}${present.length === 1 ? '' : 's'}, about ${kwh(average)} kWh a ${unit}. Best ${unit}: ${label(best.date)} with ${kwh(best.solar)} kWh.`;
}
