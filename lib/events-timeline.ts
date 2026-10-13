import { database } from './jobs';

export type TimelineEvent = { time: string; provider: 'dessmonitor' | 'tuya'; source: string; kind: 'alarm' | 'online' | 'offline' | 'other'; title: string; detail: string | null };

// Tuya device log event ids that matter on a timeline; anything else is shown generically.
const TUYA_EVENTS: Record<string, [TimelineEvent['kind'], string]> = { '1': ['online', 'Came online'], '2': ['offline', 'Went offline'], '3': ['other', 'Activated'], '4': ['other', 'Reset'], '5': ['other', 'Firmware update'] };

function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }

export function describeEvent(row: { provider: string; kind: string; code: string; data: string }, name: string): Omit<TimelineEvent, 'time'> {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.data) as Record<string, unknown>; } catch { /* a malformed row still shows its code */ }
  if (row.provider === 'dessmonitor') {
    const title = text(data.desc) ?? text(data.descEn) ?? text(data.name) ?? text(data.msg) ?? text(data.title) ?? (row.code ? `Alarm ${row.code}` : 'Inverter alarm');
    return { provider: 'dessmonitor', source: name, kind: 'alarm', title, detail: row.code ? `Code ${row.code}` : null };
  }
  const known = TUYA_EVENTS[row.kind], detail = [text(data.code), data.value === undefined || data.value === null ? null : String(data.value)].filter(Boolean).join(': ') || null;
  return { provider: 'tuya', source: name, kind: known?.[0] ?? 'other', title: known?.[1] ?? `Device event ${row.kind}`, detail };
}

/** Alarms and device events from the provider history we already collect, newest first. */
export async function eventsTimeline(days: number, limit = 200) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await database().prepare(`SELECT e.provider,e.entity_id,e.event_time,e.kind,e.code,e.data,COALESCE(NULLIF(d.alias,''),c.name) name FROM provider_events e
    LEFT JOIN device_catalog c ON c.id=e.entity_id LEFT JOIN device_details d ON d.device_id=e.entity_id WHERE e.event_time>=? ORDER BY e.event_time DESC LIMIT ?`)
    .bind(since, limit).all<{ provider: string; entity_id: string; event_time: string; kind: string; code: string; data: string; name: string | null }>();
  return rows.results.map(row => ({ time: row.event_time, ...describeEvent(row, row.name ?? (row.provider === 'dessmonitor' ? 'Inverter' : row.entity_id)) }) as TimelineEvent);
}
