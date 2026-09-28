"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Home, Zap, BatteryCharging, UtilityPole, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  pvW: number;
  loadW: number;
  batteryW: number; // + charging, - discharging
  gridW: number | null; // + importing, - exporting
  batterySoc: number; // %
  mode: string | null;
}

// Each path runs from an outer node toward the inverter hub in the middle
// (the hub's solid disc covers the path ends). Points are given as
// fractions of the scene and converted to pixels of the measured box, so
// the moving dot stays round at every width.
function curve(w: number, h: number, x0: number, y0: number): string {
  const [ax, ay, cx, cy] = [x0 * w, y0 * h, 0.5 * w, 0.52 * h];
  const mid = (ax + cx) / 2;
  return `M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${cy}, ${cx} ${cy}`;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 900, h: 420 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const ACTIVE_W = 10;

function FlowPath({
  d,
  color,
  active,
  towardHub,
  magnitudeW,
}: {
  d: string;
  color: string;
  active: boolean;
  towardHub: boolean;
  magnitudeW: number;
}) {
  // Faster dot for more power: 3.2s at idle-ish, ~1.4s near 3 kW.
  const duration = Math.max(1.4, 3.2 - Math.min(magnitudeW, 3000) / 1700);
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={active ? color : "var(--border)"}
        strokeOpacity={active ? 0.75 : 1}
        strokeWidth={1.6}
        strokeLinecap="round"
        className={cn(active && "flow-path", active && !towardHub && "flow-path-reverse")}
        strokeDasharray={active ? undefined : "3 7"}
      />
      {active && (
        <circle r={3.5} fill={color} className="flow-dot">
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            path={d}
            keyPoints={towardHub ? "0;1" : "1;0"}
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      )}
    </g>
  );
}

function Node({
  icon: Icon,
  label,
  value,
  unit,
  caption,
  color,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  caption?: string;
  color: string;
  className: string;
}) {
  return (
    <div className={cn("absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center", className)}>
      <span
        className="grid size-12 md:size-[54px] place-items-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)]"
        style={{ color }}
      >
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <span className="mt-3 text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="mt-0.5 text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {value}
        <span className="ml-1 text-xs font-semibold text-[var(--text-muted)]">{unit}</span>
      </span>
      {caption && <span className="mt-0.5 text-[11px] text-[var(--text-muted)]">{caption}</span>}
    </div>
  );
}

const kw = (w: number) => (Math.abs(w) / 1000).toFixed(2);

export function PowerScene({ pvW, loadW, batteryW, gridW, batterySoc, mode }: Props) {
  const charging = batteryW > ACTIVE_W;
  const discharging = batteryW < -ACTIVE_W;
  const importing = (gridW ?? 0) > ACTIVE_W;
  const exporting = (gridW ?? 0) < -ACTIVE_W;

  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const PATHS = {
    solar: curve(w, h, 0.22, 0.3),
    battery: curve(w, h, 0.22, 0.76),
    home: curve(w, h, 0.78, 0.3),
    grid: curve(w, h, 0.78, 0.76),
  };

  return (
    <div ref={ref} className="relative h-[360px] md:h-[420px] w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <FlowPath d={PATHS.solar} color="var(--series-4)" active={pvW > ACTIVE_W} towardHub magnitudeW={pvW} />
        <FlowPath
          d={PATHS.battery}
          color="var(--series-3)"
          active={charging || discharging}
          towardHub={discharging}
          magnitudeW={Math.abs(batteryW)}
        />
        <FlowPath d={PATHS.home} color="var(--series-1)" active={loadW > ACTIVE_W} towardHub={false} magnitudeW={loadW} />
        <FlowPath
          d={PATHS.grid}
          color="var(--series-2)"
          active={importing || exporting}
          towardHub={importing}
          magnitudeW={Math.abs(gridW ?? 0)}
        />
      </svg>

      <Node icon={Sun} label="Solar" value={kw(pvW)} unit="kW" color="var(--series-4)" className="left-[12%] top-[30%]" />
      <Node
        icon={BatteryCharging}
        label="Battery"
        value={Math.round(batterySoc).toString()}
        unit="%"
        caption={charging ? `Charging ${kw(batteryW)} kW` : discharging ? `Discharging ${kw(batteryW)} kW` : "Idle"}
        color="var(--series-3)"
        className="left-[12%] top-[76%]"
      />
      <Node icon={Home} label="Home load" value={kw(loadW)} unit="kW" color="var(--series-1)" className="left-[88%] top-[30%]" />
      <Node
        icon={UtilityPole}
        label={exporting ? "Grid export" : "Grid import"}
        value={gridW == null ? "—" : kw(gridW)}
        unit="kW"
        color="var(--series-2)"
        className="left-[88%] top-[76%]"
      />

      <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2">
        <div className="grid size-[112px] md:size-[140px] place-items-center rounded-full border border-[#2b5566] bg-[radial-gradient(circle_at_50%_35%,#14304a,#0c1728_70%)] shadow-[0_0_0_10px_rgba(88,225,247,0.04),0_0_60px_rgba(88,225,247,0.08)]">
          <div className="flex flex-col items-center px-3 text-center">
            <Zap size={24} strokeWidth={1.75} className="text-[var(--accent)]" />
            <span className="mt-1.5 text-xs md:text-sm text-[var(--text-secondary)]">Hybrid inverter</span>
            <span className="mt-0.5 text-xs md:text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{mode ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
