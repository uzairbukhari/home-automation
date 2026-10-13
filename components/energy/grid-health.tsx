'use client';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from './chart-card';
import { RangePicker } from './range-picker';
import { chartTick, chartTooltip, tooltipTrigger } from '@/lib/chart-theme';
import { readJson } from '@/lib/client-data';
import { gridTotals, gridVerdict, VOLTAGE_BANDS, type GridDay } from '@/lib/grid-math';

const SPANS = [
  ['7', '7 days'],
  ['30', '30 days'],
  ['90', '90 days'],
] as const;
const BAND_COLORS = {
  critical: 'var(--status-bad, #dc2626)',
  low: 'var(--status-warn, #d97706)',
  normal: 'var(--status-good, #16a34a)',
  high: 'var(--status-warn, #d97706)',
} as const;
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;

/** Power cuts, voltage quality and what the battery carried, from the inverter's own grid readings. */
export function GridHealth() {
  const [span, setSpan] = useState<(typeof SPANS)[number][0]>('30'),
    [days, setDays] = useState<GridDay[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    readJson<{ days: GridDay[] }>(`/api/solar/grid?days=${span}`)
      .then((data) => {
        if (active) {
          setDays(data.days);
          setError('');
        }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Grid data is unavailable'));
    return () => {
      active = false;
    };
  }, [span]);
  const list = days ?? [],
    totals = gridTotals(list),
    log = list
      .flatMap((d) => d.outages)
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 12),
    outageBars = list.map((d) => ({
      date: d.date,
      hours: Number((d.downMinutes / 60).toFixed(2)),
      cuts: d.outages.length,
    })),
    bandBars = list.map((d) => ({
      date: d.date,
      critical: Number(d.bandHours.critical.toFixed(2)),
      low: Number(d.bandHours.low.toFixed(2)),
      normal: Number(d.bandHours.normal.toFixed(2)),
      high: Number(d.bandHours.high.toFixed(2)),
    })),
    volts = list.flatMap((d) =>
      d.voltage
        ? [{ date: d.date, min: d.voltage.min, avg: Number(d.voltage.avg.toFixed(1)), max: d.voltage.max }]
        : [],
    );
  const items: Array<[string, string]> = [
    ['Power cuts', String(totals.outages)],
    ['Time without grid', totals.downHours ? `${totals.downHours.toFixed(1)} h` : '0 h'],
    ['Longest cut', totals.longest ? duration(totals.longest.minutes) : '—'],
    ['Carried by battery + solar', totals.carriedKwh === null ? '—' : `${totals.carriedKwh.toFixed(1)} kWh`],
    ['Average voltage', totals.avgVoltage === null ? '—' : `${totals.avgVoltage.toFixed(0)} V`],
    ['Lowest voltage', totals.lowestVoltage === null ? '—' : `${totals.lowestVoltage.toFixed(0)} V`],
  ];
  const empty = days !== null && !list.length;
  return (
    <>
      <ChartCard
        eyebrow="Grid health"
        title="Power cuts and voltage"
        verdict={days ? gridVerdict(totals, Number(span)) : null}
        actions={<RangePicker label="Grid period" value={span} options={SPANS} onChange={setSpan} />}
        footnote={
          error ||
          (empty
            ? 'No grid readings are summarised yet. Rollups build up as collection runs, a few days at a time.'
            : 'A power cut is any reading under 100 V on the inverter’s mains input. Times are Asia/Karachi.')
        }
      >
        {!empty && (
          <div className="headline-numbers">
            {items.map(([label, value]) => (
              <div key={label} data-tone="grid">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
      {!empty && days && (
        <>
          <ChartCard
            eyebrow="Outages"
            title="Hours without grid power each day"
            footnote="Each bar is one day. Tap or hover for how many separate cuts it had."
          >
            <div className="main-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outageBars} margin={{ left: 0, right: 12, top: 12 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
                  <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={24} tick={chartTick} />
                  <YAxis unit=" h" width={46} tick={chartTick} allowDecimals />
                  <Tooltip
                    trigger={tooltipTrigger()}
                    labelFormatter={(d) => dateLabel(String(d))}
                    formatter={(n, _name, item) => [
                      `${n} h · ${item.payload.cuts} cut${item.payload.cuts === 1 ? '' : 's'}`,
                      'Without grid',
                    ]}
                    contentStyle={chartTooltip}
                  />
                  <Bar
                    dataKey="hours"
                    name="Without grid"
                    fill="var(--status-bad, #dc2626)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard
            eyebrow="Voltage"
            title="How steady the mains voltage is"
            footnote="The shaded band is the normal range, 198 to 242 V. Lines show each day’s lowest, average and highest reading while the grid was on."
          >
            <div className="main-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volts} margin={{ left: 0, right: 12, top: 12 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
                  <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={24} tick={chartTick} />
                  <YAxis unit=" V" width={52} domain={[150, 270]} tick={chartTick} />
                  <ReferenceArea y1={198} y2={242} fill="var(--status-good, #16a34a)" fillOpacity={0.1} />
                  <Tooltip
                    trigger={tooltipTrigger()}
                    labelFormatter={(d) => dateLabel(String(d))}
                    formatter={(n) => `${n} V`}
                    contentStyle={chartTooltip}
                  />
                  <Line
                    name="Highest"
                    dataKey="max"
                    stroke="var(--status-warn, #d97706)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    name="Average"
                    dataKey="avg"
                    stroke="var(--flow-grid-import)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    name="Lowest"
                    dataKey="min"
                    stroke="var(--status-bad, #dc2626)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard
            eyebrow="Voltage bands"
            title="Hours spent in each voltage band"
            verdict={
              totals.outOfBandHours >= 1
                ? `${totals.outOfBandHours.toFixed(1)} hours outside the safe band in this period.`
                : 'Voltage stayed in the safe band.'
            }
            footnote="Sustained low or high voltage is hard on appliances and shows up here before it shows up as damage."
          >
            <div className="main-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bandBars} margin={{ left: 0, right: 12, top: 12 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
                  <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={24} tick={chartTick} />
                  <YAxis unit=" h" width={46} tick={chartTick} />
                  <Tooltip
                    trigger={tooltipTrigger()}
                    labelFormatter={(d) => dateLabel(String(d))}
                    formatter={(n) => `${n} h`}
                    contentStyle={chartTooltip}
                  />
                  {VOLTAGE_BANDS.map(([key, label]) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={label}
                      stackId="v"
                      fill={BAND_COLORS[key]}
                      fillOpacity={key === 'normal' ? 0.55 : 1}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="series-controls" aria-label="Legend">
              {VOLTAGE_BANDS.map(([key, label]) => (
                <span key={key}>
                  <span style={{ background: BAND_COLORS[key] }} />
                  {label}
                </span>
              ))}
            </div>
          </ChartCard>
          {log.length > 0 && (
            <ChartCard
              eyebrow="Outage log"
              title="Recent power cuts"
              footnote="Home use is what the house drew while the grid was off."
            >
              <div className="report-table-wrap">
                <table className="energy-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Length</th>
                      <th>Home use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((o) => (
                      <tr key={o.start}>
                        <td>
                          {dateLabel(new Date(o.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }))}
                        </td>
                        <td>{clock(o.start)}</td>
                        <td>{clock(o.end)}</td>
                        <td>{duration(o.minutes)}</td>
                        <td>{o.homeKwh === null ? '—' : `${o.homeKwh.toFixed(2)} kWh`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </>
      )}
    </>
  );
}
