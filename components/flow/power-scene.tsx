"use client";

import { Sun, Home, Zap, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, ZapOff } from "lucide-react";
import { formatWatts } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { arcPath } from "@/lib/svg-arc";

interface Props {
  pvW: number;
  loadW: number;
  batteryW: number; // + charging, - discharging
  gridW: number | null; // + importing, - exporting
  batterySoc: number; // %
  mode: string | null;
  panelKwp?: number;
  inverterTempC?: number | null;
}

const W = 480;
const H = 360;
const CENTER = { x: W / 2, y: H / 2 };
const NODES = {
  sun: { x: W / 2, y: 46 },
  grid: { x: W - 70, y: H / 2 },
  battery: { x: 70, y: H / 2 },
  home: { x: W / 2, y: H - 46 },
};

function isOutage(gridW: number | null, mode: string | null): boolean {
  const modeLower = mode?.toLowerCase() ?? "";
  return (gridW == null || Math.abs(gridW) < 1) && (modeLower.includes("battery") || modeLower.includes("off-grid"));
}

function FlowLine({
  from,
  to,
  active,
  magnitudeW,
  reverse,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  active: boolean;
  magnitudeW: number;
  reverse?: boolean;
  color: string;
}) {
  const width = active ? Math.min(6, 1.5 + Math.abs(magnitudeW) / 400) : 1.5;
  const speed = active ? Math.max(0.25, 1.4 - Math.abs(magnitudeW) / 2500) : 0;
  const particleSpeed = active ? Math.max(0.8, 2.4 - Math.abs(magnitudeW) / 1500) : 0;
  const pathD = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const [start, end] = reverse ? [to, from] : [from, to];
  const particleOffsetPath = `path("M ${start.x} ${start.y} L ${end.x} ${end.y}")`;
  const particleCount = active ? Math.min(3, 1 + Math.floor(Math.abs(magnitudeW) / 800)) : 0;

  return (
    <g>
      <path
        d={pathD}
        stroke={active ? color : "var(--gridline)"}
        strokeWidth={width}
        strokeLinecap="round"
        fill="none"
        className={cn(active && "flow-path", active && reverse && "flow-path-reverse")}
        style={active ? { animationDuration: `${speed}s`, opacity: 0.9 } : { opacity: 0.4 }}
      />
      {active &&
        Array.from({ length: particleCount }).map((_, i) => (
          <circle
            key={i}
            r={3}
            fill={color}
            className="flow-particle"
            style={{
              offsetPath: particleOffsetPath,
              animationDuration: `${particleSpeed}s`,
              animationDelay: `${(i * particleSpeed) / particleCount}s`,
              filter: `drop-shadow(0 0 3px ${color})`,
            }}
          />
        ))}
    </g>
  );
}

function NodeLabel({
  pos,
  label,
  value,
  color,
  sub,
}: {
  pos: { x: number; y: number };
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <foreignObject x={pos.x - 50} y={pos.y + 34} width={100} height={40}>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
        <span className="font-readout text-xs font-medium" style={{ color }}>
          {value}
        </span>
        {sub && <span className="text-[9px] text-[var(--text-muted)]">{sub}</span>}
      </div>
    </foreignObject>
  );
}

function SolarNode({ pos, pvW, panelKwp }: { pos: { x: number; y: number }; pvW: number; panelKwp: number }) {
  const color = "var(--series-4)";
  const capacityPct = Math.min(100, (pvW / (panelKwp * 1000)) * 100);
  const active = pvW > 5;
  return (
    <g>
      <circle
        cx={pos.x}
        cy={pos.y}
        r={22}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="2 3"
        opacity={active ? 0.7 : 0.25}
        className={active ? "spin-slow" : undefined}
        style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
      />
      <circle
        cx={pos.x}
        cy={pos.y}
        r={16}
        fill={`color-mix(in srgb, ${color} ${active ? 20 : 8}%, transparent)`}
        style={active ? { filter: `drop-shadow(0 0 ${6 + capacityPct / 8}px ${color})` } : undefined}
      />
      <foreignObject x={pos.x - 12} y={pos.y - 12} width={24} height={24}>
        <Sun size={20} style={{ color }} />
      </foreignObject>
      <NodeLabel pos={pos} label="Solar" value={formatWatts(pvW)} color={color} sub={`${Math.round(capacityPct)}% cap.`} />
    </g>
  );
}

const GAUGE_SIZE = 56;
const GAUGE_STROKE = 6;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_START = 135;
const GAUGE_SWEEP = 270;

function BatteryNode({
  pos,
  socPercent,
  batteryW,
}: {
  pos: { x: number; y: number };
  socPercent: number;
  batteryW: number;
}) {
  const clamped = Math.min(100, Math.max(0, socPercent));
  const charging = batteryW > 5;
  const discharging = batteryW < -5;
  const color = "var(--series-3)";
  const cx = GAUGE_SIZE / 2;
  const cy = GAUGE_SIZE / 2;
  const trackPath = arcPath(cx, cy, GAUGE_RADIUS, GAUGE_START, GAUGE_START + GAUGE_SWEEP);
  const valueEndAngle = GAUGE_START + (GAUGE_SWEEP * clamped) / 100;
  const valuePath = arcPath(cx, cy, GAUGE_RADIUS, GAUGE_START, valueEndAngle);
  const Icon = charging ? BatteryCharging : clamped < 20 ? BatteryLow : clamped < 70 ? BatteryMedium : BatteryFull;

  return (
    <g>
      <foreignObject x={pos.x - 45} y={pos.y - 40} width={90} height={80}>
        <div className="flex flex-col items-center gap-1">
          <div className="relative" style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 60%, transparent))` }}>
            <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
              <path d={trackPath} stroke="var(--gridline)" strokeWidth={GAUGE_STROKE} strokeLinecap="round" fill="none" />
              <path d={valuePath} stroke={color} strokeWidth={GAUGE_STROKE} strokeLinecap="round" fill="none" />
              {/* Rising / falling charge bubbles inside the ring */}
              {(charging || discharging) &&
                [0, 0.6, 1.2].map((delay, i) => (
                  <circle
                    key={i}
                    cx={cx + (i - 1) * 6}
                    cy={discharging ? 12 : GAUGE_SIZE - 12}
                    r={1.6}
                    fill={color}
                    className="rise-fade"
                    style={{
                      animationDelay: `${delay}s`,
                      animationDirection: discharging ? "reverse" : "normal",
                    }}
                  />
                ))}
            </svg>
            <Icon size={14} style={{ color }} className="absolute inset-0 m-auto" />
          </div>
        </div>
      </foreignObject>
      <NodeLabel
        pos={pos}
        label={charging ? "Charging" : discharging ? "Discharging" : "Battery idle"}
        value={`${Math.round(clamped)}% · ${charging ? "+" : discharging ? "-" : ""}${formatWatts(Math.abs(batteryW))}`}
        color={color}
      />
    </g>
  );
}

function GridNode({ pos, gridW, outage }: { pos: { x: number; y: number }; gridW: number | null; outage: boolean }) {
  const color = outage ? "var(--status-critical)" : "var(--series-2)";
  const importing = (gridW ?? 0) > 5;
  const exporting = (gridW ?? 0) < -5;
  return (
    <g className={outage ? "flicker" : undefined}>
      <circle
        cx={pos.x}
        cy={pos.y}
        r={16}
        fill={`color-mix(in srgb, ${color} ${importing || exporting || outage ? 20 : 8}%, transparent)`}
        style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 60%, transparent))` }}
      />
      <foreignObject x={pos.x - 12} y={pos.y - 12} width={24} height={24}>
        {outage ? <ZapOff size={20} style={{ color }} /> : <Zap size={20} style={{ color }} />}
      </foreignObject>
      <NodeLabel
        pos={pos}
        label={outage ? "Grid — outage" : "Grid"}
        value={outage ? "OFFLINE" : gridW == null ? "—" : formatWatts(Math.abs(gridW))}
        color={color}
      />
    </g>
  );
}

function HomeNode({ pos, loadW }: { pos: { x: number; y: number }; loadW: number }) {
  const color = "var(--series-1)";
  const active = loadW > 5;
  const intensity = Math.min(1, loadW / 2000);
  return (
    <g>
      <circle
        cx={pos.x}
        cy={pos.y}
        r={16}
        fill={`color-mix(in srgb, ${color} ${active ? 14 + intensity * 16 : 8}%, transparent)`}
        style={active ? { filter: `drop-shadow(0 0 ${5 + intensity * 8}px ${color})` } : undefined}
      />
      <foreignObject x={pos.x - 12} y={pos.y - 12} width={24} height={24}>
        <Home size={20} style={{ color }} />
      </foreignObject>
      <NodeLabel pos={pos} label="Home" value={formatWatts(loadW)} color={color} />
    </g>
  );
}

function InverterHub({
  mode,
  throughputW,
  tempC,
}: {
  mode: string | null;
  throughputW: number;
  tempC?: number | null;
}) {
  const spinDuration = Math.max(2, 12 - throughputW / 400);
  return (
    <g>
      <circle
        cx={CENTER.x}
        cy={CENTER.y}
        r={26}
        fill="none"
        stroke="var(--hud-accent)"
        strokeWidth={1}
        strokeDasharray="1 4"
        opacity={0.5}
        className="spin-slow-reverse"
        style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px`, animationDuration: `${spinDuration * 1.4}s` }}
      />
      <circle
        cx={CENTER.x}
        cy={CENTER.y}
        r={22}
        fill="var(--surface-2)"
        stroke="var(--border)"
        style={{ filter: "drop-shadow(0 0 10px rgba(53,184,255,.25))" }}
      />
      <foreignObject x={CENTER.x - 12} y={CENTER.y - 12} width={24} height={24}>
        <Zap size={22} className="text-[var(--hud-accent)]" />
      </foreignObject>
      <foreignObject x={CENTER.x - 60} y={CENTER.y + 30} width={120} height={30}>
        <div className="flex flex-col items-center">
          <span className="font-readout text-[10px] text-[var(--text-secondary)] truncate max-w-full">
            {mode ?? "—"}
          </span>
          {tempC != null && <span className="text-[9px] text-[var(--text-muted)]">{tempC.toFixed(0)}°C</span>}
        </div>
      </foreignObject>
    </g>
  );
}

export function PowerScene({ pvW, loadW, batteryW, gridW, batterySoc, mode, panelKwp = 3.5, inverterTempC }: Props) {
  const importing = (gridW ?? 0) > 5;
  const exporting = (gridW ?? 0) < -5;
  const charging = batteryW > 5;
  const discharging = batteryW < -5;
  const outage = isOutage(gridW, mode);
  const throughput = pvW + Math.abs(batteryW) + Math.abs(gridW ?? 0) + loadW;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-full">
      <FlowLine from={NODES.sun} to={CENTER} active={pvW > 5} magnitudeW={pvW} color="var(--series-4)" />
      <FlowLine from={NODES.battery} to={CENTER} active={discharging} magnitudeW={batteryW} reverse color="var(--series-3)" />
      <FlowLine from={CENTER} to={NODES.battery} active={charging} magnitudeW={batteryW} color="var(--series-3)" />
      <FlowLine
        from={NODES.grid}
        to={CENTER}
        active={importing}
        magnitudeW={gridW ?? 0}
        reverse
        color={outage ? "var(--status-critical)" : "var(--series-2)"}
      />
      <FlowLine
        from={CENTER}
        to={NODES.grid}
        active={exporting}
        magnitudeW={gridW ?? 0}
        color="var(--series-2)"
      />
      <FlowLine from={CENTER} to={NODES.home} active={loadW > 5} magnitudeW={loadW} color="var(--series-1)" />

      <InverterHub mode={mode} throughputW={throughput} tempC={inverterTempC} />

      <SolarNode pos={NODES.sun} pvW={pvW} panelKwp={panelKwp} />
      <BatteryNode pos={NODES.battery} socPercent={batterySoc} batteryW={batteryW} />
      <GridNode pos={NODES.grid} gridW={gridW} outage={outage} />
      <HomeNode pos={NODES.home} loadW={loadW} />
    </svg>
  );
}
