import { database } from './jobs';
import { localDate, shiftDate } from './measurements';
import { energyReport } from './solar-energy';
import { storedSamples } from './solar-store';

export type AccuracyDay = { date: string; providerKwh: number; integratedKwh: number; errorPct: number; coveredHours: number };

/**
 * How far integrating the stored five-minute power samples misses the provider's own daily solar total.
 * The same integration produces the home, grid and battery estimates, so this is the honest error bar to print next to them.
 */
export async function energyAccuracy(entityId: string, days = 30) {
  const to = shiftDate(localDate(), -1), from = shiftDate(to, -(days - 1));
  const rows = await database().prepare("SELECT period,solar_kwh FROM solar_energy_periods WHERE entity_id=? AND period_type='day' AND period>=? AND period<=? AND solar_source LIKE 'provider:%' AND solar_kwh>0 ORDER BY period")
    .bind(entityId, from, to).all<{ period: string; solar_kwh: number }>();
  const result: AccuracyDay[] = [];
  for (const row of rows.results) {
    const report = energyReport(await storedSamples(entityId, row.period, row.period));
    if (report.solarIntegratedKwh == null) continue;
    result.push({ date: row.period, providerKwh: row.solar_kwh, integratedKwh: report.solarIntegratedKwh, errorPct: (report.solarIntegratedKwh - row.solar_kwh) / row.solar_kwh * 100, coveredHours: report.coveredHours });
  }
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { from, to, days: result, meanAbsErrorPct: mean(result.map(d => Math.abs(d.errorPct))), biasPct: mean(result.map(d => d.errorPct)) };
}
