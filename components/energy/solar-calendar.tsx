import { ChartCard } from './chart-card';
import { PeriodBar } from './period-bar';
import { SERIES, heatColor } from '@/lib/chart-theme';
import { calendarGrid } from '@/lib/trends';

const CELL = 13,
  STEP = 16,
  LEFT = 30,
  TOP = 22;
const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const kwh = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dayName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });

/** One square per day of the year, tinted by how much solar energy the day produced. */
export function SolarCalendar({
  buckets,
  year,
  onYear,
  firstYear,
  currentYear,
}: {
  buckets: Array<{ date: string; solar: number | null; grid: number | null; home: number | null }>;
  year: string;
  onYear: (year: string) => void;
  firstYear: number;
  currentYear: string;
}) {
  const grid = calendarGrid(buckets, year),
    width = LEFT + grid.weeks.length * STEP,
    recorded = buckets.filter((b) => b.solar !== null && b.date.length === 10),
    best = recorded.reduce<(typeof recorded)[number] | null>(
      (a, b) => (!a || (b.solar ?? 0) > (a.solar ?? 0) ? b : a),
      null,
    ),
    verdict = best
      ? `${recorded.length} days recorded in ${year}. Best day: ${dayName(best.date)} with ${kwh(best.solar!)} kWh.`
      : `No solar days recorded for ${year} yet.`;
  return (
    <ChartCard
      eyebrow="Solar calendar"
      title="Every day of the year"
      verdict={verdict}
      actions={
        <PeriodBar
          label={year}
          onPrev={() => onYear(String(Number(year) - 1))}
          onNext={() => onYear(String(Number(year) + 1))}
          prevDisabled={Number(year) <= firstYear}
          nextDisabled={year >= currentYear}
        />
      }
      footnote="Darker means more solar energy. Grey squares have no recorded reading."
    >
      <div className="heatmap-scroll">
        <svg
          viewBox={`0 0 ${width} ${TOP + 7 * STEP}`}
          role="img"
          aria-label={`Solar energy for each day of ${year}`}
          className="heatmap"
          style={{ minWidth: 640 }}
        >
          {DAYS.map((d, row) => (
            <text key={row} x={0} y={TOP + row * STEP + 10} className="heat-axis">
              {d}
            </text>
          ))}
          {grid.weeks.map((week, col) => {
            const first = week.find(Boolean);
            const label =
              first && Number(first.date.slice(8)) <= 7
                ? new Date(`${first.date}T12:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })
                : null;
            return (
              <g key={col}>
                {label && (
                  <text x={LEFT + col * STEP} y={12} className="heat-axis">
                    {label}
                  </text>
                )}
                {week.map(
                  (cell, row) =>
                    cell && (
                      <rect
                        key={cell.date}
                        x={LEFT + col * STEP}
                        y={TOP + row * STEP}
                        width={CELL}
                        height={CELL}
                        rx={3}
                        style={{ fill: heatColor(cell.solar, grid.max, SERIES.solar) }}
                      >
                        <title>{`${dayName(cell.date)}: ${cell.solar === null ? 'no reading' : kwh(cell.solar) + ' kWh'}`}</title>
                      </rect>
                    ),
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </ChartCard>
  );
}
