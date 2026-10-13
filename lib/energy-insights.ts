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

export type TypicalHour = { hour: number; homeW: number | null; solarW: number | null };
export type TonightForecast = {
  needKwh: number;
  usableKwh: number;
  /** Clock hour (0-24, fractional) when the battery reaches reserve, or null when it lasts. */
  runsOutAt: number | null;
  /** Clock hour when typical solar covers the home again. */
  solarBackAt: number;
};

/**
 * Will the battery last until solar returns? Uses the user's own typical day (average home and solar power per hour):
 * skip any hours where solar already covers the home, then add up the shortfall until solar covers it again.
 */
export function batteryTonight(input: {
  soc: number;
  capacityKwh: number;
  reservePct: number;
  nowHour: number;
  typical: TypicalHour[];
}): TonightForecast | null {
  const { soc, capacityKwh, reservePct, nowHour, typical } = input;
  const byHour = new Map(typical.map((t) => [t.hour, t]));
  if (byHour.size < 20) return null;
  const usableKwh = Math.max(0, (capacityKwh * (soc - reservePct)) / 100);
  const deficit = (hour: number) => {
    const t = byHour.get(((hour % 24) + 24) % 24);
    return t && t.homeW !== null ? Math.max(0, t.homeW - (t.solarW ?? 0)) / 1000 : null;
  };
  let need = 0,
    runsOutAt: number | null = null,
    started = false;
  for (let step = 0; step <= 48; step++) {
    const hour = Math.floor(nowHour) + step,
      span = step === 0 ? Math.floor(nowHour) + 1 - nowHour : 1,
      d = deficit(hour);
    if (d === null) return null;
    if (d === 0) {
      if (started)
        return { needKwh: need, usableKwh, runsOutAt, solarBackAt: (hour + (step === 0 ? 1 - span : 0)) % 24 };
      continue;
    }
    started = true;
    const used = d * span;
    if (runsOutAt === null && need + used > usableKwh)
      runsOutAt = (hour + (step === 0 ? nowHour - Math.floor(nowHour) : 0) + (usableKwh - need) / d) % 24;
    need += used;
  }
  return null;
}

const clock = (hour: number) => {
  const h = Math.floor(hour) % 24,
    m = Math.round((hour - Math.floor(hour)) * 60);
  return `${String(m === 60 ? (h + 1) % 24 : h).padStart(2, '0')}:${String(m === 60 ? 0 : m).padStart(2, '0')}`;
};

export function tonightVerdict(f: TonightForecast | null) {
  if (!f) return 'Needs a few days of stored readings to estimate tonight.';
  const back = clock(f.solarBackAt);
  return f.runsOutAt === null
    ? `Tonight needs about ${kwh(f.needKwh)} kWh at your typical use until solar returns near ${back}. You have ${kwh(f.usableKwh)} kWh above reserve, so ${kwh(f.usableKwh - f.needKwh)} kWh to spare.`
    : `At your typical use the battery reaches reserve around ${clock(f.runsOutAt)}, before solar returns near ${back}. Tonight needs about ${kwh(f.needKwh)} kWh; ${kwh(f.usableKwh)} kWh is above reserve.`;
}
