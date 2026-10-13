import { ChartCard } from './chart-card';
import { moneySplit } from '@/lib/costs';

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;

/** Where the money goes: monitored appliances by estimated cost, with the unmonitored remainder shown honestly. */
export function MoneySplit({
  devices,
  unmonitoredKwh,
  periodLabel,
}: {
  devices: Parameters<typeof moneySplit>[0];
  unmonitoredKwh: number | null | undefined;
  periodLabel: string;
}) {
  const { rows, total } = moneySplit(devices, unmonitoredKwh);
  if (!rows.length) return null;
  const top = rows.find((r) => !r.unmonitored),
    unmonitored = rows.find((r) => r.unmonitored);
  return (
    <ChartCard
      eyebrow="Where your money goes"
      title="Appliances ranked by cost"
      verdict={
        top
          ? `${top.name} is the biggest monitored cost ${periodLabel}: about ${rs(top.cost)}, ${Math.round(top.share * 100)}% of the estimated total.${unmonitored ? ` ${Math.round(unmonitored.share * 100)}% of the cost is in things that are not monitored.` : ''}`
          : null
      }
      footnote="Estimated from each appliance's measured energy at the average rate for this period. The unmonitored share is home use minus what the monitored appliances measured."
    >
      <ul className="money-split">
        {rows.map((r) => (
          <li key={r.id} data-unmonitored={r.unmonitored ? 'true' : undefined}>
            <div>
              <strong>{r.name}</strong>
              <span>
                {rs(r.cost)} · {r.kwh.toFixed(1)} kWh · {Math.round(r.share * 100)}%
              </span>
            </div>
            <div className="rank-bar" role="presentation">
              <i
                style={{
                  width: `${Math.max(2, r.share * 100)}%`,
                  background: r.unmonitored ? 'var(--muted-foreground)' : 'var(--flow-home)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="report-footnote">Total estimated: {rs(total)}</p>
    </ChartCard>
  );
}
