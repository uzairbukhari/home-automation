'use client';
import { useEffect, useState } from 'react';
import { readJson, foregroundPoll } from '@/lib/client-data';
import { localTime } from '@/lib/measurements';
import { sortedPoints, type SolarPoint } from '@/lib/solar-energy';
import type { HistorySnapshot } from '@/lib/providers/dessmonitor';

export function withGaps(points: SolarPoint[], maxGapMs = 900000) {
  const result: Array<SolarPoint & { stamp: number }> = [];
  for (const p of sortedPoints(points)) {
    const stamp = Date.parse(p.sourceTimestamp),
      previous = result.at(-1);
    if (previous && stamp - previous.stamp > maxGapMs)
      result.push({ ...p, stamp: previous.stamp + 1, solar: null, home: null, grid: null, battery: null });
    result.push({ ...p, stamp });
  }
  return result;
}
export function useHistory(range: string, from?: string, to?: string, enabled = true) {
  const [data, setData] = useState<HistorySnapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
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
      setError('');
      try {
        const params = new URLSearchParams({ range });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const body = await readJson<HistorySnapshot & { error?: string; refreshing?: boolean }>(
          `/api/solar/history?${params}`,
        );
        if (controller.signal.aborted) return;
        setData(body);
        follow(body.refreshing);
        if (body.error) setError(`Saved history · ${body.error}`);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'History unavailable');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    queueMicrotask(() => {
      if (!controller.signal.aborted) setData(null);
    });
    const stop = foregroundPoll(() => void refresh(), 300000);
    return () => {
      controller.abort();
      clearTimeout(retry);
      stop();
    };
  }, [range, from, to, enabled]);
  return { data, error, loading };
}
export function stampLabel(stamp: number, short = false) {
  return short
    ? localTime(new Date(stamp).toISOString())
    : new Date(stamp).toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}
