"use client";

import ReactECharts from "echarts-for-react";
import { chartTheme, baseGrid, baseTooltip, baseAxisLabel, baseAxisLine, baseSplitLine } from "@/lib/chart-theme";

export function SavingsBars({ points }: { points: Array<{ label: string; pkr: number }> }) {
  const option = {
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: {
      ...baseTooltip,
      axisPointer: { type: "shadow" as const, shadowStyle: { color: "rgba(142,154,179,0.08)" } },
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
      axisLabel: { ...baseAxisLabel, formatter: (v: number) => `Rs ${v.toLocaleString("en-US")}` },
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Saved",
        type: "bar",
        data: points.map((p) => Math.round(p.pkr)),
        itemStyle: { color: chartTheme.series.solar, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 36,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} notMerge />;
}
