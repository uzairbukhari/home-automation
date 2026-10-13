'use client';
import { useEffect, useState } from 'react';
import { readJson } from '@/lib/client-data';
import type { TimelineEvent } from '@/lib/events-timeline';

const KIND_LABEL: Record<TimelineEvent['kind'], string> = {
  alarm: 'Alarm',
  online: 'Online',
  offline: 'Offline',
  other: 'Event',
};

export function EventsPanel() {
  const [days, setDays] = useState(30),
    [events, setEvents] = useState<TimelineEvent[] | null>(null),
    [error, setError] = useState(''),
    [only, setOnly] = useState<'all' | 'alarm' | 'offline'>('all');
  useEffect(() => {
    let active = true;
    readJson<{ events: TimelineEvent[] }>(`/api/events?days=${days}`)
      .then((data) => {
        if (active) {
          setEvents(data.events);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [days]);
  const shown = (events ?? []).filter((e) => only === 'all' || e.kind === only);
  return (
    <section className="panel feature-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Health</span>
          <h2>Alerts & events</h2>
          <p>Inverter alarms and device online and offline events from the provider history.</p>
        </div>
      </div>
      <div className="feature-toolbar">
        <label>
          Period
          <select
            value={days}
            onChange={(e) => {
              setEvents(null);
              setDays(Number(e.target.value));
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <label>
          Show
          <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="all">Everything</option>
            <option value="alarm">Inverter alarms</option>
            <option value="offline">Went offline</option>
          </select>
        </label>
      </div>
      {error && <p className="device-notice">{error}</p>}
      {!error && events === null && <p className="report-footnote">Loading events…</p>}
      {!error && events !== null && !shown.length && <p className="report-footnote">No events in this period.</p>}
      {shown.length > 0 && (
        <ul className="event-list" aria-label="Alerts and events, newest first">
          {shown.map((e, i) => (
            <li key={e.time + e.source + i} data-kind={e.kind}>
              <time dateTime={e.time}>
                {new Date(e.time).toLocaleString('en-PK', {
                  timeZone: 'Asia/Karachi',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <strong>{e.title}</strong>
              <span>
                {e.source} · {KIND_LABEL[e.kind]}
                {e.detail ? ` · ${e.detail}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
