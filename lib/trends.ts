import { selfSufficiency } from './energy-insights';

type Bucket = { date: string; solar: number | null; grid: number | null; home: number | null; partial?: boolean };

export type BalanceInput = {
  solarKwh: number | null;
  gridKwh: number | null;
  homeKwh: number | null;
  directSolarKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
};
export type Balance = {
  solarHome: number;
  solarBattery: number;
  gridHome: number;
  gridBattery: number;
  batteryHome: number;
  /** Energy that went in but was not metered at the home or the battery, by source: conversion losses and estimation error. */
  solarOther: number;
  gridOther: number;
  batteryOther: number;
  other: number;
};

/**
 * Splits a period's energy into the five routes the live scene shows, from period totals.
 * Solar serves the home first, then the battery; the grid covers the rest, as in `allocate()`.
 */
export function energyBalance(r: BalanceInput): Balance | null {
  if (r.solarKwh === null || r.homeKwh === null) return null;
  const grid = Math.max(0, r.gridKwh ?? 0),
    charge = Math.max(0, r.batteryChargeKwh ?? 0),
    discharge = Math.max(0, r.batteryDischargeKwh ?? 0),
    solarHome = Math.min(r.directSolarKwh ?? r.solarKwh, r.solarKwh, r.homeKwh),
    solarBattery = Math.min(Math.max(0, r.solarKwh - solarHome), charge),
    gridBattery = Math.min(grid, Math.max(0, charge - solarBattery)),
    batteryHome = Math.min(discharge, Math.max(0, r.homeKwh - solarHome)),
    gridHome = Math.min(Math.max(0, grid - gridBattery), Math.max(0, r.homeKwh - solarHome - batteryHome)),
    solarOther = Math.max(0, r.solarKwh - solarHome - solarBattery),
    gridOther = Math.max(0, grid - gridHome - gridBattery),
    batteryOther = Math.max(0, discharge - batteryHome);
  return {
    solarHome,
    solarBattery,
    gridHome,
    gridBattery,
    batteryHome,
    solarOther,
    gridOther,
    batteryOther,
    other: solarOther + gridOther + batteryOther,
  };
}

export type SankeyLink = { from: string; to: string; value: number };
export type SankeyNode = { id: string; value: number; y: number; height: number };

/** Vertical layout for a two-column flow diagram: node heights are proportional to their throughput. */
export function sankeyLayout(links: SankeyLink[], height: number, gap = 14) {
  const live = links.filter((l) => l.value > 0.005),
    ids = (side: 'from' | 'to') => [...new Set(live.map((l) => l[side]))],
    total = (side: 'from' | 'to', id: string) => live.filter((l) => l[side] === id).reduce((n, l) => n + l.value, 0),
    scale = (n: number) => {
      const columns = [ids('from'), ids('to')],
        usable = Math.min(...columns.map((c) => height - gap * Math.max(0, c.length - 1)));
      return (
        (usable /
          Math.max(...(['from', 'to'] as const).map((s) => ids(s).reduce((sum, id) => sum + total(s, id), 0)), 1e-9)) *
        n
      );
    },
    column = (side: 'from' | 'to'): SankeyNode[] => {
      let y = 0;
      return ids(side).map((id) => {
        const value = total(side, id),
          h = scale(value),
          node = { id, value, y, height: h };
        y += h + gap;
        return node;
      });
    };
  return { left: column('from'), right: column('to'), links: live, scale };
}

export type CalendarCell = { date: string; solar: number | null };

/** Weeks as columns (Monday first), days as rows, for one calendar year. */
export function calendarGrid(buckets: Bucket[], year: string) {
  const byDate = new Map(buckets.map((b) => [b.date, b.solar])),
    first = new Date(`${year}-01-01T12:00:00Z`),
    offset = (first.getUTCDay() + 6) % 7,
    weeks: Array<Array<CalendarCell | null>> = [];
  const y = Number(year),
    days = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  for (let i = -offset; i < days; i++) {
    const week = Math.floor((i + offset) / 7),
      row = (i + offset) % 7;
    (weeks[week] ??= Array(7).fill(null))[row] =
      i < 0
        ? null
        : (() => {
            const d = new Date(first.getTime() + i * 86400000).toISOString().slice(0, 10);
            return { date: d, solar: byDate.get(d) ?? null };
          })();
  }
  const values = [...byDate.values()].filter((v): v is number => v !== null && v > 0);
  return { weeks, max: values.length ? Math.max(...values) : 0 };
}

/** Best and worst solar days, leaving out today and days without a reading. */
export function bestWorstDays(buckets: Bucket[], today: string, n = 3) {
  const days = buckets.filter(
      (b): b is Bucket & { solar: number } => b.solar !== null && b.date < today && b.date.length === 10,
    ),
    sorted = [...days].sort((a, b) => b.solar - a.solar);
  return { best: sorted.slice(0, n), worst: sorted.length > n * 2 ? sorted.slice(-n).reverse() : [] };
}

/** Share of each day's home use that did not come from the grid, for the last `count` days with data. */
export function selfSufficiencySeries(buckets: Bucket[], count = 30) {
  return buckets
    .filter((b) => b.date.length === 10)
    .map((b) => ({ date: b.date, pct: selfSufficiency(b.home, b.grid) }))
    .filter((p): p is { date: string; pct: number } => p.pct !== null)
    .slice(-count);
}

export type HeatmapMetric = 'home' | 'solar' | 'grid';
export type HeatmapDay = {
  date: string;
  home: Array<number | null>;
  solar: Array<number | null>;
  grid: Array<number | null>;
};

/** The hour of day with the highest average power across the given days, and that average in watts. */
export function peakHour(days: HeatmapDay[], metric: HeatmapMetric) {
  let best: { hour: number; watts: number } | null = null;
  for (let hour = 0; hour < 24; hour++) {
    const values = days.map((d) => d[metric][hour]).filter((v): v is number => v !== null);
    if (values.length < Math.max(1, Math.floor(days.length / 3))) continue;
    const watts = values.reduce((a, b) => a + b, 0) / values.length;
    if (!best || watts > best.watts) best = { hour, watts };
  }
  return best;
}
