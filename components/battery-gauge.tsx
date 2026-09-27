"use client";

import { motion } from "framer-motion";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium } from "lucide-react";
import { batteryTimeToBoundMinutes } from "@/lib/metrics";
import { arcPath } from "@/lib/svg-arc";

const SIZE = 200;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const START_ANGLE = 135; // degrees, arc goes START -> START + 270
const SWEEP = 270;

export function BatteryGauge({
  socPercent,
  capacityKwh,
  rateW,
}: {
  socPercent: number;
  capacityKwh: number;
  rateW: number;
}) {
  const clamped = Math.min(100, Math.max(0, socPercent));
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const trackPath = arcPath(cx, cy, RADIUS, START_ANGLE, START_ANGLE + SWEEP);
  const valueEndAngle = START_ANGLE + (SWEEP * clamped) / 100;
  const valuePath = arcPath(cx, cy, RADIUS, START_ANGLE, valueEndAngle);

  const bound = batteryTimeToBoundMinutes(clamped, capacityKwh, rateW);
  const color =
    clamped < 20 ? "var(--status-critical)" : clamped < 50 ? "var(--status-warning)" : "var(--series-3)";
  const Icon = rateW > 5 ? BatteryCharging : clamped < 20 ? BatteryLow : clamped < 70 ? BatteryMedium : BatteryFull;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <path d={trackPath} stroke="var(--gridline)" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
        <motion.path
          d={valuePath}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        <foreignObject x={cx - 60} y={cy - 34} width={120} height={68}>
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
              {Math.round(clamped)}%
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Icon size={13} style={{ color }} />
              {Math.abs(rateW) < 5 ? "Idle" : rateW > 0 ? "Charging" : "Discharging"}
            </span>
          </div>
        </foreignObject>
      </svg>
      <div className="text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {capacityKwh.toFixed(1)} kWh battery
        </p>
        {bound && (
          <p className="text-xs text-[var(--text-muted)]">
            {bound.direction === "charging" ? "Full" : "Empty"} in{" "}
            {bound.minutes < 60
              ? `${Math.round(bound.minutes)} min`
              : `${(bound.minutes / 60).toFixed(1)} h`}
          </p>
        )}
      </div>
    </div>
  );
}
