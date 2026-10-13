import { selfSufficiency } from '@/lib/energy-insights';

const kwh = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function HeadlineNumbers({
  today,
}: {
  today: { solarKwh: number | null; homeKwh: number | null; gridKwh: number | null } | null | undefined;
}) {
  const share = selfSufficiency(today?.homeKwh, today?.gridKwh);
  const items = [
    { label: 'Solar made', value: kwh(today?.solarKwh), unit: 'kWh', tone: 'solar' },
    { label: 'Home used', value: kwh(today?.homeKwh), unit: 'kWh', tone: 'home' },
    { label: 'From the grid', value: kwh(today?.gridKwh), unit: 'kWh', tone: 'grid' },
    { label: 'Self-sufficiency', value: share === null ? '—' : String(share), unit: '%', tone: 'saving' },
  ];
  return (
    <div className="headline-numbers">
      {items.map((item) => (
        <div key={item.label} data-tone={item.tone}>
          <span>{item.label}</span>
          <strong>
            {item.value}
            {item.value !== '—' && <small> {item.unit}</small>}
          </strong>
        </div>
      ))}
    </div>
  );
}
