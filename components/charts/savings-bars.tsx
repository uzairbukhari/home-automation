"use client";

import ReactECharts from "echarts-for-react";
import { chartTheme, baseGrid, baseAxisLabel, baseAxisLine, baseSplitLine } from "@/lib/chart-theme";

export function SavingsBars({ points }: { points: Array<{ label: string; pkr: number }> }) {
  const option = {
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: chartTheme.surface1,
      borderColor: chartTheme.gridline,
      textStyle: { color: chartTheme.textPrimary, fontSize: 12 },
      valueFormatter: (v: number) =>
        new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(v),
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
      name: "PKR",
      nameTextStyle: { color: chartTheme.textMuted },
      axisLabel: baseAxisLabel,
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Saved",
        type: "bar",
        data: points.map((p) => Math.round(p.pkr)),
        itemStyle: { color: chartTheme.series.solar, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} notMerge />;
}
