'use client';
import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from './chart-card';
import { SERIES, chartTick, chartTooltip, tooltipTrigger } from '@/lib/chart-theme';
import { readJson } from '@/lib/client-data';
import { localDate } from '@/lib/measurements';
import {
  ARRAY_KW,
  SITE,
  baseload,
  billForecast,
  billVerdict,
  yieldSeries,
  yieldVerdict,
  type YieldPoint,
} from '@/lib/costs';
import type { HeatmapDay } from '@/lib/trends';

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });

/** Where this cycle's grid units are heading, and how close that is to the next, dearer slab. */
export function BillOutlook({ gridKwh, from }: { gridKwh: number | null | undefined; from?: string }) {
  const forecast = billForecast(gridKwh ?? null, from ?? '', localDate());
  if (!forecast) return null;
  const items: Array<[string, string]> = [
    ['Units so far', forecast.usedKwh.toFixed(0)],
    ['Projected for the cycle', forecast.projectedKwh.toFixed(0)],
    ['Slab rate', `Rs ${forecast.rate.toFixed(2)}/unit`],
    ['Energy charge, projected', rs(forecast.energyCost)],
  ];
  return (
    <ChartCard
      eyebrow="Bill outlook"
      title="This cycle’s units and slab"
      verdict={billVerdict(forecast)}
      footnote={`Day ${forecast.elapsedDays} of ${forecast.cycleDays}. Projection uses the pace so far and IESCO unprotected slabs; taxes, fixed fees and adjustments are not included.`}
    >
      <div className="headline-numbers">
        {items.map(([label, value]) => (
          <div key={label} data-tone={forecast.crossesNext && label === 'Slab rate' ? 'grid' : 'saving'}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/** The house's always-on floor: what it draws in its quietest hours, and what that costs over a month. */
export function Baseload({ rate }: { rate: number }) {
  const [days, setDays] = useState<HeatmapDay[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    readJson<{ days: HeatmapDay[] }>('/api/solar/heatmap?days=30')
      .then((data) => active && setDays(data.days))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Hourly data is unavailable'));
    return () => {
      active = false;
    };
  }, []);
  const floor = days ? baseload(days) : null;
  if (days && !floor) return null;
  return (
    <ChartCard
      eyebrow="Always-on load"
      title="What the house draws all the time"
      verdict={
        floor
          ? `Even in its quietest hours the house draws about ${Math.round(floor.watts)} W, around ${Math.round(floor.kwhPerMonth)} units a month, roughly ${rs(floor.kwhPerMonth * rate)} at the current slab.`
          : null
      }
      footnote={
        error ||
        'Lower quartile of hourly average home power over the last 30 days. Fridges, routers, standby and inverter losses all live here.'
      }
    >
      <></>
    </ChartCard>
  );
}

type Weather = Record<string, { cloud: number | null }>;

/** Solar energy per kW of array each day, next to how cloudy it was. */
export function SolarYield({ buckets }: { buckets: Array<{ date: string; solar: number | null }> }) {
  const today = localDate(),
    points = yieldSeries(buckets, today),
    [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${SITE.latitude}&longitude=${SITE.longitude}&past_days=60&forecast_days=1&daily=cloud_cover_mean&timezone=Asia%2FKarachi`;
    fetch(url, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ daily?: { time: string[]; cloud_cover_mean: Array<number | null> } }>)
      .then((data) => {
        if (!data.daily) return;
        setWeather(Object.fromEntries(data.daily.time.map((t, i) => [t, { cloud: data.daily!.cloud_cover_mean[i] }])));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const chart = points.map((p: YieldPoint) => ({ ...p, cloud: weather?.[p.date]?.cloud ?? null }));
  return (
    <ChartCard
      eyebrow="Solar yield"
      title="Energy per kW of panels"
      verdict={yieldVerdict(points)}
      footnote={`Daily solar energy divided by the ${ARRAY_KW} kW array. The line is average cloud cover from Open-Meteo for a nearby point, so dips that follow cloud are weather, and dips on clear days are worth a look.`}
    >
      {!points.length ? (
        <div className="chart-empty">No solar days recorded in the last 60 days.</div>
      ) : (
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ left: 0, right: 12, top: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={24} tick={chartTick} />
              <YAxis yAxisId="y" unit=" kWh" width={64} tick={chartTick} />
              <YAxis yAxisId="c" orientation="right" unit="%" width={44} domain={[0, 100]} tick={chartTick} />
              <Tooltip
                trigger={tooltipTrigger()}
                labelFormatter={(d) => dateLabel(String(d))}
                formatter={(n, name) => (name === 'Cloud cover' ? `${Math.round(Number(n))}%` : `${n} kWh per kW`)}
                contentStyle={chartTooltip}
              />
              <Bar
                yAxisId="y"
                name="Yield"
                dataKey="kwhPerKw"
                fill={SERIES.solar}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="c"
                name="Cloud cover"
                dataKey="cloud"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
