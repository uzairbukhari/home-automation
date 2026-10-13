import { ChartCard } from './chart-card';
import { SERIES } from '@/lib/chart-theme';
import { bestWorstDays } from '@/lib/trends';

const kwh = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const label = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });

function Column({ title, days, top }: { title: string; days: Array<{ date: string; solar: number }>; top: number }) {
  return (
    <div className="day-rank">
      <h3>{title}</h3>
      <ol>
        {days.map((d) => (
          <li key={d.date}>
            <span>{label(d.date)}</span>
            <span className="rank-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(4, (d.solar / top) * 100)}%`, background: SERIES.solar }} />
            </span>
            <strong>{kwh(d.solar)} kWh</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The strongest and weakest solar days of the selected year, so a bad day can be put in context. */
export function BestWorstDays({
  buckets,
  today,
  year,
}: {
  buckets: Array<{ date: string; solar: number | null; grid: number | null; home: number | null }>;
  today: string;
  year: string;
}) {
  const { best, worst } = bestWorstDays(buckets, today, 3),
    top = best[0]?.solar ?? 1;
  return (
    <ChartCard
      eyebrow="Best and weakest days"
      title={`Solar highs and lows · ${year}`}
      footnote="Solar energy per day from the inverter's daily totals. Today is left out until it ends."
    >
      {!best.length ? (
        <div className="chart-empty">No full solar days recorded for {year} yet.</div>
      ) : (
        <div className="day-ranks">
          <Column title="Best days" days={best as Array<{ date: string; solar: number }>} top={top} />
          {worst.length > 0 && (
            <Column title="Weakest days" days={worst as Array<{ date: string; solar: number }>} top={top} />
          )}
        </div>
      )}
    </ChartCard>
  );
}
