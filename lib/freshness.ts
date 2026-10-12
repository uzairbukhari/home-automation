export const DEFAULT_CADENCE = { dessmonitor: 300_000, tuya: 300_000 } as const;
export function freshness(observedAt: string | null | undefined, intervalMs = 300_000, now = Date.now()) {
  const stamp = observedAt ? Date.parse(observedAt) : NaN;
  const ageMs = now - stamp;
  return { observedAt: observedAt ?? null, ageMs: Number.isFinite(ageMs) ? Math.max(0, ageMs) : null,
    stale: !Number.isFinite(stamp) || stamp > now + 5000 || ageMs > intervalMs * 2 + 60_000,
    expectedIntervalSeconds: intervalMs / 1000 };
}
export function freshnessLabel(observedAt: string | null | undefined, now = Date.now()) {
  const age = observedAt ? now - Date.parse(observedAt) : NaN;
  if (!Number.isFinite(age)) return 'No update yet';
  if (age < 60_000) return 'Updated just now';
  if (age < 3_600_000) return `Updated ${Math.floor(age / 60_000)} min ago`;
  return `Updated ${Math.floor(age / 3_600_000)} hr ago`;
}
