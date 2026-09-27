"use client";

import ReactECharts from "echarts-for-react";
import {
  chartTheme,
  baseGrid,
  baseTooltip,
  baseAxisLabel,
  baseAxisLine,
  baseSplitLine,
  glowAreaStyle,
  glowLineStyle,
} from "@/lib/chart-theme";

export interface TodayCurvePoint {
  ts: number; // epoch ms
  pvW: number;
  loadW: number;
  batteryW: number; // + charging, - discharging
  gridW: number | null;
}

export function TodayCurve({ points }: { points: TodayCurvePoint[] }) {
  const times = points.map((p) =>
    new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

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
    tooltip: baseTooltip,
    xAxis: {
      type: "category",
      data: times,
      boundaryGap: false,
      axisLabel: baseAxisLabel,
      axisLine: baseAxisLine,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: "W",
      nameTextStyle: { color: chartTheme.textMuted },
      axisLabel: baseAxisLabel,
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Solar",
        type: "line",
        data: points.map((p) => Math.round(p.pvW)),
        showSymbol: false,
        smooth: 0.2,
        lineStyle: glowLineStyle(chartTheme.series.solar),
        areaStyle: glowAreaStyle(chartTheme.series.solar, 0.3),
      },
      {
        name: "Load",
        type: "line",
        data: points.map((p) => Math.round(p.loadW)),
        showSymbol: false,
        smooth: 0.2,
        lineStyle: glowLineStyle(chartTheme.series.load),
      },
      {
        name: "Battery",
        type: "line",
        data: points.map((p) => Math.round(p.batteryW)),
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { ...glowLineStyle(chartTheme.series.battery, 2), type: "dashed" },
      },
      {
        name: "Grid",
        type: "line",
        data: points.map((p) => (p.gridW == null ? null : Math.round(p.gridW))),
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { ...glowLineStyle(chartTheme.series.grid, 2), type: "dashed" },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
