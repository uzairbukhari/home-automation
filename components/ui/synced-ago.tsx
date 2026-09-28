"use client";

import { useSyncExternalStore } from "react";

function subscribeTick(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

/**
 * "Synced Ns ago", ticking every second. Renders a placeholder until
 * mounted — `Date.now()` at render time would differ between the server
 * render and the client hydration pass by however many ms elapsed in
 * between, producing a hydration text mismatch for even a 1s difference.
 */
export function SyncedAgo({ ts }: { ts: string }) {
  const seconds = useSyncExternalStore(
    subscribeTick,
    () => Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000)),
    () => null // SSR snapshot: no reliable "now" until hydrated
  );

  if (seconds == null) return <>Updating…</>;
  return <>Updated {seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`} ago</>;
}
