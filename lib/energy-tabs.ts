import type { ChartId } from './favorites';

export const ENERGY_TABS = ['today', 'trends', 'battery', 'grid', 'costs'] as const;
export type EnergyTab = (typeof ENERGY_TABS)[number];

export const ENERGY_TAB_LABELS: Record<EnergyTab, string> = {
  today: 'Today',
  trends: 'Trends',
  battery: 'Battery',
  grid: 'Grid',
  costs: 'Costs',
};

const CHART_TAB: Record<ChartId, EnergyTab> = {
  'power-history': 'today',
  'energy-totals': 'trends',
  'soc-history': 'battery',
  'battery-window': 'battery',
};

export const energyTabForChart = (id: string): EnergyTab | undefined => CHART_TAB[id as ChartId];

/**
 * Old Energy links used `section=overview|history|reports` plus `report=`/`chart=`.
 * Returns the tab such a link now belongs to, or null when the URL needs no change.
 */
export function legacyEnergyTab(section: string | null, report: string | null, chart: string | null): EnergyTab | null {
  if (section && (ENERGY_TABS as readonly string[]).includes(section)) return null;
  const byChart = chart ? energyTabForChart(chart) : undefined;
  if (section === 'reports') return report === 'appliances' || report === 'billing' ? 'costs' : 'trends';
  if (section === 'history' || section === 'overview') return byChart ?? 'today';
  if (!section && byChart) return byChart;
  return null;
}
