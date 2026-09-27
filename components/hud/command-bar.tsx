"use client";

import { useSyncExternalStore } from "react";
import { Radio, TriangleAlert } from "lucide-react";
import { StatusLed, type LedStatus } from "./status-led";

function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

/** Ticking wall clock, client-only (server/client would disagree on "now" and mismatch on hydration). */
function useClock(): string | null {
  return useSyncExternalStore(
    subscribeClock,
    () => new Date().toLocaleTimeString([], { hour12: false }),
    () => null // SSR snapshot: no reliable "now" until hydrated
  );
}

export function CommandBar({
  dessOk,
  tuyaOk,
  alertCount,
}: {
  dessOk: boolean | null;
  tuyaOk: boolean | null;
  alertCount: number;
}) {
  const clock = useClock();
  const overall: LedStatus = dessOk === false || tuyaOk === false ? "critical" : dessOk == null ? "idle" : "good";

  return (
    <div className="w-full flex items-center justify-between gap-4 px-4 md:px-6 py-2.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-0)_75%,transparent)] backdrop-blur-xl sticky top-0 z-30">
      <div className="flex items-center gap-2 min-w-0">
        <Radio size={13} className="text-[var(--hud-accent)]" />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] hidden sm:inline">
          Home Grid
        </span>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-1.5" title="DessMonitor link">
          <StatusLed status={dessOk === false ? "critical" : dessOk == null ? "idle" : "good"} />
          <span className="font-readout text-[10px] text-[var(--text-muted)] hidden md:inline">INV</span>
        </div>
        <div className="flex items-center gap-1.5" title="Tuya link">
          <StatusLed status={tuyaOk === false ? "critical" : tuyaOk == null ? "idle" : "good"} />
          <span className="font-readout text-[10px] text-[var(--text-muted)] hidden md:inline">TUYA</span>
        </div>

        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 text-[var(--status-warning)]">
            <TriangleAlert size={13} />
            <span className="font-readout text-xs">{alertCount}</span>
          </div>
        )}

        <span className="font-readout text-xs text-[var(--text-secondary)] tabular-nums min-w-[64px] text-right">
          {clock ?? "--:--:--"}
        </span>
        <StatusLed status={overall} pulse={overall !== "idle"} />
      </div>
    </div>
  );
}
