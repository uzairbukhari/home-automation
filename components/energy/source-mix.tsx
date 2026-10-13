'use client';
import { useEffect, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from './chart-card';
import { stampLabel, useHistory, withGaps } from './history';
import { useUrlState } from '@/hooks/use-app-navigation';
import { readJson } from '@/lib/client-data';
import { chartTick, chartTooltip, SERIES, tooltipTrigger } from '@/lib/chart-theme';
import { localDate } from '@/lib/measurements';
import { mixEnergy, mixVerdict, sourceMix } from '@/lib/source-mix';
import type { DessSnapshot } from '@/lib/providers/dessmonitor';
import type { TimelineEvent } from '@/lib/events-timeline';

const NAMES: Record<string, string> = {
  solarHome: 'Solar',
  batteryHome: 'Battery',
  gridHome: 'Grid',
  soc: 'Battery charge',
};

/** Which source fed the home through the day, with the battery's charge level and any alarms marked. */
export function SourceMix({ live }: { live: DessSnapshot | null }) {
  const [date] = useUrlState('date', localDate()),
    today = localDate(),
    past = date < today,
    lastDay = live ? localDate(Date.parse(live.updatedAt)) : '',
    dayEmpty = !past && Boolean(live) && !live?.series?.length,
    history = useHistory('custom', past ? date : lastDay, past ? date : lastDay, past || dayEmpty),
    useLive = !past && !dayEmpty,
    points = useLive ? (live?.series ?? []) : (history.data?.series ?? []),
    [events, setEvents] = useState<TimelineEvent[]>([]);
  useEffect(() => {
    let active = true;
    readJson<{ events: TimelineEvent[] }>('/api/events?days=7')
      .then((data) => active && setEvents(data.events))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const shown = past ? date : dayEmpty ? lastDay : today,
    mix = sourceMix(withGaps(points)),
    verdict = mixVerdict(mixEnergy(mix)),
    marks = events.filter((e) => e.kind !== 'online' && localDate(e.time) === shown),
    loading = !useLive && history.loading && !mix.length;
  return (
    <ChartCard
      eyebrow="Where the power came from"
      title="Sources feeding the home"
      verdict={verdict}
      footnote={
        history.error ||
        `Stacked power from solar, battery and grid, from 5-minute readings. Line: battery charge.${marks.length ? ' Dashed marks: alarms or devices going offline.' : ''}`
      }
    >
      {loading && <div className="chart-empty">Loading recorded readings…</div>}
      {!loading && !mix.length && <div className="chart-empty">No recorded readings for this day.</div>}
      {Boolean(mix.length) && (
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mix} margin={{ left: 0, right: 8, top: 20 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis
                dataKey="stamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(n) => stampLabel(n, true)}
                tick={chartTick}
              />
              <YAxis yAxisId="w" tickFormatter={(n) => String(n / 1000)} unit=" kW" tick={chartTick} />
              <YAxis yAxisId="soc" orientation="right" domain={[0, 100]} unit="%" tick={chartTick} width={44} />
              <Tooltip
                trigger={tooltipTrigger()}
                labelFormatter={(n) => stampLabel(Number(n))}
                formatter={(n, name) =>
                  name === 'soc' ? `${Number(n).toFixed(0)}%` : `${(Number(n) / 1000).toFixed(2)} kW`
                }
                contentStyle={chartTooltip}
              />
              <Area
                yAxisId="w"
                stackId="home"
                name={NAMES.solarHome}
                dataKey="solarHome"
                type="linear"
                stroke={SERIES.solar}
                fill={SERIES.solar}
                fillOpacity={0.35}
                strokeWidth={1.5}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                yAxisId="w"
                stackId="home"
                name={NAMES.batteryHome}
                dataKey="batteryHome"
                type="linear"
                stroke={SERIES.discharge}
                fill={SERIES.discharge}
                fillOpacity={0.35}
                strokeWidth={1.5}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                yAxisId="w"
                stackId="home"
                name={NAMES.gridHome}
                dataKey="gridHome"
                type="linear"
                stroke={SERIES.grid}
                fill={SERIES.grid}
                fillOpacity={0.35}
                strokeWidth={1.5}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="soc"
                name={NAMES.soc}
                dataKey="soc"
                type="linear"
                stroke={SERIES.charge}
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {marks.map((e) => (
                <ReferenceLine
                  key={e.time + e.title}
                  yAxisId="w"
                  x={Date.parse(e.time)}
                  stroke="var(--status-warn)"
                  strokeDasharray="3 3"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="series-controls" aria-label="Legend">
        {[
          ['Solar', SERIES.solar],
          ['Battery', SERIES.discharge],
          ['Grid', SERIES.grid],
          ['Battery charge', SERIES.charge],
        ].map(([label, color]) => (
          <span key={label}>
            <span style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}
