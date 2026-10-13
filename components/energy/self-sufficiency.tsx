import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from './chart-card';
import { SERIES, chartTick, chartTooltip, tooltipTrigger } from '@/lib/chart-theme';
import { selfSufficiencySeries } from '@/lib/trends';

const label = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });

/** How much of each day's home use did not come from the grid. */
export function SelfSufficiencyTrend({
  buckets,
}: {
  buckets: Array<{ date: string; solar: number | null; grid: number | null; home: number | null }>;
}) {
  const series = selfSufficiencySeries(buckets, 30),
    average = series.length ? Math.round(series.reduce((n, p) => n + p.pct, 0) / series.length) : null;
  return (
    <ChartCard
      eyebrow="Self-sufficiency"
      title="Days without the grid"
      verdict={
        average === null
          ? null
          : `Over the last ${series.length} days with data, ${average}% of your use on average did not come from the grid.`
      }
      footnote="Share of each day's home energy not imported from the grid. Home and grid energy are estimated from the inverter's readings."
    >
      {!series.length ? (
        <div className="chart-empty">No days with both home and grid energy recorded yet.</div>
      ) : (
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ left: 0, right: 18, top: 20 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis dataKey="date" tickFormatter={label} tick={chartTick} minTickGap={32} />
              <YAxis domain={[0, 100]} unit="%" tick={chartTick} />
              <Tooltip
                trigger={tooltipTrigger()}
                labelFormatter={(d) => label(String(d))}
                formatter={(n) => `${n}%`}
                contentStyle={chartTooltip}
              />
              {average !== null && <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
              <Line
                name="Self-sufficiency"
                dataKey="pct"
                stroke={SERIES.charge}
                strokeWidth={2.5}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
