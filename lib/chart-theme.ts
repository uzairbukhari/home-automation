// Literal hex values mirroring app/globals.css's :root custom properties.
// ECharts option objects need literal color strings (they don't resolve
// CSS var(...) references), so this is the single place those values are
// duplicated. Keep in sync with the :root block in app/globals.css.
export const chartTheme = {
  textPrimary: "#eef6ff",
  textSecondary: "#b4c0d6",
  textMuted: "#8e9ab3",
  gridline: "#24344f",
  baseline: "#24344f",
  surface1: "#0c1728",
  series: {
    solar: "#f8d35a",
    grid: "#8e9ab3",
    battery: "#9cf7c6",
    load: "#59e3ff",
  },
  status: {
    good: "#7ee2a8",
    warning: "#f8d35a",
    serious: "#f5a97f",
    critical: "#f28b82",
  },
  font: "Inter, ui-sans-serif, system-ui, sans-serif",
};

export const baseGrid = {
  left: 4,
  right: 8,
  top: 16,
  bottom: 4,
  containLabel: true,
};

export const baseTooltip = {
  trigger: "axis" as const,
  backgroundColor: "#101a2d",
  borderColor: chartTheme.gridline,
  borderWidth: 1,
  padding: [8, 12],
  extraCssText: "border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.35);",
  textStyle: { color: chartTheme.textPrimary, fontSize: 12, fontFamily: chartTheme.font },
  axisPointer: {
    type: "line" as const,
    lineStyle: { color: chartTheme.baseline },
  },
};

export const baseAxisLabel = { color: chartTheme.textMuted, fontSize: 11, fontFamily: chartTheme.font };
export const baseAxisLine = { show: true, lineStyle: { color: chartTheme.baseline } };
export const baseSplitLine = { lineStyle: { color: chartTheme.gridline, type: "dotted" as const } };

/** #rrggbb -> "rgba(r,g,b,a)" — ECharts' canvas renderer needs a literal color it can parse, not CSS color-mix(). */
function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A faint gradient area-fill under a line series, fading from the series color to transparent. */
export function areaFill(color: string, opacity = 0.14) {
  return {
    color: {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: hexToRgba(color, opacity) },
        { offset: 1, color: hexToRgba(color, 0) },
      ],
    },
  };
}

/** A plain line stroke for a line series. */
export function lineStroke(color: string, width = 2) {
  return { color, width };
}
