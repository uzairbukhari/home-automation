// Literal hex values mirroring app/globals.css's HUD theme custom
// properties. ECharts option objects need literal color strings (they
// don't resolve CSS var(...) references), so this is the single place
// those values are duplicated. Keep in sync with the :root block in
// app/globals.css.
export const chartTheme = {
  textPrimary: "#eaf6ff",
  textSecondary: "#93aec6",
  textMuted: "#55708c",
  gridline: "#16263c",
  baseline: "#223650",
  surface1: "#0a1120",
  series: {
    solar: "#ffcf3d",
    grid: "#ff8a3d",
    battery: "#29e0a8",
    load: "#35b8ff",
  },
  status: {
    good: "#24e07f",
    warning: "#ffcc33",
    serious: "#ff9a5c",
    critical: "#ff4d4d",
  },
  mono: "var(--font-readout), monospace",
};

export const baseGrid = {
  left: 8,
  right: 8,
  top: 28,
  bottom: 8,
  containLabel: true,
};

export const baseTooltip = {
  trigger: "axis" as const,
  backgroundColor: "#0d1728",
  borderColor: chartTheme.gridline,
  borderWidth: 1,
  padding: 10,
  extraCssText: "box-shadow: 0 0 24px -6px rgba(53,184,255,.35); backdrop-filter: blur(6px);",
  textStyle: { color: chartTheme.textPrimary, fontSize: 12, fontFamily: chartTheme.mono },
  axisPointer: {
    type: "cross" as const,
    label: { backgroundColor: chartTheme.gridline },
    lineStyle: { color: chartTheme.baseline },
  },
};

export const baseAxisLabel = { color: chartTheme.textMuted, fontSize: 11, fontFamily: chartTheme.mono };
export const baseAxisLine = { lineStyle: { color: chartTheme.baseline } };
export const baseSplitLine = { lineStyle: { color: chartTheme.gridline, type: "dashed" as const } };

/** #rrggbb -> "rgba(r,g,b,a)" — ECharts' canvas renderer needs a literal color it can parse, not CSS color-mix(). */
function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A glowing gradient area-fill for line/area series, fading from the series color to transparent. */
export function glowAreaStyle(color: string, opacity = 0.35) {
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

/** A glow shadow for a line series' stroke. */
export function glowLineStyle(color: string, width = 2.5) {
  return { color, width, shadowColor: color, shadowBlur: 10 };
}
