"use client";

import ReactECharts from "echarts-for-react";
import {
  chartTheme,
  baseGrid,
  baseTooltip,
  baseAxisLabel,
  baseAxisLine,
  baseSplitLine,
  areaFill,
  lineStroke,
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
    tooltip: { ...baseTooltip, valueFormatter: (v: number) => `${v} W` },
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
      axisLabel: { ...baseAxisLabel, formatter: (v: number) => (Math.abs(v) >= 1000 ? `${v / 1000} kW` : `${v} W`) },
      axisLine: { show: false },
      splitLine: baseSplitLine,
    },
    series: [
      {
        name: "Solar",
        type: "line",
        data: points.map((p) => Math.round(p.pvW)),
        showSymbol: false,
        smooth: 0.35,
        lineStyle: lineStroke(chartTheme.series.solar),
        areaStyle: areaFill(chartTheme.series.solar),
      },
      {
        name: "Home",
        type: "line",
        data: points.map((p) => Math.round(p.loadW)),
        showSymbol: false,
        smooth: 0.35,
        lineStyle: lineStroke(chartTheme.series.load),
      },
      {
        name: "Battery",
        type: "line",
        data: points.map((p) => Math.round(p.batteryW)),
        showSymbol: false,
        smooth: 0.35,
        lineStyle: lineStroke(chartTheme.series.battery, 1.5),
      },
      {
        name: "Grid",
        type: "line",
        data: points.map((p) => (p.gridW == null ? null : Math.round(p.gridW))),
        showSymbol: false,
        smooth: 0.35,
        lineStyle: lineStroke(chartTheme.series.grid, 1.5),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
