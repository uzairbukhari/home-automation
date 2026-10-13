'use client';
import { OfflineLink as Link } from './app-shell';
import { useEffect, useState } from 'react';
import { readJson } from '@/lib/client-data';
import { useUrlState } from '@/hooks/use-app-navigation';
import { LoadingCards } from './presentation';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from './energy/chart-card';
import { MoneySplit } from './energy/money-split';
import { SERIES, chartTick, chartTooltip, tooltipTrigger } from '@/lib/chart-theme';
import { localDate } from '@/lib/measurements';
import type { energyReports } from '@/lib/reports';
type Report = Awaited<ReturnType<typeof energyReports>>;
const number = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-PK', { maximumFractionDigits: 2 });
function Delta({
  label,
  now,
  then,
  range,
}: {
  label: string;
  now: number | null;
  then: number | null;
  range: { from: string; to: string };
}) {
  if (then === null) return <small className="report-delta">{label}: no data</small>;
  const change = now !== null && then > 0 ? ((now - then) / then) * 100 : null;
  return (
    <small className="report-delta" title={range.from + ' – ' + range.to}>
      {label}: {number(then)} kWh
      {change !== null && (
        <>
          {' '}
          ({change > 0 ? '+' : ''}
          {change.toFixed(0)}%)
        </>
      )}
    </small>
  );
}
function TypicalDay({ days, hours }: { days: number; hours: NonNullable<Report['typicalDay']> }) {
  const data = hours.map((h) => ({ hour: h.hour, home: h.homeW, solar: h.solarW }));
  return (
    <ChartCard
      eyebrow="Typical day"
      title="Average power by hour"
      footnote={`Averaged over ${days} ${days === 1 ? 'day' : 'days'} of stored readings · Asia/Karachi hours`}
    >
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 18, top: 20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 23]}
              ticks={[0, 6, 12, 18, 23]}
              tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
              tick={chartTick}
            />
            <YAxis tickFormatter={(n) => String(n / 1000)} unit=" kW" tick={chartTick} />
            <Tooltip
              trigger={tooltipTrigger()}
              labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
              formatter={(n) => `${(Number(n) / 1000).toFixed(2)} kW`}
              contentStyle={chartTooltip}
            />
            <Line
              name="Home"
              dataKey="home"
              stroke={SERIES.home}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              name="Solar"
              dataKey="solar"
              stroke={SERIES.solar}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="series-controls" aria-label="Legend">
        <span>
          <span style={{ background: SERIES.home }} />
          Home
        </span>
        <span>
          <span style={{ background: SERIES.solar }} />
          Solar
        </span>
      </div>
    </ChartCard>
  );
}
export function ReportScreen() {
  const [range, setRange] = useUrlState('range', 'month', ['today', 'week', 'month', 'cycle', 'custom']),
    [from, setFrom] = useUrlState('from', localDate()),
    [to, setTo] = useUrlState('to', localDate()),
    [device, setDevice] = useUrlState('device', ''),
    [room, setRoom] = useUrlState('room', ''),
    [loading, setLoading] = useState(true),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [options, setOptions] = useState<{ devices: Array<{ id: string; name: string; room: string }> }>({ devices: [] });
  const params = new URLSearchParams({
    range,
    ...(range === 'custom' ? { from, to } : {}),
    ...(device ? { device } : {}),
    ...(room ? { room } : {}),
  }).toString();
  useEffect(() => {
    let active = true;
    readJson<{ devices: Array<{ id: string; name: string; room: string }> }>('/api/tuya/devices')
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    readJson<Report>('/api/reports?' + params)
      .then((data) => {
        if (active) {
          setReport(data);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params]);
  const body = (
    <section className="panel feature-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Energy & appliances</span>
          <h2>Appliance energy</h2>
          <p>Measured usage, room totals and estimated costs.</p>
        </div>
        <a className="secondary-action" href={'/api/reports?' + params + '&format=csv'}>
          Export CSV
        </a>
      </div>
      <div className="feature-toolbar">
        <label>
          Period
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">Last seven days</option>
            <option value="month">This month</option>
            <option value="cycle">Billing cycle</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={localDate()} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} max={localDate()} />
            </label>
          </>
        )}
        <label>
          Device
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="">All devices</option>
            {options.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Room
          <select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">All rooms</option>
            {[...new Set(options.devices.map((d) => d.room))].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="report-error">
          {error}
        </p>
      )}
      {loading && !report && <LoadingCards label="Loading stored summaries" />}
      {loading && report && (
        <p role="status">Updating this report. Previous results remain below until the selected period loads.</p>
      )}
      {report && (
        <>
          <p className="report-footnote">
            {report.from} – {report.to} · comparison {report.previousFrom} – {report.previousTo} · Asia/Karachi
          </p>
          <div className="report-metrics-grid">
            {[
              ['Solar generation', report.household.solarKwh, 'solarKwh'],
              [
                report.household.gridEstimated ? 'Grid import (estimated)' : 'Grid import',
                report.household.gridKwh,
                'gridKwh',
              ],
              [
                report.household.homeEstimated ? 'Home consumption (estimated)' : 'Home consumption',
                report.household.homeKwh,
                'homeKwh',
              ],
              ['Monitored appliances', report.household.monitoredKwh, null],
              ['Unmonitored estimate', report.household.unmonitoredKwh, null],
            ].map(([label, value, key]) => (
              <div className="report-metric" key={String(label)}>
                <div>
                  <span>{label}</span>
                  <strong>
                    {number(value as number | null)} <small>kWh</small>
                  </strong>
                  {key && (
                    <>
                      <Delta
                        label="Previous period"
                        now={value as number | null}
                        then={report.comparison.previous[key as 'solarKwh']}
                        range={report.comparison.previous}
                      />
                      <Delta
                        label="Same dates last year"
                        now={value as number | null}
                        then={report.comparison.yearAgo[key as 'solarKwh']}
                        range={report.comparison.yearAgo}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {report.typicalDay && <TypicalDay days={report.typicalDays} hours={report.typicalDay} />}
          <MoneySplit
            devices={report.devices}
            unmonitoredKwh={report.household.unmonitoredKwh}
            periodLabel="in this period"
          />
          {report.household.warning && <p className="device-notice">{report.household.warning}</p>}
          <p className="report-footnote">
            A dash means there is not enough recorded data for that total. Coverage and cost assumptions explain partial
            estimates below.
          </p>
          <h3>Appliance usage, ranked by energy</h3>
          {report.devices.every((d) => d.energyKwh === null) && (
            <p className="report-footnote">
              No energy totals are available to rank yet. Recorded device peaks and coverage remain below.
            </p>
          )}
          <div className="report-table-wrap appliance-table">
            <table className="energy-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Energy kWh</th>
                  <th>Previous kWh</th>
                  <th>Estimated PKR</th>
                  <th>Peak W</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {[...report.devices]
                  .sort((a, b) => (b.energyKwh ?? -1) - (a.energyKwh ?? -1))
                  .map((d, index) => (
                    <tr key={d.id}>
                      <td>
                        {d.energyKwh !== null ? `${index + 1}. ` : ''}
                        {d.name}
                        {d.upstream ? ' · upstream meter' : ''}
                        <small>{d.partial ? 'Partial coverage' : 'Recorded coverage'}</small>
                      </td>
                      <td>{number(d.energyKwh)}</td>
                      <td>{number(d.previousKwh)}</td>
                      <td>{number(d.estimatedCost)}</td>
                      <td>{number(d.peakW)}</td>
                      <td>{number(d.coveredHours)} h</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-consumers">
            {[...report.devices]
              .sort((a, b) => (b.energyKwh ?? -1) - (a.energyKwh ?? -1))
              .map((d, index) => (
                <article className="consumer-card" key={d.id}>
                  <header>
                    <span>{d.energyKwh === null ? '—' : index + 1}</span>
                    <strong>
                      {d.name}
                      {d.upstream ? ' · upstream meter' : ''}
                    </strong>
                  </header>
                  <dl>
                    {[
                      ['Energy', number(d.energyKwh) + ' kWh'],
                      ['Previous', number(d.previousKwh) + ' kWh'],
                      ['Estimated cost', number(d.estimatedCost) + ' PKR'],
                      ['Peak', number(d.peakW) + ' W'],
                      ['Coverage', number(d.coveredHours) + ' h'],
                      ['Data', d.partial ? 'Partial coverage' : 'Recorded coverage'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
          </div>
          {!report.devices.length && (
            <p>No summarized appliance history in this period. Collection builds reports over time.</p>
          )}
          <h3>Room usage</h3>
          <div className="room-report-list">
            {report.rooms.map((r) => (
              <article key={r.id}>
                <strong>{r.name}</strong>
                <span>
                  {number(r.energyKwh)} kWh · {number(r.estimatedCost)} PKR estimated
                </span>
              </article>
            ))}
          </div>
          <details className="report-diagnostics">
            <summary>Sources, cost assumptions and coverage</summary>
            {report.assumptions.map((a) => (
              <p key={a}>{a}</p>
            ))}
            <p>
              Daily, monthly and yearly summaries are permanent. Detailed and hourly readings are retained for 90 days.
            </p>
          </details>
          <div className="feature-toolbar">
            <Link href="/solar?section=trends">Solar and battery performance</Link>
            <Link href="/automations?section=activity">Automation activity</Link>
            <Link href="/settings?category=storage">Collection and storage health</Link>
          </div>
        </>
      )}
    </section>
  );
  return body;
}
