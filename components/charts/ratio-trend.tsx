"use client";

import ReactECharts from "echarts-for-react";
import { chartTheme, baseGrid, baseTooltip, baseAxisLabel, baseAxisLine, baseSplitLine, lineStroke } from "@/lib/chart-theme";

export interface RatioPoint {
  label: string;
  selfSufficiency: number; // 0-1
  selfConsumption: number; // 0-1
}

export function RatioTrend({ points }: { points: RatioPoint[] }) {
  const option = {
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: {
      ...baseTooltip,
      valueFormatter: (v: number) => `${(v * 100).toFixed(0)}%`,
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      axisLabel: baseAxisLabel,
      axisLine: baseAxisLine,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLabel: { ...baseAxisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` },
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Self-sufficiency",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: points.map((p) => p.selfSufficiency),
        lineStyle: lineStroke(chartTheme.series.solar),
      },
      {
        name: "Self-consumption",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: points.map((p) => p.selfConsumption),
        lineStyle: lineStroke(chartTheme.series.battery),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} notMerge />;
}
