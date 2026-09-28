"use client";

import ReactECharts from "echarts-for-react";
import { chartTheme, baseGrid, baseTooltip, baseAxisLabel, baseAxisLine, baseSplitLine } from "@/lib/chart-theme";

export interface EnergyBarPoint {
  label: string; // date or month label
  pvKwh: number;
  loadKwh: number;
  gridImportKwh: number;
}

export function EnergyBars({ points }: { points: EnergyBarPoint[] }) {
  const option = {
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: { ...baseTooltip, axisPointer: { type: "shadow" as const, shadowStyle: { color: "rgba(142,154,179,0.08)" } } },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      axisLabel: baseAxisLabel,
      axisLine: baseAxisLine,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { ...baseAxisLabel, formatter: "{value} kWh" },
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Solar",
        type: "bar",
        data: points.map((p) => Number(p.pvKwh.toFixed(2))),
        itemStyle: { color: chartTheme.series.solar, borderRadius: [3, 3, 0, 0] },
        barGap: "20%",
      },
      {
        name: "Home",
        type: "bar",
        data: points.map((p) => Number(p.loadKwh.toFixed(2))),
        itemStyle: { color: chartTheme.series.load, borderRadius: [3, 3, 0, 0] },
      },
      {
        name: "Grid",
        type: "bar",
        data: points.map((p) => Number(p.gridImportKwh.toFixed(2))),
        itemStyle: { color: chartTheme.series.grid, borderRadius: [3, 3, 0, 0] },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
