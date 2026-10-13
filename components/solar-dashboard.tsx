'use client';
import { OfflineLink as Link } from './app-shell';
import { EnergyDetail } from './energy-detail';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, Expand } from 'lucide-react';
import { useUrlState } from '@/hooks/use-app-navigation';
import { readJson, foregroundPoll } from '@/lib/client-data';
import { Activity, CalendarDays, CloudOff, Grid3X3, SunMedium, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOffline } from './mobile-support';
import { FavoriteButton } from './favorite-button';
import type { DessSnapshot } from '@/lib/providers/dessmonitor';
import type { ChartId } from '@/lib/favorites';
import type { Settings } from '@/lib/settings';
import { BatteryHealth } from './battery-health';
import { ChartAlternative, LoadingCards, EmptyState } from './presentation';
import { chartTooltip as tooltipStyle, chartTick as tick, tooltipTrigger } from '@/lib/chart-theme';
import { ENERGY_TABS, ENERGY_TAB_LABELS, legacyEnergyTab, type EnergyTab } from '@/lib/energy-tabs';
import { solarBucketVerdict, todayVerdict } from '@/lib/energy-insights';
import { PeriodBar } from './energy/period-bar';
import { SourceMix } from './energy/source-mix';
import { BatteryTonight } from './energy/battery-tonight';
import { withGaps, useHistory, stampLabel } from './energy/history';
import { RangePicker } from './energy/range-picker';
import { HeadlineNumbers } from './energy/headline-numbers';
import { EventsPanel } from './events-panel';
import { EnergyBalance } from './energy/energy-balance';
import { SolarCalendar } from './energy/solar-calendar';
import { HourHeatmap } from './energy/hour-heatmap';
import { GridHealth } from './energy/grid-health';
import { SelfSufficiencyTrend } from './energy/self-sufficiency';
import { BestWorstDays } from './energy/best-worst-days';
import type { ReportsSnapshot } from '@/lib/solar-types';
import { localDate, shiftDate } from '@/lib/measurements';
import type { EnergyBucket } from '@/lib/solar-energy';
const ReportScreen = lazy(() => import('./report-screen').then((module) => ({ default: module.ReportScreen })));
type Pin = { has: (id: ChartId) => boolean; toggle: (id: ChartId) => void; busy: boolean };
const format = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: digits });
function ChartHeading({
  title,
  eyebrow,
  id,
  pin,
  children,
}: {
  title: string;
  eyebrow: string;
  id: ChartId;
  pin: Pin;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded, close] = useUrlState('expanded', ''),
    heading = useRef<HTMLDivElement>(null),
    closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (expanded !== id) return;
    const panel = heading.current?.closest<HTMLElement>('.panel,.battery-card,.soc-card');
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', title);
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length);
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    panel.addEventListener('keydown', key);
    return () => {
      panel.removeEventListener('keydown', key);
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('aria-label');
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [expanded, id, title]);
  return (
    <div ref={heading} className="section-heading chart-heading" data-chart={id} data-expanded={expanded === id}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="widget-actions">
        {children}
        <button
          className="icon-button"
          aria-label={expanded === id ? `Close expanded ${title}` : `Expand ${title}`}
          onClick={() => (expanded === id ? close() : setExpanded(id, true))}
        >
          {expanded === id ? <ArrowLeft /> : <Expand />}
        </button>
        <FavoriteButton active={pin.has(id)} busy={pin.busy} label={title} onClick={() => pin.toggle(id)} />
      </div>
    </div>
  );
}
function ChartState({ error, empty, loading }: { error: string; empty: boolean; loading: boolean }) {
  return loading ? (
    <div className="chart-empty">
      <Activity />
      Loading recorded readings…
    </div>
  ) : error ? (
    <div className="chart-empty">
      <CloudOff />
      {error}
    </div>
  ) : empty ? (
    <div className="chart-empty">No recorded readings for this period.</div>
  ) : null;
}
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
const dayLabel = (date: string) =>
  date === localDate()
    ? 'Today'
    : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });
function PowerHistory({ live, pin }: { live: DessSnapshot | null; pin: Pin }) {
  const [range, setRange] = useUrlState('powerPeriod', 'day', ['day', 'week', 'month', 'custom']),
    [from, setFrom] = useUrlState('from', shiftDate(localDate(), -6)),
    [to, setTo] = useUrlState('to', localDate()),
    [series, setSeries] = useUrlState('powerSeries', 'solar,home,grid'),
    [date, setDate] = useUrlState('date', localDate()),
    today = localDate(),
    pastDay = range === 'day' && date < today,
    visible = {
      solar: series.split(',').includes('solar'),
      home: series.split(',').includes('home'),
      grid: series.split(',').includes('grid'),
    },
    lastDay = live ? localDate(Date.parse(live.updatedAt)) : '',
    dayEmpty = range === 'day' && !pastDay && Boolean(live) && !live?.series?.length,
    history = useHistory(
      dayEmpty || pastDay ? 'custom' : range,
      range === 'custom' ? from : pastDay ? date : dayEmpty ? lastDay : undefined,
      range === 'custom' ? to : pastDay ? date : dayEmpty ? lastDay : undefined,
      range !== 'day' || dayEmpty || pastDay,
    );
  const useLive = range === 'day' && !dayEmpty && !pastDay,
    points = useLive ? (live?.series ?? []) : (history.data?.series ?? []),
    chart = withGaps(points, range === 'month' ? 87300000 : range === 'week' ? 4500000 : 900000),
    error = useLive ? '' : history.error,
    loading = !useLive && history.loading;
  return (
    <Card className="panel chart-panel">
      <ChartHeading id="power-history" pin={pin} title="Production and demand" eyebrow="Power history">
        <div className="range-picker" aria-label="Power chart period">
          {['day', 'week', 'month', 'custom'].map((v) => (
            <button
              key={v}
              aria-pressed={range === v}
              className={range === v ? 'active' : ''}
              onClick={() => setRange(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </ChartHeading>
      {range === 'day' && (
        <PeriodBar
          label={dayLabel(date)}
          onPrev={() => setDate(shiftDate(date, -1))}
          onNext={() => setDate(shiftDate(date, 1))}
          nextDisabled={date >= today}
          onNow={() => setDate(today)}
        />
      )}
      {range === 'custom' && (
        <div className="custom-range">
          <label>
            From
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <Input type="date" value={to} min={from} max={localDate()} onChange={(e) => setTo(e.target.value)} />
          </label>
          <small>Up to 31 days</small>
        </div>
      )}
      <div className="chart-summary">
        <div>
          <strong>
            {range === 'day'
              ? pastDay
                ? `${dayLabel(date)}’s power readings`
                : dayEmpty
                  ? `Last recorded day · ${new Date(`${lastDay}T12:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}`
                  : 'Today’s power readings'
              : range === 'month'
                ? 'Daily average power'
                : 'Recorded power profile'}
          </strong>
          <span>{points.length} samples · power shown in kW</span>
        </div>
        <div className="series-controls">
          {[
            { key: 'solar', label: 'Solar', color: 'var(--energy-solar)' },
            { key: 'home', label: 'Home', color: 'var(--energy-home)' },
            { key: 'grid', label: 'Grid', color: 'var(--energy-grid)' },
          ].map((item) => (
            <button
              className={visible[item.key as keyof typeof visible] ? '' : 'muted'}
              key={item.key}
              onClick={() =>
                setSeries(
                  visible[item.key as keyof typeof visible]
                    ? series
                        .split(',')
                        .filter((key) => key !== item.key)
                        .join(',') || 'none'
                    : [...series.split(',').filter((key) => key !== 'none'), item.key].join(','),
                )
              }
            >
              <span style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <ChartState error={!chart.length ? error : ''} empty={!chart.length} loading={loading && !chart.length} />
      {Boolean(chart.length) && (
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ left: 0, right: 18, top: 20 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis
                dataKey="stamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(n) => (range === 'day' ? stampLabel(n, true) : localDate(n).slice(5))}
                tick={tick}
              />
              <YAxis tickFormatter={(n) => String(n / 1000)} unit=" kW" tick={tick} />
              <Tooltip
                trigger={tooltipTrigger()}
                labelFormatter={(n) => stampLabel(Number(n))}
                formatter={(n) => `${(Number(n) / 1000).toFixed(2)} kW`}
                contentStyle={tooltipStyle}
              />
              {visible.solar && (
                <Area
                  name="Solar"
                  type="linear"
                  dataKey="solar"
                  stroke="var(--energy-solar)"
                  fill="var(--energy-solar)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}{' '}
              {visible.home && (
                <Area
                  name="Home"
                  type="linear"
                  dataKey="home"
                  stroke="var(--energy-home)"
                  fill="transparent"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}{' '}
              {visible.grid && (
                <Area
                  name="Grid import"
                  type="stepAfter"
                  dataKey="grid"
                  stroke="var(--energy-grid)"
                  fill="transparent"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartAlternative
        headers={['Measurement (Asia/Karachi)', 'Solar (W)', 'Home (W)', 'Grid (W)']}
        rows={chart.map((point) => [stampLabel(point.stamp), point.solar, point.home, point.grid])}
      />
      <p className="report-footnote">{error || 'Recorded measurements. Gaps over 15 minutes remain visible.'}</p>
    </Card>
  );
}
function ChargeHistory({ settings, pin }: { settings: Settings; pin: Pin }) {
  const [range, setRange] = useUrlState('chargePeriod', '24h', ['24h', '48h', '7d', '30d']),
    history = useHistory(range),
    chart = withGaps(history.data?.series ?? []);
  return (
    <Card className="panel soc-card">
      <ChartHeading id="soc-history" title="State of charge" eyebrow="Battery history" pin={pin}>
        <div className="range-picker" aria-label="Battery history period">
          {[
            ['24h', '24 hours'],
            ['48h', '2 days'],
            ['7d', 'Week'],
            ['30d', 'Month'],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={range === v}
              className={range === v ? 'active' : ''}
              onClick={() => setRange(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </ChartHeading>
      <ChartState
        error={!chart.length ? history.error : ''}
        loading={history.loading && !chart.length}
        empty={!chart.length}
      />
      {Boolean(chart.length) && (
        <div className="soc-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ left: 0, right: 18, top: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="stamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(n) =>
                  range === '24h' ? stampLabel(n, true) : `${localDate(n).slice(5)} ${stampLabel(n, true)}`
                }
                minTickGap={35}
                tick={tick}
              />
              <YAxis domain={[0, 100]} unit="%" tick={tick} />
              <Tooltip
                trigger={tooltipTrigger()}
                labelFormatter={(n) => stampLabel(Number(n))}
                formatter={(n) => `${Number(n).toFixed(0)}%`}
                contentStyle={tooltipStyle}
              />
              <ReferenceLine y={settings.threshold} stroke="var(--status-warn)" strokeDasharray="6 6" />
              <Line
                type="linear"
                name="State of charge"
                dataKey="battery"
                stroke="var(--energy-battery)"
                dot={false}
                strokeWidth={2.5}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartAlternative
        headers={['Measurement (Asia/Karachi)', 'Charge (%)']}
        rows={chart.map((point) => [stampLabel(point.stamp), point.battery])}
      />
      <p className="report-footnote">
        {history.error ||
          `Saved in the database · invalid battery telemetry appears as gaps · reserve at ${settings.threshold}% · Asia/Karachi`}
      </p>
    </Card>
  );
}
export function BatteryWindow({ live, settings, pin }: { live: DessSnapshot | null; settings: Settings; pin: Pin }) {
  const value = (metric: string) => live?.readings.find((r) => r.metric === metric)?.value ?? null,
    soc = value('battery_soc'),
    fill = soc === null ? 0 : Math.max(0, Math.min(100, soc)),
    charge = value('battery_charge_current'),
    discharge = value('battery_discharge_current');
  return (
    <Card className="panel battery-card">
      <ChartHeading id="battery-window" title="Charge and reserve" eyebrow="Battery" pin={pin} />
      <div className="battery-visual">
        <div
          className="battery-body"
          role="meter"
          aria-label="Battery charge"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={soc ?? undefined}
          aria-valuetext={soc === null ? 'Charge unavailable' : `${soc}%`}
        >
          <div className="battery-fill" style={{ width: `${fill}%` }} />
          <div className="threshold-line" style={{ left: `${settings.threshold}%` }}>
            <span>{settings.threshold}% reserve</span>
          </div>
          <div className="battery-readout">
            <strong>{soc === null ? '—' : `${Math.round(soc)}%`}</strong>
            <span>{live?.device.mode ?? 'Awaiting readings'}</span>
          </div>
        </div>
        <div className="battery-cap" />
      </div>
      <div className="battery-stats">
        <div>
          <span>Charge above reserve</span>
          <strong>{soc === null ? '—' : Math.max(0, soc - settings.threshold).toFixed(0)} percentage points</strong>
          <small>Relative to your reserve setting</small>
        </div>
        <div>
          <span>Battery flow</span>
          <strong>
            {charge !== null && charge > 0.1
              ? `${charge.toFixed(1)} A charging`
              : discharge !== null
                ? `${discharge.toFixed(1)} A discharging`
                : '—'}
          </strong>
          <small>{format(value('battery_voltage'), 1)} V</small>
        </div>
      </div>
    </Card>
  );
}
function EnergyTotals({
  reports,
  pin,
  year,
  setYear,
  weekEnd,
  setWeekEnd,
  loading,
  error,
}: {
  reports: ReportsSnapshot | null;
  pin: Pin;
  year: string;
  setYear: (v: string) => void;
  weekEnd: string;
  setWeekEnd: (v: string) => void;
  loading: boolean;
  error: string;
}) {
  const [range, setRange] = useUrlState('energyPeriod', 'week', ['week', 'month', 'year']),
    [series, setSeries] = useUrlState('energySeries', 'solar,grid'),
    visible = { solar: series.split(',').includes('solar'), grid: series.split(',').includes('grid') },
    today = localDate(),
    sevenDaysStart = shiftDate(weekEnd, -6),
    daily = reports?.buckets.daily ?? [],
    monthly = reports?.buckets.monthly ?? [],
    yearly = reports?.buckets.yearly ?? [];
  const chart: EnergyBucket[] =
    range === 'week'
      ? Array.from({ length: 7 }, (_, i) => {
          const date = shiftDate(sevenDaysStart, i);
          return (
            daily.find((b) => b.date === date) ?? {
              date,
              solar: null,
              grid: null,
              home: null,
              source: 'missing',
              gridSource: 'missing',
              coveredHours: 0,
              partial: true,
            }
          );
        })
      : range === 'month'
        ? Array.from({ length: 12 }, (_, i) => {
            const date = `${year}-${String(i + 1).padStart(2, '0')}`;
            return (
              monthly.find((b) => b.date === date) ?? {
                date,
                solar: null,
                grid: null,
                home: null,
                source: 'missing',
                gridSource: 'missing',
                coveredHours: 0,
                partial: true,
              }
            );
          })
        : yearly;
  const title =
      range === 'week'
        ? weekEnd === today
          ? 'Last 7 days · day by day'
          : `${shortDate(sevenDaysStart)} – ${shortDate(weekEnd)} · day by day`
        : range === 'month'
          ? `${year} · month by month`
          : 'All years · year by year',
    firstYear = Math.min(Number(today.slice(0, 4)), ...(reports?.availableYears ?? []).map(Number)),
    verdict = solarBucketVerdict(chart, range === 'week' ? 'day' : range === 'month' ? 'month' : 'year', (date) =>
      range === 'week' ? shortDate(date) : range === 'month' ? date.slice(5) : date,
    );
  return (
    <Card className="panel chart-panel">
      <ChartHeading id="energy-totals" title="Solar production & grid use" eyebrow="Energy totals" pin={pin}>
        <div className="range-picker" aria-label="Energy totals grouping">
          {[
            ['week', '7 days'],
            ['month', 'Months'],
            ['year', 'Years'],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={range === v}
              className={range === v ? 'active' : ''}
              onClick={() => setRange(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </ChartHeading>
      {range === 'week' && (
        <PeriodBar
          label={weekEnd === today ? 'Last 7 days' : `${shortDate(sevenDaysStart)} – ${shortDate(weekEnd)}`}
          onPrev={() => setWeekEnd(shiftDate(weekEnd, -7))}
          onNext={() => setWeekEnd(shiftDate(weekEnd, 7) > today ? today : shiftDate(weekEnd, 7))}
          nextDisabled={weekEnd >= today}
          onNow={() => setWeekEnd(today)}
          nowLabel="Latest"
        />
      )}
      {range === 'month' && (
        <PeriodBar
          label={year}
          onPrev={() => setYear(String(Number(year) - 1))}
          onNext={() => setYear(String(Number(year) + 1))}
          prevDisabled={Number(year) <= firstYear}
          nextDisabled={year >= today.slice(0, 4)}
          onNow={() => setYear(today.slice(0, 4))}
          nowLabel="This year"
        />
      )}
      {verdict && <p className="verdict">{verdict}</p>}
      <div className="chart-summary">
        <div>
          <strong>{title}</strong>
          <span>Solar energy and imported grid energy · kWh</span>
        </div>
      </div>
      <div className="series-controls energy-series-controls" aria-label="Energy chart series">
        {[
          { key: 'solar', label: 'Solar production', color: 'var(--energy-solar)' },
          { key: 'grid', label: 'Grid import', color: 'var(--energy-grid)' },
        ].map((item) => (
          <button
            key={item.key}
            aria-pressed={visible[item.key as keyof typeof visible]}
            className={visible[item.key as keyof typeof visible] ? '' : 'muted'}
            onClick={() =>
              setSeries(
                visible[item.key as keyof typeof visible]
                  ? series
                      .split(',')
                      .filter((key) => key !== item.key)
                      .join(',') || 'none'
                  : [...series.split(',').filter((key) => key !== 'none'), item.key].join(','),
              )
            }
          >
            <span style={{ background: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
      <ChartState loading={loading && !reports} empty={!reports} error={error && !reports ? error : ''} />
      {reports && (
        <div className="main-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: 0, right: 18, top: 30 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" />
              <XAxis
                dataKey="date"
                tick={tick}
                interval={range === 'year' ? 'preserveEnd' : 0}
                tickFormatter={(date) =>
                  range === 'week'
                    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
                    : range === 'month'
                      ? new Date(`${date}-15T12:00:00Z`).toLocaleDateString('en', { month: 'short' })
                      : date
                }
              />
              <YAxis unit=" kWh" tick={tick} />
              <Tooltip
                trigger={tooltipTrigger()}
                cursor={{ fill: 'var(--foreground)', fillOpacity: 0.06 }}
                contentStyle={tooltipStyle}
                formatter={(n, name, item) => [
                  `${format(Number(n))} kWh${item.payload.partial && name === 'Grid import' ? ' · partial coverage' : ''}`,
                  name,
                ]}
                labelFormatter={(d) => String(d)}
              />
              {visible.solar && (
                <Bar
                  name="Solar production"
                  dataKey="solar"
                  fill="var(--energy-solar)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={34}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="solar"
                    position="top"
                    fill="var(--energy-solar)"
                    fontSize={11}
                    formatter={(value) =>
                      value == null ? '' : Number(value).toLocaleString('en', { maximumFractionDigits: 1 })
                    }
                  />
                </Bar>
              )}{' '}
              {visible.grid && (
                <Bar
                  name="Grid import"
                  dataKey="grid"
                  fill="var(--energy-grid)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={34}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="grid"
                    position="top"
                    fill="var(--energy-grid)"
                    fontSize={11}
                    formatter={(value) =>
                      value == null ? '' : Number(value).toLocaleString('en', { maximumFractionDigits: 1 })
                    }
                  />
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartAlternative
        headers={['Period', 'Solar (kWh)', 'Grid (kWh)', 'Covered hours']}
        rows={chart.map((point) => [point.date, point.solar, point.grid, point.coveredHours])}
      />
      <p className="report-footnote">
        {error ||
          'Solar uses provider energy totals.' +
            (reports?.gridMeter
              ? ` Grid import is measured by your ${reports.gridMeter}.`
              : ' Grid import is integrated from the inverter.') +
            ' Missing history stays empty.'}
      </p>
    </Card>
  );
}
type ReportRange = 'today' | 'month' | 'year';
function PerformanceReports({
  reports,
  range,
  setRange,
}: {
  reports: ReportsSnapshot | null;
  error: string;
  range: ReportRange;
  setRange: (range: ReportRange) => void;
}) {
  const offline = useOffline(),
    report = reports?.[range];
  return (
    <section className="panel reports-panel">
      <div className="section-heading reports-heading">
        <div>
          <span className="eyebrow">Performance report</span>
          <h2>Energy performance</h2>
        </div>
        <div className="range-picker">
          {(['today', 'month', 'year'] as const).map((v) => (
            <button key={v} className={range === v ? 'active' : ''} onClick={() => setRange(v)}>
              {v === 'today' ? 'Today' : v === 'month' ? 'This month' : 'This year'}
            </button>
          ))}
        </div>
      </div>
      {reports && (
        <p className="report-footnote" role="status">
          {offline
            ? 'Saved measurements'
            : reports.refreshing
              ? 'Updating saved measurements…'
              : 'Measurements updated'}{' '}
          · {new Date(reports.updatedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
        </p>
      )}
      <div className="production-strip">
        {[
          ['Today', reports?.production.today],
          ['This month', reports?.production.month],
          ['This year', reports?.production.year],
          ['Lifetime', reports?.production.lifetime],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>
              {format(value as number | null, 1)} <small>kWh</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="report-metrics-grid">
        {[
          {
            label: 'Solar produced',
            value: report?.solarKwh,
            icon: SunMedium,
            note:
              report?.solarSource === 'counter' ? 'Verified provider energy total' : 'Integrated recorded solar power',
            tone: 'solar',
          },
          {
            label: 'Home energy',
            value: report?.homeKwh,
            icon: Activity,
            note: 'Inverter output integrated from recorded readings',
            tone: 'home',
          },
          {
            label: 'Grid imported',
            value: report?.gridKwh,
            icon: Grid3X3,
            note: reports?.gridMeter ? `Measured by ${reports.gridMeter}` : 'Integrated from recorded import power',
            tone: 'grid',
          },
          {
            label: 'Direct solar to home',
            value: report?.directSolarKwh,
            icon: TrendingUp,
            note: 'Estimated after grid and battery discharge',
            tone: 'saving',
          },
        ].map(({ label, value, icon: Icon, note, tone }) => (
          <div className={`report-metric ${tone}`} key={label}>
            <div className="report-icon">
              <Icon />
            </div>
            <div>
              <span>{label}</span>
              <strong>
                {format(value)} <small>kWh</small>
              </strong>
              <p>{note}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="report-footnote">
        A dash means measurements are unavailable. Partial history limits totals; missing readings remain gaps.
      </p>
      <details className="report-diagnostics">
        <summary>Data sources and collection health</summary>
        <p>
          Annual solar: {reports?.diagnostics.annualSource ?? 'Unavailable'}. Monthly sum:{' '}
          {format(reports?.diagnostics.monthlyTotal, 1)} kWh. Difference from annual total:{' '}
          {format(reports?.diagnostics.monthlyDifference, 1)} kWh.
        </p>
        <p>
          Background collection: {reports?.collection?.status ?? 'Not scheduled yet'} ·{' '}
          {reports?.collection?.finished_at ?? 'No recorded run'}
        </p>
        {reports?.collection?.error && <p>{reports.collection.error}</p>}
        {reports?.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </details>
    </section>
  );
}
function BillingSavings({ reports, settings }: { reports: ReportsSnapshot | null; settings: Settings }) {
  const [savingsCycle, setSavingsCycle] = useUrlState('billingCycle', 'current'),
    savings =
      savingsCycle === 'current'
        ? reports?.savings
        : (reports?.previousCycles?.find((c) => c.from === savingsCycle) ?? reports?.savings);
  const dateLabel = (date: string | undefined) =>
    date
      ? new Date(date + 'T12:00:00Z').toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';
  const direct = savings?.cycles.length ? savings.cycles.reduce((sum, cycle) => sum + cycle.directSolarKwh, 0) : null,
    grid = savings?.cycles.length ? savings.cycles.reduce((sum, cycle) => sum + cycle.gridKwh, 0) : null;
  const breakdown: Array<{ label: string; value: number | null | undefined; note: string }> = [
    { label: 'Energy charges', value: savings?.energy, note: 'Avoided electricity cost' },
    { label: 'GST', value: savings?.gst, note: '18% of taxable charges' },
    {
      label: 'Electricity duty',
      value: settings.tariffSettings.dutyPercent === null ? null : savings?.duty,
      note:
        settings.tariffSettings.dutyPercent === null
          ? 'Not configured'
          : settings.tariffSettings.dutyPercent + '% of energy charges',
    },
    {
      label: 'Income tax',
      value: settings.tariffSettings.taxStatus === 'unknown' ? null : savings?.income,
      note: settings.tariffSettings.taxStatus === 'unknown' ? 'Tax status unknown' : 'Conditional on bill and status',
    },
    { label: 'Financing surcharge', value: savings?.surcharge, note: 'Variable surcharge savings' },
    { label: 'Fuel & quarterly adjustments', value: savings?.adjustments, note: 'Cycle-specific adjustments' },
  ];
  return (
    <Card className="daily-report-card savings-card billing-savings-panel">
      <div className="billing-header">
        <div className="billing-title">
          <span className="billing-icon">
            <CalendarDays size={21} />
          </span>
          <div>
            <h3>Billing cycle</h3>
            <p>
              {dateLabel(savings?.from)} <span>–</span> {dateLabel(savings?.to)}
            </p>
          </div>
        </div>
        <div className="billing-cycle-picker">
          <label>
            View period
            <select
              aria-label="Savings billing period"
              value={savingsCycle}
              onChange={(event) => setSavingsCycle(event.target.value)}
            >
              <option value="current">Current cycle</option>
              {reports?.previousCycles?.map((cycle) => (
                <option key={cycle.from} value={cycle.from}>
                  {dateLabel(cycle.from)} – {dateLabel(cycle.to)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="billing-content">
        <div className="billing-total">
          <div className="billing-total-label">
            <TrendingUp size={18} />
            <span>Direct solar savings</span>
          </div>
          {savings?.total == null ? (
            <p className="billing-empty">
              No savings estimate yet. It appears once solar and grid energy have been recorded for this billing cycle.
            </p>
          ) : (
            <>
              <strong>
                <small>Rs</small> {format(savings.total, 0)}
              </strong>
              <span className="billing-estimate">
                {savings.provisional ? 'Provisional estimate' : 'Estimated savings'}
              </span>
            </>
          )}
          <div className="billing-energy">
            <div>
              <span>Direct solar used</span>
              <strong>
                {format(direct, 1)} <small>kWh</small>
              </strong>
            </div>
            <div>
              <span>Grid imported</span>
              <strong>
                {format(grid, 1)} <small>kWh</small>
              </strong>
            </div>
          </div>
        </div>
        <div className="billing-breakdown" aria-label="Savings breakdown">
          {breakdown.map((item) => (
            <div className={item.value == null ? 'unconfigured' : ''} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value == null ? '—' : 'Rs ' + format(item.value, 0)}</strong>
              <small>{item.note}</small>
            </div>
          ))}
        </div>
      </div>
      <details className="billing-assumptions">
        <summary>Calculation details</summary>
        {!reports?.previousCycles?.length && (
          <p className="report-footnote">
            Previous billing cycles appear here when measurement history is available. Background backfill recovers
            earlier records.
          </p>
        )}
        {savings?.assumptions.map((note) => (
          <p className="report-footnote" key={note}>
            {note}
          </p>
        ))}
        <p className="report-footnote">
          IESCO unprotected slabs · {savings?.tariff.notification ?? 'SRO 279(I)/2026'}. Savings compare grid imports
          with imports plus estimated direct solar energy, per billing cycle. Fixed fees are excluded.
        </p>
      </details>
    </Card>
  );
}
function BatteryPerformance({
  reports,
  settings,
  range,
}: {
  reports: ReportsSnapshot | null;
  settings: Settings;
  range: ReportRange;
}) {
  return (
    <BatteryHealth
      report={reports?.[range]}
      rangeLabel={range === 'today' ? 'today' : range === 'month' ? 'this month' : 'this year'}
      capacity={settings.capacity}
      reserve={settings.threshold}
    />
  );
}
const REPORT_TABS: readonly EnergyTab[] = ['trends', 'battery', 'costs'];
const REPORT_RANGES = [
  ['today', 'Today'],
  ['month', 'This month'],
  ['year', 'This year'],
] as const;
export function SolarDashboard({ live, settings, pin }: { live: DessSnapshot | null; settings: Settings; pin: Pin }) {
  const [entity, setEntity] = useUrlState('entity', '', ['', 'battery', 'solar', 'grid', 'home']);
  const [section, setSection] = useUrlState('section', 'today', ENERGY_TABS);
  const tab = section as EnergyTab;
  const [reportRange, setRange] = useUrlState('reportPeriod', 'month', ['today', 'month', 'year']),
    [year, setYear] = useUrlState('year', localDate().slice(0, 4)),
    [weekEnd, setWeekEnd] = useUrlState('weekEnd', localDate());
  const range = reportRange as ReportRange;
  // Links saved before the five-tab layout (section=overview|history|reports) are moved to the matching tab.
  useEffect(() => {
    const params = new URL(location.href).searchParams,
      target = legacyEnergyTab(params.get('section'), params.get('report'), params.get('chart'));
    if (!target) return;
    const url = new URL(location.href);
    url.searchParams.set('section', target);
    url.searchParams.delete('report');
    history.replaceState(history.state, '', url);
    window.dispatchEvent(new Event('photon-navigation'));
  }, []);
  useEffect(() => {
    const id = new URL(location.href).searchParams.get('chart');
    if (id)
      requestAnimationFrame(() =>
        document.querySelector(`[data-chart="${id}"]`)?.closest('.panel')?.scrollIntoView({ block: 'start' }),
      );
  }, [tab]);
  const needsReports = REPORT_TABS.includes(tab),
    [reports, setReports] = useState<ReportsSnapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!needsReports) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>,
      attempts = 0;
    const follow = (pending?: boolean) => {
      clearTimeout(retry);
      if (pending && attempts++ < 3)
        retry = setTimeout(() => {
          if (!controller.signal.aborted && document.visibilityState !== 'hidden' && navigator.onLine) void refresh();
        }, 5000);
    };
    async function refresh() {
      setLoading(true);
      try {
        const data = await readJson<ReportsSnapshot & { error?: string; refreshing?: boolean }>(
          `/api/solar/reports?year=${year}&weekEnd=${weekEnd}&threshold=${settings.threshold}`,
        );
        if (controller.signal.aborted) return;
        setReports(data);
        follow(data.refreshing);
        setError('');
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Reports unavailable');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const stop = foregroundPoll(() => void refresh(), 300000);
    return () => {
      controller.abort();
      clearTimeout(retry);
      stop();
    };
  }, [needsReports, year, weekEnd, settings]);
  if (entity)
    return <EnergyDetail key={entity} entity={entity} onClose={() => setEntity('')} live={live} settings={settings} />;
  const unavailable = needsReports && !reports;
  return (
    <>
      <nav className="section-tabs energy-tabs" aria-label="Energy sections">
        {ENERGY_TABS.map((id) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setSection(id, true)}>
            {ENERGY_TAB_LABELS[id]}
          </button>
        ))}
      </nav>
      {needsReports && reports && loading && (
        <p className="report-footnote" role="status">
          Updating saved report…
        </p>
      )}
      {needsReports && error && (
        <p className="report-error" role="status">
          {error}
        </p>
      )}
      {unavailable &&
        (error ? (
          <EmptyState
            title="Report unavailable"
            note="Reconnect or review collection health to load stored measurements."
            action={<Link href="/settings?category=storage">Collection health</Link>}
          />
        ) : (
          <LoadingCards label="Loading stored report" />
        ))}
      <div className="solar-widgets" data-section={tab}>
        {tab === 'today' && (
          <>
            <section className="tab-intro">
              <p className="verdict">{todayVerdict(live?.today)}</p>
              <HeadlineNumbers today={live?.today} />
            </section>
            <BatteryTonight live={live} capacity={settings.capacity} reserve={settings.threshold} />
            <SourceMix live={live} />
            <PowerHistory live={live} pin={pin} />
          </>
        )}
        {tab === 'trends' && reports && (
          <>
            <EnergyTotals
              reports={reports}
              pin={pin}
              year={year}
              setYear={setYear}
              weekEnd={weekEnd}
              setWeekEnd={setWeekEnd}
              loading={loading}
              error={error}
            />
            <EnergyBalance
              report={reports[range]}
              periodLabel={range === 'today' ? 'today' : range === 'month' ? 'this month' : 'this year'}
              actions={
                <RangePicker label="Energy balance period" value={range} options={REPORT_RANGES} onChange={setRange} />
              }
            />
            <SelfSufficiencyTrend buckets={reports.calendar} />
            <SolarCalendar
              buckets={reports.calendar}
              year={year}
              onYear={setYear}
              firstYear={Math.min(Number(localDate().slice(0, 4)), ...reports.availableYears.map(Number))}
              currentYear={localDate().slice(0, 4)}
            />
            <HourHeatmap />
            <BestWorstDays buckets={reports.calendar} today={localDate()} year={year} />
            <PerformanceReports reports={reports} error={error} range={range} setRange={setRange} />
          </>
        )}
        {tab === 'battery' && (
          <>
            <div className="battery-grid">
              <BatteryWindow live={live} settings={settings} pin={pin} />
              <ChargeHistory settings={settings} pin={pin} />
            </div>
            {reports && (
              <div className="battery-overview-grid">
                <div className="range-row">
                  <RangePicker
                    label="Battery report period"
                    value={range}
                    options={REPORT_RANGES}
                    onChange={setRange}
                  />
                </div>
                <BatteryPerformance reports={reports} settings={settings} range={range} />
              </div>
            )}
          </>
        )}
        {tab === 'grid' && (
          <>
            <GridHealth />
            <EnergyDetail key="grid" embedded entity="grid" onClose={() => undefined} live={live} settings={settings} />
            <EventsPanel />
          </>
        )}
        {tab === 'costs' && (
          <>
            {reports && <BillingSavings reports={reports} settings={settings} />}
            <Suspense fallback={<LoadingCards label="Loading appliance report" />}>
              <ReportScreen />
            </Suspense>
          </>
        )}
      </div>
    </>
  );
}
