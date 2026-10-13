'use client';
import { SunMedium, BatteryMedium } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CountUp } from '@/components/count-up';
import { ACTIVE_W, type EnergySnapshot } from '@/lib/energy-flow';
import type { DessSnapshot } from '@/lib/providers/dessmonitor';

type Today = NonNullable<DessSnapshot['today']> | null | undefined;
const kwh = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1) + ' kWh');

function duration(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  if (hours >= 24) return 'over a day';
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  return h ? `${h} h ${m ? m + ' min' : ''}`.trim() : `${m || 1} min`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat-row"><span>{label}</span><b>{value}</b></div>;
}

export function SolarCard({ solarToday, fresh, today, snapshot }: { solarToday: number | null; fresh: boolean; today: Today; snapshot: EnergySnapshot }) {
  const peak = today?.peakSolarW ?? null, now = snapshot.solar;
  const selfSufficiency = today?.homeKwh && today.gridKwh != null ? Math.max(0, Math.min(100, Math.round((1 - today.gridKwh / today.homeKwh) * 100))) : null;
  return (
    <Card className="metric-card energy-card" data-tone="solar">
      <div className="metric-top"><span className="metric-label"><SunMedium aria-hidden="true" />Solar today</span><span className="metric-dot" style={{ background: 'var(--energy-solar)' }} /></div>
      <div className="metric-value"><CountUp value={solarToday} digits={1} /><span> kWh</span></div>
      <p>{fresh ? (now >= ACTIVE_W ? `Producing ${(now / 1000).toFixed(2)} kW right now` : 'Not producing right now') : 'Recorded day total'}</p>
      <div className="stat-list">
        <Stat label="Peak output" value={peak == null ? '—' : `${(peak / 1000).toFixed(2)} kW${today?.peakSolarAt ? ' · ' + today.peakSolarAt.slice(0, 5) : ''}`} />
        <Stat label="Self-sufficiency" value={selfSufficiency == null ? '—' : selfSufficiency + '%'} />
        <Stat label="Grid import" value={kwh(today?.gridKwh)} />
        <Stat label="Home used" value={kwh(today?.homeKwh)} />
      </div>
    </Card>
  );
}

export function BatteryCard({ snapshot, capacity, reserve, today }: { snapshot: EnergySnapshot; capacity: number; reserve: number; today: Today }) {
  const soc = snapshot.soc, stored = soc === null ? null : (capacity * soc) / 100, rate = Math.abs(snapshot.battery) / 1000;
  const charging = snapshot.battery > ACTIVE_W, discharging = snapshot.battery < -ACTIVE_W;
  let status = soc === null ? 'No reading' : discharging || charging ? '' : 'Resting';
  if (soc !== null && (charging || discharging) && snapshot.fresh) {
    const eta = charging ? duration((capacity * (100 - soc)) / 100 / rate) : soc > reserve ? duration((capacity * (soc - reserve)) / 100 / rate) : null;
    status = charging ? `Charging ${rate.toFixed(2)} kW${eta ? ' · full in ' + eta : ''}` : soc > reserve ? `Discharging ${rate.toFixed(2)} kW${eta ? ' · ' + eta + ' to reserve' : ''}` : `Below reserve · discharging ${rate.toFixed(2)} kW`;
  } else if (soc !== null && !snapshot.fresh) status = 'Last recorded level';
  const tone = soc !== null && soc < reserve ? 'low' : charging ? 'charging' : 'ok';
  return (
    <Card className="metric-card energy-card" data-tone="battery">
      <div className="metric-top"><span className="metric-label"><BatteryMedium aria-hidden="true" />Battery stored</span><span className="metric-chip">{soc === null ? '—' : Math.round(soc) + '%'}</span></div>
      <div className="metric-value"><CountUp value={stored} digits={1} /><span> kWh</span></div>
      <div className="soc-meter" data-tone={tone} role="img" aria-label={soc === null ? 'Charge unknown' : `${Math.round(soc)} percent charged, reserve ${reserve} percent`}>
        <span className="soc-fill" style={{ width: `${Math.max(0, Math.min(100, soc ?? 0))}%` }} />
        <i className="soc-reserve" style={{ left: `${reserve}%` }} />
      </div>
      <p>{status}</p>
      <div className="stat-list">
        <Stat label="Usable above reserve" value={stored === null ? '—' : Math.max(0, (capacity * ((soc ?? 0) - reserve)) / 100).toFixed(1) + ' kWh'} />
        <Stat label="Charged today" value={kwh(today?.batteryChargeKwh)} />
        <Stat label="Discharged today" value={kwh(today?.batteryDischargeKwh)} />
      </div>
    </Card>
  );
}
