export const chartIds = ['power-history', 'energy-totals', 'soc-history', 'battery-window'] as const;
export type ChartId = typeof chartIds[number];
export type Favorite = { kind: 'device' | 'chart'; itemId: string };
