'use client';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from './chart-card';
import { RangePicker } from './range-picker';
import { SERIES, chartTick, chartTooltip, tooltipTrigger } from '@/lib/chart-theme';
import { readJson } from '@/lib/client-data';
import type { GridDay } from '@/lib/grid-math';
import { batteryInsightVerdict, fullDays, reserveHits, roundTrip, socBins, type SocDay } from '@/lib/battery-insights';

const SPANS = [
  ['14', '14 days'],
  ['30', '30 days'],
  ['90', '90 days'],
] as const;
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });

/** How the battery is really used: where it sits, how low it goes, how often it gets full, and how much it gives back. */
export function BatteryInsights({
  reserve,
  chargedKwh,
  dischargedKwh,
}: {
  reserve: number;
  chargedKwh: number | null | undefined;
  dischargedKwh: number | null | undefined;
}) {
  const [span, setSpan] = useState<(typeof SPANS)[number][0]>('30'),
    [days, setDays] = useState<SocDay[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    readJson<{ days: SocDay[] }>(`/api/solar/battery-insights?days=${span}`)
      .then((data) => {
        if (active) {
          setDays(data.days);
          setError('');
        }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Battery data is unavailable'));
    return () => {
      active = false;
    };
  }, [span]);
  const list = days ?? [],
    bins = socBins(list),
    hits = reserveHits(list, reserve),
    efficiency = roundTrip(chargedKwh, dischargedKwh),
    range = list.flatMap((d) =>
      d.socMin !== null && d.socMax !== null ? [{ date: d.date, low: d.socMin, high: d.socMax }] : [],
    ),
    items: Array<[string, string]> = [
      ['Days at reserve', String(hits.daysHit)],
      ['Time at reserve', hits.hours < 1 ? `${Math.round(hits.hours * 60)} min` : `${hits.hours.toFixed(1)} h`],
      ['Days reaching full', String(fullDays(list))],
      ['Round-trip efficiency', efficiency === null ? '—' : `${efficiency}%`],
    ];
  if (days !== null && !list.length)
    return (
      <ChartCard
        eyebrow="Battery use"
        title="How the battery is used"
        footnote={error || 'No stored battery days yet. This fills in as collection runs.'}
      >
        <></>
      </ChartCard>
    );
  return (
    <>
      <ChartCard
        eyebrow="Battery use"
        title="How the battery is used"
        verdict={days ? batteryInsightVerdict(list, reserve, hits, Number(span)) : null}
        actions={<RangePicker label="Battery use period" value={span} options={SPANS} onChange={setSpan} />}
        footnote={
          error ||
          'Round-trip efficiency is energy discharged divided by energy charged this year; it needs weeks of data to be meaningful.'
        }
      >
        <div className="headline-numbers">
          {items.map(([label, value]) => (
            <div key={label} data-tone="battery">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </ChartCard>
      <ChartCard
        eyebrow="Charge levels"
        title="Where the battery spends its time"
        footnote={`Hours at each charge level. Bars at or under the ${reserve}% reserve are highlighted.`}
      >
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ left: 0, right: 12, top: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis dataKey="label" tick={chartTick} interval={0} fontSize={11} />
              <YAxis unit=" h" width={52} tick={chartTick} />
              <Tooltip
                trigger={tooltipTrigger()}
                formatter={(n) => `${Number(n).toFixed(1)} h`}
                contentStyle={chartTooltip}
              />
              <Bar dataKey="hours" name="Time" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {bins.map((b) => (
                  <Cell key={b.label} fill={b.from <= reserve ? 'var(--status-warn)' : SERIES.charge} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard
        eyebrow="Daily range"
        title="Lowest and highest charge each day"
        footnote="The dashed line is the reserve. Days where the low touches it are the days the battery ran out of room."
      >
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={range} margin={{ left: 0, right: 12, top: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={24} tick={chartTick} />
              <YAxis unit="%" width={46} domain={[0, 100]} tick={chartTick} />
              <ReferenceLine y={reserve} stroke="var(--status-warn)" strokeDasharray="6 6" />
              <Tooltip
                trigger={tooltipTrigger()}
                labelFormatter={(d) => dateLabel(String(d))}
                formatter={(n) => `${Math.round(Number(n))}%`}
                contentStyle={chartTooltip}
              />
              <Line
                name="Highest"
                dataKey="high"
                stroke={SERIES.charge}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                name="Lowest"
                dataKey="low"
                stroke={SERIES.discharge}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </>
  );
}

/** How hard the inverter works: peak load, time above 80% load and how hot it runs. */
export function InverterStrain() {
  const [days, setDays] = useState<GridDay[] | null>(null);
  useEffect(() => {
    let active = true;
    readJson<{ days: GridDay[] }>('/api/solar/grid?days=30')
      .then((data) => active && setDays(data.days))
      .catch(() => active && setDays([]));
    return () => {
      active = false;
    };
  }, []);
  const rows = (days ?? []).flatMap((d) => (d.inverter ? [{ date: d.date, ...d.inverter }] : []));
  if (!rows.length) return null;
  const peak = Math.max(0, ...rows.map((r) => r.peakLoadPct ?? 0)),
    hours = rows.reduce((n, r) => n + r.hoursAbove80, 0),
    temps = rows.flatMap((r) => (r.maxTempC === null ? [] : [r.maxTempC])),
    hottest = temps.length ? Math.max(...temps) : null,
    chart = rows.map((r) => ({ date: r.date, load: r.peakLoadPct, temp: r.maxTempC }));
  return (
    <ChartCard
      eyebrow="Inverter"
      title="Load and temperature"
      verdict={
        hours >= 1
          ? `The inverter ran above 80% load for ${hours.toFixed(1)} hours in the last ${rows.length} days (peak ${Math.round(peak)}%). Sustained high load is a reason to move heavy appliances to sunny hours.`
          : `The inverter stayed comfortably loaded: peak ${Math.round(peak)}% over the last ${rows.length} days${hottest === null ? '' : `, hottest ${Math.round(hottest)}°C`}.`
      }
      footnote="Peak load and temperature each day, from the inverter's own readings."
    >
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ left: 0, right: 12, top: 12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
            <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={24} tick={chartTick} />
            <YAxis yAxisId="l" unit="%" width={46} domain={[0, 100]} tick={chartTick} />
            <YAxis yAxisId="t" orientation="right" unit="°" width={44} tick={chartTick} />
            <ReferenceLine yAxisId="l" y={80} stroke="var(--status-warn)" strokeDasharray="6 6" />
            <Tooltip
              trigger={tooltipTrigger()}
              labelFormatter={(d) => dateLabel(String(d))}
              formatter={(n, name) =>
                name === 'Temperature' ? `${Math.round(Number(n))}°C` : `${Math.round(Number(n))}%`
              }
              contentStyle={chartTooltip}
            />
            <Line
              yAxisId="l"
              name="Peak load"
              dataKey="load"
              stroke={SERIES.home}
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="t"
              name="Temperature"
              dataKey="temp"
              stroke={SERIES.discharge}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
