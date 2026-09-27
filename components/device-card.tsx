"use client";

import { useState, useTransition } from "react";
import * as Switch from "@radix-ui/react-switch";
import { Plug, Lightbulb, Thermometer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusLed } from "@/components/hud/status-led";

export interface DeviceStatusItem {
  code: string;
  value: string | number | boolean;
}

export interface DeviceCardData {
  id: string;
  name: string;
  category: string;
  online: boolean;
  room: string | null;
  status: DeviceStatusItem[];
  powerW?: number | null;
  kwhToday?: number;
}

// Category codes that expose on/off switch DP(s), per Tuya's standard
// instruction set — confirmed with `npm run tuya:probe` against a real
// account: cz/kg (plugs, switch boards), dlq (metered plug, e.g. "WIFI
// Smart Meter Pro"), tdq (metered breaker-style plug, e.g. a "WBP-1G").
const SWITCH_CATEGORIES = new Set(["cz", "kg", "pc", "dlq", "tdq"]);

// Matches "switch", "switch_1".."switch_9", "switch_led" — a multi-gang
// switch board (e.g. a "4 Gang" wall switch) reports one code per gang, and
// each needs its own independent toggle, not a single combined on/off.
const SWITCH_CODE_RE = /^switch(_(led|\d+))?$/;

function switchLabel(code: string): string {
  const m = code.match(/^switch_(\d+)$/);
  return m ? m[1] : "Power";
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  dj: Lightbulb,
  wsdcg: Thermometer,
  mcs: Thermometer,
};

function SwitchToggle({
  deviceId,
  code,
  initialOn,
  online,
}: {
  deviceId: string;
  code: string;
  initialOn: boolean;
  online: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setOn(next); // optimistic
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tuya/${deviceId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: [{ code, value: next }] }),
        });
        if (!res.ok) throw new Error("command failed");
      } catch {
        setOn(!next); // revert
      }
    });
  }

  return (
    <Switch.Root
      checked={on}
      onCheckedChange={toggle}
      disabled={pending || !online}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[11px] font-readout font-medium transition-colors disabled:opacity-40 border",
        on
          ? "bg-[color-mix(in_srgb,var(--status-good)_18%,transparent)] text-[var(--status-good)] border-[color-mix(in_srgb,var(--status-good)_45%,transparent)] shadow-[0_0_10px_-3px_var(--status-good)]"
          : "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent"
      )}
    >
      {switchLabel(code)}: {on ? "ON" : "OFF"}
      <Switch.Thumb className="sr-only" />
    </Switch.Root>
  );
}

export function DeviceCard({ device }: { device: DeviceCardData }) {
  const switchItems = device.status.filter((s) => SWITCH_CODE_RE.test(s.code) && typeof s.value === "boolean");
  const controllable = SWITCH_CATEGORIES.has(device.category) && switchItems.length > 0;
  const Icon = CATEGORY_ICONS[device.category] ?? Plug;

  const statusPower = device.status.find((s) => s.code === "cur_power")?.value;
  const powerW = device.powerW ?? (typeof statusPower === "number" ? statusPower / 10 : null);
  const anyOn = switchItems.some((s) => s.value === true);

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="rounded-lg p-2 shrink-0"
            style={{
              backgroundColor: anyOn
                ? "color-mix(in srgb, var(--hud-accent) 16%, transparent)"
                : "color-mix(in srgb, var(--text-muted) 12%, transparent)",
              color: anyOn ? "var(--hud-accent)" : "var(--text-muted)",
              boxShadow: anyOn ? "0 0 10px -3px var(--hud-accent)" : undefined,
            }}
          >
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{device.name}</p>
            {device.room && <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{device.room}</p>}
          </div>
        </div>
        <StatusLed status={device.online ? "good" : "idle"} pulse={false} />
      </div>

      {(powerW != null || device.kwhToday != null) && (
        <div className="flex items-center gap-3 font-readout text-xs text-[var(--text-secondary)]">
          {powerW != null && (
            <span className="tabular-nums">
              <span className="text-[var(--text-primary)] font-medium">{powerW.toFixed(1)}</span> W
            </span>
          )}
          {device.kwhToday != null && device.kwhToday > 0 && (
            <span className="tabular-nums text-[var(--text-muted)]">{device.kwhToday.toFixed(2)} kWh today</span>
          )}
        </div>
      )}

      {controllable ? (
        <div className="flex flex-wrap gap-2">
          {switchItems.map((s) => (
            <SwitchToggle
              key={s.code}
              deviceId={device.id}
              code={s.code}
              initialOn={Boolean(s.value)}
              online={device.online}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {device.status.slice(0, 4).map((s) => (
            <span key={s.code} className="text-xs text-[var(--text-muted)]">
              {s.code}: <span className="text-[var(--text-secondary)]">{String(s.value)}</span>
            </span>
          ))}
          {device.status.length === 0 && !device.online && (
            <span className="text-xs text-[var(--text-muted)]">Offline</span>
          )}
        </div>
      )}
    </div>
  );
}
