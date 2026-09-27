"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { arcPath } from "@/lib/svg-arc";

/** Generic animated arc gauge (0-100), used for SoC, capacity factor, load %, self-sufficiency, ... */
export function RadialGauge({
  percent,
  size = 140,
  stroke = 12,
  color = "var(--series-1)",
  startAngle = 135,
  sweep = 270,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  startAngle?: number;
  sweep?: number;
  children?: ReactNode;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const trackPath = arcPath(cx, cy, radius, startAngle, startAngle + sweep);
  const valuePath = arcPath(cx, cy, radius, startAngle, startAngle + (sweep * clamped) / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <path
        d={trackPath}
        stroke="var(--gridline)"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      <motion.path
        d={valuePath}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      {children && (
        <foreignObject x={0} y={0} width={size} height={size}>
          <div className="flex flex-col items-center justify-center w-full h-full">{children}</div>
        </foreignObject>
      )}
    </svg>
  );
}
