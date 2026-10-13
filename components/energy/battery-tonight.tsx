'use client';
import { useEffect, useState } from 'react';
import { MoonStar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { readJson } from '@/lib/client-data';
import { batteryTonight, tonightVerdict, type TypicalHour } from '@/lib/energy-insights';
import { localTime } from '@/lib/measurements';
import type { DessSnapshot } from '@/lib/providers/dessmonitor';

/** Whether the charge above reserve covers the shortfall between sunset and sunrise at the user's typical use. */
export function BatteryTonight({
  live,
  capacity,
  reserve,
}: {
  live: DessSnapshot | null;
  capacity: number;
  reserve: number;
}) {
  const [typical, setTypical] = useState<TypicalHour[] | null>(null),
    soc = live?.readings.find((r) => r.metric === 'battery_soc')?.value ?? null;
  useEffect(() => {
    let active = true;
    readJson<{ typicalDay?: TypicalHour[] | null }>('/api/reports?range=month')
      .then((data) => active && setTypical(data.typicalDay ?? []))
      .catch(() => active && setTypical([]));
    return () => {
      active = false;
    };
  }, []);
  if (soc === null || typical === null) return null;
  const [h, m] = localTime(new Date().toISOString()).split(':').map(Number),
    forecast = batteryTonight({ soc, capacityKwh: capacity, reservePct: reserve, nowHour: h + m / 60, typical });
  return (
    <Card className="panel tonight-card">
      <div className="metric-top">
        <span className="metric-label">
          <MoonStar aria-hidden="true" />
          Will the battery last tonight?
        </span>
      </div>
      <p className="verdict">{tonightVerdict(forecast)}</p>
    </Card>
  );
}
