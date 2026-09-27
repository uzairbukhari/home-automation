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
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: chartTheme.textSecondary, fontSize: 12 },
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
    },
    tooltip: { ...baseTooltip, axisPointer: { type: "shadow" as const } },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      axisLabel: baseAxisLabel,
      axisLine: baseAxisLine,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: "kWh",
      nameTextStyle: { color: chartTheme.textMuted },
      axisLabel: baseAxisLabel,
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Produced",
        type: "bar",
        data: points.map((p) => Number(p.pvKwh.toFixed(2))),
        itemStyle: { color: chartTheme.series.solar, borderRadius: [4, 4, 0, 0] },
        barGap: "20%",
      },
      {
        name: "Consumed",
        type: "bar",
        data: points.map((p) => Number(p.loadKwh.toFixed(2))),
        itemStyle: { color: chartTheme.series.load, borderRadius: [4, 4, 0, 0] },
      },
      {
        name: "Grid import",
        type: "bar",
        data: points.map((p) => Number(p.gridImportKwh.toFixed(2))),
        itemStyle: { color: chartTheme.series.grid, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
