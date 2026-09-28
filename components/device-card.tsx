"use client";

import { useState, useTransition } from "react";
import * as Switch from "@radix-ui/react-switch";
import { Plug, Lightbulb, Thermometer, Gauge, ToggleRight, DoorOpen, Router, Activity, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return m ? `Gang ${m[1]}` : code === "switch_led" ? "Light" : "Power";
}

const CATEGORY_INFO: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  cz: { label: "Smart socket", icon: Plug, color: "var(--series-7)" },
  pc: { label: "Power strip", icon: Plug, color: "var(--series-7)" },
  kg: { label: "Wall switch", icon: ToggleRight, color: "var(--series-3)" },
  dlq: { label: "Energy meter", icon: Gauge, color: "var(--series-1)" },
  tdq: { label: "Breaker", icon: Gauge, color: "var(--series-1)" },
  dj: { label: "Smart light", icon: Lightbulb, color: "var(--series-4)" },
  wsdcg: { label: "Climate sensor", icon: Thermometer, color: "var(--series-5)" },
  mcs: { label: "Door sensor", icon: DoorOpen, color: "var(--series-5)" },
  wg2: { label: "Gateway", icon: Router, color: "var(--series-2)" },
};

export function categoryInfo(category: string) {
  return CATEGORY_INFO[category] ?? { label: "Tuya device", icon: Plug, color: "var(--series-2)" };
}

function SwitchToggle({
  deviceId,
  code,
  label,
  initialOn,
  online,
}: {
  deviceId: string;
  code: string;
  label: string;
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
    <label className={cn("flex items-center gap-2 text-xs", online ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]")}>
      <Switch.Root
        checked={on}
        onCheckedChange={toggle}
        disabled={pending || !online}
        aria-label={`${label} ${on ? "on" : "off"}`}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)] bg-[var(--surface-3)]"
        )}
      >
        <Switch.Thumb
          className={cn(
            "block size-3.5 rounded-full shadow transition-transform",
            on ? "translate-x-[18px] bg-[var(--accent-foreground)]" : "translate-x-[2px] bg-[var(--text-muted)]"
          )}
        />
      </Switch.Root>
      {label}
    </label>
  );
}

export function DeviceCard({ device }: { device: DeviceCardData }) {
  const switchItems = device.status.filter((s) => SWITCH_CODE_RE.test(s.code) && typeof s.value === "boolean");
  const controllable = SWITCH_CATEGORIES.has(device.category) && switchItems.length > 0;
  const { label: kind, icon: Icon, color } = categoryInfo(device.category);

  const statusPower = device.status.find((s) => s.code === "cur_power")?.value;
  const powerW = device.powerW ?? (typeof statusPower === "number" ? statusPower / 10 : null);
  const brightness = device.status.find((s) => s.code === "bright_value_v2" || s.code === "bright_value")?.value;
  const anyOn = switchItems.some((s) => s.value === true);

  const reading =
    powerW != null
      ? { value: powerW >= 1000 ? (powerW / 1000).toFixed(2) : powerW.toFixed(1), unit: powerW >= 1000 ? "kW" : "W" }
      : typeof brightness === "number"
        ? { value: Math.round(brightness / 10).toString(), unit: "%" }
        : controllable
          ? { value: anyOn ? "On" : "Off", unit: "" }
          : null;

  return (
    <div className={cn("tile flex flex-col gap-4 p-4 transition-colors hover:border-[var(--border-strong)]", !device.online && "opacity-75")}>
      <div className="flex items-start gap-3.5">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-3)]"
          style={{ color: device.online ? color : "var(--text-muted)" }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-[var(--text-primary)]" title={device.name}>
            {device.name}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {device.room ?? "Unassigned"} · {kind}
          </p>
          <p className={cn("mt-1.5 flex items-center gap-1 text-xs", device.online ? "text-[var(--status-good)]" : "text-[var(--text-muted)]")}>
            {device.online ? <Activity size={12} /> : <WifiOff size={12} />}
            {device.online ? "Online" : "Offline"}
          </p>
        </div>
        {reading && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold tabular-nums leading-tight text-[var(--text-primary)]">
              {reading.value}
              {reading.unit && <span className="ml-0.5 text-xs font-semibold text-[var(--text-muted)]">{reading.unit}</span>}
            </p>
            {device.kwhToday != null && device.kwhToday > 0 && (
              <p className="text-[11px] tabular-nums text-[var(--text-muted)]">{device.kwhToday.toFixed(2)} kWh today</p>
            )}
          </div>
        )}
      </div>

      {controllable && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--border)] pt-3">
          {switchItems.map((s) => (
            <SwitchToggle
              key={s.code}
              deviceId={device.id}
              code={s.code}
              label={switchItems.length > 1 ? switchLabel(s.code) : "Power"}
              initialOn={Boolean(s.value)}
              online={device.online}
            />
          ))}
        </div>
      )}
    </div>
  );
}
