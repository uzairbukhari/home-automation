'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BatteryCharging, HeartPulse, Hourglass, Repeat2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useJson } from '@/lib/client-data';
import type { BatteryStats } from '@/lib/day-stats';
import type { EnergyReport } from '@/lib/solar-energy';

const num = (v: number | null | undefined, digits = 1) => (v == null ? '—' : v.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: digits }));
const tick = { fill: 'var(--muted-foreground)', fontSize: 11 };

function Tile({ icon: Icon, label, value, unit, note, children }: { icon: typeof Repeat2; label: string; value: string; unit?: string; note: string; children?: React.ReactNode }) {
  return <div className="health-tile"><div className="health-tile-top"><Icon aria-hidden="true" /><span>{label}</span></div><strong>{value}{unit && <small> {unit}</small>}</strong>{children}<p>{note}</p></div>;
}

export function BatteryHealth({ report, rangeLabel, capacity, reserve }: { report?: EnergyReport; rangeLabel: string; capacity: number; reserve: number }) {
  const { data: stats = null, error } = useJson<BatteryStats & { error?: string }>('/api/solar/battery', 'Battery statistics are unavailable');
  const health = stats?.health, used = stats?.warrantyUsedPct ?? null;
  return (
    <Card className="system-report-card battery-health-card">
      <div className="report-card-heading"><div><span className="eyebrow">Battery health</span><h3>Cycles, wear and condition</h3></div><BatteryCharging /></div>
      {error && <p className="report-error" role="status">{error}</p>}
      <div className="health-tiles">
        <Tile icon={Repeat2} label="Equivalent cycles" value={num(stats?.cycles, 1)} unit={`of ${(stats?.warrantyCycles ?? 3000).toLocaleString('en')}`} note={stats?.cycles == null ? 'Waiting for recorded battery readings.' : `${num(stats.cyclesRemaining, 0)} cycles left in your warranty · ${num(used, 2)}% used`}>
          <div className="warranty-meter" role="img" aria-label={`${num(used, 2)} percent of the cycle warranty used`}><span style={{ width: `${Math.max(1.5, Math.min(100, used ?? 0))}%` }} /></div>
        </Tile>
        <Tile icon={HeartPulse} label="Estimated health" value={health ? num(health.pct, 0) : '—'} unit={health ? '%' : undefined} note={health ? `About ${num(health.estimatedCapacityKwh, 1)} of ${num(capacity, 1)} kWh usable, from ${health.samples} deep-cycle days.` : `Needs 3 days with a 20%+ swing in charge (${stats?.healthDays ?? 0} so far).`} />
        <Tile icon={Hourglass} label="Projected warranty life" value={stats?.yearsRemaining == null ? '—' : stats.yearsRemaining > 30 ? '30+' : num(stats.yearsRemaining, 1)} unit="years" note={stats?.cyclesPerDay == null ? 'Needs recent usage to project.' : `At your recent pace of ${num(stats.cyclesPerDay, 2)} cycles a day.`} />
      </div>
      <div className="system-stats">
        <div><span>Charged · {rangeLabel}</span><strong>{num(report?.batteryChargeKwh, 2)} kWh</strong></div>
        <div><span>Discharged · {rangeLabel}</span><strong>{num(report?.batteryDischargeKwh, 2)} kWh</strong></div>
        <div><span>Lifetime throughput</span><strong>{num(stats?.throughputKwh, 1)} kWh</strong></div>
        <div><span>Cycles, last 30 days</span><strong>{num(stats?.cyclesLast30, 1)}</strong></div>
        <div><span>Average depth of discharge</span><strong>{stats?.avgDepthPct == null ? '—' : num(stats.avgDepthPct, 0) + '%'}</strong></div>
        <div><span>Deepest day</span><strong>{stats?.deepestPct == null ? '—' : num(stats.deepestPct, 0) + '%'}</strong></div>
        <div><span>Charge range · {rangeLabel}</span><strong>{report?.socMin == null ? '—' : `${num(report.socMin, 0)}–${num(report.socMax, 0)}%`}</strong></div>
        <div><span>Time at reserve ({reserve}%) · {rangeLabel}</span><strong>{num(report?.hoursAtReserve, 1)} h</strong></div>
      </div>
      {Boolean(stats?.daily.length) && <div className="health-chart"><span>Cycles per day · last {stats!.daily.length} days</span>
        <div className="health-chart-body"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats!.daily} margin={{ left: 0, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 7" /><XAxis dataKey="date" tick={tick} tickFormatter={d => String(d).slice(5)} minTickGap={24} /><YAxis tick={tick} width={34} /><Tooltip cursor={{ fill: 'var(--foreground)', fillOpacity: 0.06 }} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--foreground)' }} formatter={(n, _name, item) => [`${num(Number(n), 2)} cycles · ${num(item.payload.dischargedKwh, 1)} kWh out`, 'Usage']} labelFormatter={d => String(d)} /><Bar dataKey="cycles" fill="var(--energy-battery)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div>}
      <p className="report-footnote">{stats?.since ? `Tracking since ${stats.since}, ${stats.trackedDays} days. ` : ''}A cycle is {num(capacity, 1)} kWh discharged. Health is an estimate from energy per percent of charge, assuming 97% one-way efficiency; your battery does not report state of health.</p>
    </Card>
  );
}
