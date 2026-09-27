"use client";

import ReactECharts from "echarts-for-react";
import { chartTheme, baseTooltip, baseAxisLabel } from "@/lib/chart-theme";
import type { WeekdayHourPoint } from "@/lib/metrics";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function PeakLoadHeatmap({ points }: { points: WeekdayHourPoint[] }) {
  const data = points.map((p) => [p.hour, p.weekday, Math.round(p.avgLoadW)]);
  const maxLoad = Math.max(1, ...points.map((p) => p.avgLoadW));

  const option = {
    backgroundColor: "transparent",
    grid: { left: 44, right: 8, top: 16, bottom: 32, containLabel: false },
    tooltip: {
      ...baseTooltip,
      trigger: "item" as const,
      formatter: (p: { data: [number, number, number] }) =>
        `${WEEKDAYS[p.data[1]]} ${p.data[0]}:00 &mdash; ${p.data[2]} W avg`,
    },
    xAxis: {
      type: "category",
      data: HOURS,
      axisLabel: { ...baseAxisLabel, interval: 1 },
      axisLine: { show: false },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: WEEKDAYS,
      axisLabel: baseAxisLabel,
      axisLine: { show: false },
      splitArea: { show: false },
    },
    visualMap: {
      min: 0,
      max: maxLoad,
      show: false,
      inRange: { color: ["transparent", chartTheme.series.load] },
    },
    series: [
      {
        type: "heatmap",
        data,
        itemStyle: { borderRadius: 2, borderColor: "transparent", borderWidth: 2 },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 220, width: "100%" }} notMerge />;
}
