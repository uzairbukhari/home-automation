import type { ReactNode } from 'react';
import { ChartCard } from './chart-card';
import { SERIES } from '@/lib/chart-theme';
import { energyBalance, sankeyLayout, type BalanceInput, type SankeyLink } from '@/lib/trends';

const kwh = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const W = 680,
  LEFT = 128,
  RIGHT = 552,
  BAR = 12,
  HEIGHT = 230;
const NODES: Record<string, { label: string; color: string }> = {
  solar: { label: 'Solar', color: SERIES.solar },
  grid: { label: 'Grid', color: SERIES.grid },
  batteryOut: { label: 'Battery', color: SERIES.discharge },
  home: { label: 'Home', color: SERIES.home },
  batteryIn: { label: 'Charging battery', color: SERIES.charge },
  other: { label: 'Losses and unmetered', color: 'var(--muted-foreground)' },
};

/** Where every kWh of the period came from and went, drawn from the period's totals. */
export function EnergyBalance({
  report,
  periodLabel,
  actions,
}: {
  report: BalanceInput | undefined;
  periodLabel: string;
  actions?: ReactNode;
}) {
  const balance = report ? energyBalance(report) : null;
  if (!balance)
    return (
      <ChartCard eyebrow="Energy balance" title={`Where the energy went · ${periodLabel}`} actions={actions}>
        <div className="chart-empty">Not enough recorded energy for this period yet.</div>
      </ChartCard>
    );
  const links: SankeyLink[] = [
      { from: 'solar', to: 'home', value: balance.solarHome },
      { from: 'solar', to: 'batteryIn', value: balance.solarBattery },
      { from: 'solar', to: 'other', value: balance.solarOther },
      { from: 'batteryOut', to: 'home', value: balance.batteryHome },
      { from: 'batteryOut', to: 'other', value: balance.batteryOther },
      { from: 'grid', to: 'home', value: balance.gridHome },
      { from: 'grid', to: 'batteryIn', value: balance.gridBattery },
      { from: 'grid', to: 'other', value: balance.gridOther },
    ],
    layout = sankeyLayout(links, HEIGHT),
    used = { from: new Map<string, number>(), to: new Map<string, number>() },
    node = (side: 'left' | 'right', id: string) => layout[side].find((n) => n.id === id)!,
    ribbons = layout.links.map((l) => {
      const a = node('left', l.from),
        b = node('right', l.to),
        w = layout.scale(l.value),
        ya = a.y + (used.from.get(l.from) ?? 0) + w / 2,
        yb = b.y + (used.to.get(l.to) ?? 0) + w / 2;
      used.from.set(l.from, (used.from.get(l.from) ?? 0) + w);
      used.to.set(l.to, (used.to.get(l.to) ?? 0) + w);
      const mid = (LEFT + BAR + RIGHT) / 2;
      return { l, w, d: `M${LEFT + BAR},${ya} C${mid},${ya} ${mid},${yb} ${RIGHT},${yb}` };
    }),
    homeTotal = balance.solarHome + balance.batteryHome + balance.gridHome,
    solarShare = homeTotal > 0 ? Math.round(((balance.solarHome + balance.batteryHome) / homeTotal) * 100) : null,
    verdict =
      solarShare === null
        ? null
        : `${solarShare}% of the home's energy came from solar, directly or through the battery.`;
  return (
    <ChartCard
      eyebrow="Energy balance"
      title={`Where the energy went · ${periodLabel}`}
      verdict={verdict}
      actions={actions}
      footnote="Built from period totals, so it is an estimate: the battery's discharge counts as its own source, and what is not metered at the home or the battery is shown as losses."
    >
      <svg
        viewBox={`0 0 ${W} ${HEIGHT}`}
        role="img"
        aria-label="Energy flow from solar, battery and grid to the home, the battery and losses"
        className="sankey"
      >
        <g aria-hidden="true">
          {ribbons.map(({ l, w, d }) => (
            <path
              key={l.from + l.to}
              d={d}
              fill="none"
              stroke={NODES[l.from].color}
              strokeOpacity={0.4}
              strokeWidth={Math.max(1, w)}
            >
              <title>{`${NODES[l.from].label} to ${NODES[l.to].label}: ${kwh(l.value)} kWh`}</title>
            </path>
          ))}
        </g>
        {layout.left.map((n) => (
          <g key={n.id}>
            <rect x={LEFT} y={n.y} width={BAR} height={Math.max(2, n.height)} rx={3} fill={NODES[n.id].color} />
            <text
              x={LEFT - 10}
              y={n.y + n.height / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="sankey-label"
            >
              {NODES[n.id].label}
              <tspan className="sankey-value" x={LEFT - 10} dy="1.25em">
                {kwh(n.value)} kWh
              </tspan>
            </text>
          </g>
        ))}
        {layout.right.map((n) => (
          <g key={n.id}>
            <rect x={RIGHT} y={n.y} width={BAR} height={Math.max(2, n.height)} rx={3} fill={NODES[n.id].color} />
            <text x={RIGHT + BAR + 10} y={n.y + n.height / 2} dominantBaseline="middle" className="sankey-label">
              {NODES[n.id].label}
              <tspan className="sankey-value" x={RIGHT + BAR + 10} dy="1.25em">
                {kwh(n.value)} kWh
              </tspan>
            </text>
          </g>
        ))}
      </svg>
    </ChartCard>
  );
}
