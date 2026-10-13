// One look for every energy chart: colours come from the flow tokens, axes and tooltips are shared.
export const SERIES = {
  solar: 'var(--flow-solar)',
  home: 'var(--flow-home)',
  grid: 'var(--flow-grid-import)',
  charge: 'var(--flow-charge)',
  discharge: 'var(--flow-discharge)',
} as const;

export const chartTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

export const chartTooltip = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  color: 'var(--foreground)',
};

export const tooltipTrigger = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches ? 'hover' : 'click';

/** Sequential fill for heatmap cells: a pale to full tint of one series colour. */
export const heatColor = (value: number | null, max: number, color: string) =>
  value === null || max <= 0
    ? 'var(--muted)'
    : `color-mix(in srgb, ${color} ${Math.round(12 + 88 * Math.min(1, Math.max(0, value / max)))}%, transparent)`;
