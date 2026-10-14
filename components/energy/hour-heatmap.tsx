'use client';
import { useState } from 'react';
import { ChartCard } from './chart-card';
import { RangePicker } from './range-picker';
import { SERIES, heatColor } from '@/lib/chart-theme';
import { useJson } from '@/lib/client-data';
import { peakHour, type HeatmapDay, type HeatmapMetric } from '@/lib/trends';

const METRICS = [
  ['home', 'Home use'],
  ['solar', 'Solar'],
  ['grid', 'Grid'],
] as const;
const SPANS = [
  ['14', '14 days'],
  ['30', '30 days'],
  ['90', '90 days'],
] as const;
const COLORS: Record<HeatmapMetric, string> = { home: SERIES.home, solar: SERIES.solar, grid: SERIES.grid };
const LEFT = 34,
  TOP = 8,
  ROW = 14;
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const kw = (w: number) => (w / 1000).toLocaleString('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });

/** Average power for every hour of every day: when the home uses power, when solar makes it, when the grid is needed. */
export function HourHeatmap() {
  const [metric, setMetric] = useState<HeatmapMetric>('home'),
    [span, setSpan] = useState<(typeof SPANS)[number][0]>('30'),
    { data, error } = useJson<{ days: HeatmapDay[] }>(`/api/solar/heatmap?days=${span}`, 'Hourly data is unavailable'),
    days = data?.days ?? null;
  const list = days ?? [],
    max = Math.max(0, ...list.flatMap((d) => d[metric].map((v) => v ?? 0))),
    cell = Math.max(5, Math.min(24, Math.floor(620 / Math.max(1, list.length)))),
    width = LEFT + list.length * cell,
    peak = peakHour(list, metric),
    verdict = peak
      ? `${METRICS.find((m) => m[0] === metric)![1]} peaks around ${clock(peak.hour)}, averaging ${kw(peak.watts)} kW at that hour.`
      : null;
  return (
    <ChartCard
      eyebrow="Hour by day"
      title="When the power is used and made"
      verdict={verdict}
      actions={
        <>
          <RangePicker label="Heatmap measure" value={metric} options={METRICS} onChange={setMetric} />
          <RangePicker label="Heatmap length" value={span} options={SPANS} onChange={setSpan} />
        </>
      }
      footnote={
        error ||
        'Each column is a day, each row an hour (Asia/Karachi). Darker means more power. Hourly detail is kept for 90 days.'
      }
    >
      {!days && !error && <div className="chart-empty">Loading hourly readings…</div>}
      {days && !list.length && <div className="chart-empty">No hourly readings stored for this period yet.</div>}
      {Boolean(list.length) && (
        <div className="heatmap-scroll">
          <svg
            viewBox={`0 0 ${width} ${TOP + 24 * ROW + 18}`}
            role="img"
            aria-label={`Average ${metric} power by hour for each of the last ${list.length} days`}
            className="heatmap"
            style={{ minWidth: Math.min(width, 640) }}
          >
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
              <text key={h} x={0} y={TOP + h * ROW + 10} className="heat-axis">
                {clock(h)}
              </text>
            ))}
            {list.map((day, col) =>
              day[metric].map((value, hour) => (
                <rect
                  key={day.date + hour}
                  x={LEFT + col * cell}
                  y={TOP + hour * ROW}
                  width={cell - 1}
                  height={ROW - 1}
                  rx={2}
                  style={{ fill: heatColor(value, max, COLORS[metric]) }}
                >
                  <title>{`${dateLabel(day.date)} ${clock(hour)}: ${value === null ? 'no reading' : kw(value) + ' kW'}`}</title>
                </rect>
              )),
            )}
            {[0, list.length - 1].map((i) => (
              <text
                key={i}
                x={LEFT + i * cell + (i ? cell : 0)}
                y={TOP + 24 * ROW + 14}
                textAnchor={i ? 'end' : 'start'}
                className="heat-axis"
              >
                {dateLabel(list[i].date)}
              </text>
            ))}
          </svg>
        </div>
      )}
    </ChartCard>
  );
}
