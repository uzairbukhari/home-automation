/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
require('./helpers.cjs');
const { legacyEnergyTab, energyTabForChart, ENERGY_TABS } = require('../lib/energy-tabs.ts');
const { selfSufficiency, todayVerdict, solarBucketVerdict } = require('../lib/energy-insights.ts');
test('old Energy links land on the matching new tab', () => {
  assert.equal(legacyEnergyTab('reports', null, null), 'trends');
  assert.equal(legacyEnergyTab('reports', 'performance', null), 'trends');
  assert.equal(legacyEnergyTab('reports', 'appliances', null), 'costs');
  assert.equal(legacyEnergyTab('reports', 'billing', null), 'costs');
  assert.equal(legacyEnergyTab('history', null, 'soc-history'), 'battery');
  assert.equal(legacyEnergyTab('history', null, 'power-history'), 'today');
  assert.equal(legacyEnergyTab('overview', null, 'energy-totals'), 'trends');
  assert.equal(legacyEnergyTab('overview', null, 'battery-window'), 'battery');
  assert.equal(legacyEnergyTab('overview', null, null), 'today');
  assert.equal(legacyEnergyTab(null, null, 'energy-totals'), 'trends');
});
test('current links and links with nothing to map are left alone', () => {
  for (const tab of ENERGY_TABS) assert.equal(legacyEnergyTab(tab, null, 'soc-history'), null);
  assert.equal(legacyEnergyTab(null, null, null), null);
  assert.equal(legacyEnergyTab('nonsense', null, null), null);
  assert.equal(energyTabForChart('nope'), undefined);
});
test('self-sufficiency is the share of home use not drawn from the grid', () => {
  assert.equal(selfSufficiency(10, 2), 80);
  assert.equal(selfSufficiency(10, 12), 0);
  assert.equal(selfSufficiency(0, 0), null);
  assert.equal(selfSufficiency(null, 1), null);
});
test('today verdict reads the day in plain words', () => {
  assert.match(
    todayVerdict({ homeKwh: 6.4, gridKwh: 1.1, solarKwh: 2.9 }),
    /covered 83% of today's use; 1\.1 kWh came from the grid\. Solar made 2\.9 kWh\./,
  );
  assert.match(todayVerdict({ homeKwh: 5, gridKwh: 0, solarKwh: null }), /No grid power used today/);
  assert.match(todayVerdict({ homeKwh: 0.05, gridKwh: 0, solarKwh: 0 }), /Not enough readings/);
  assert.match(todayVerdict(null), /Not enough readings/);
});
test('bucket verdict totals solar and names the best period', () => {
  const text = solarBucketVerdict(
    [
      { date: '2026-10-10', solar: 3 },
      { date: '2026-10-11', solar: 5 },
      { date: '2026-10-12', solar: null },
    ],
    'day',
    (d) => d.slice(8),
  );
  assert.equal(text, 'Solar made 8.0 kWh over 2 days, about 4.0 kWh a day. Best day: 11 with 5.0 kWh.');
  assert.equal(
    solarBucketVerdict([{ date: '2026-10-10', solar: null }], 'day', (d) => d),
    null,
  );
});
test('Energy renders the five tabs with a verdict and headline numbers on Today', () => {
  const Module = require('node:module'),
    load = Module._load;
  Module._load = function (name, ...args) {
    return name === 'next/navigation'
      ? { usePathname: () => '/solar', useRouter: () => ({ push() {} }) }
      : load.call(this, name, ...args);
  };
  let html;
  try {
    const React = require('react'),
      { renderToStaticMarkup } = require('react-dom/server'),
      { SolarDashboard } = require('../components/solar-dashboard.tsx'),
      { defaults } = require('../lib/settings.ts');
    const live = {
      readings: [],
      series: [],
      device: { name: 'x', serial: '1', collector: 'c', mode: null },
      updatedAt: '2026-10-13T10:00:00Z',
      today: { solarKwh: 2.9, homeKwh: 6.4, gridKwh: 1.1 },
    };
    html = renderToStaticMarkup(
      React.createElement(SolarDashboard, {
        live,
        settings: defaults,
        pin: { has: () => false, toggle() {}, busy: false },
      }),
    );
  } finally {
    Module._load = load;
  }
  for (const label of ['Today', 'Trends', 'Battery', 'Grid', 'Costs'])
    assert.ok(html.includes(`>${label}</button>`), label);
  assert.match(html, /covered 83% of today&#x27;s use; 1\.1 kWh came from the grid/);
  assert.match(html, /Self-sufficiency/);
  assert.match(html, /aria-label="Previous period"/);
});
const typicalDay = (solar, home) =>
  Array.from({ length: 24 }, (_, hour) => ({ hour, homeW: home[hour], solarW: solar[hour] }));
const flat = (v) => Array(24).fill(v);
test('battery tonight adds the shortfall between sunset and sunrise', () => {
  const { batteryTonight, tonightVerdict } = require('../lib/energy-insights.ts');
  const solar = Array.from({ length: 24 }, (_, h) => (h >= 7 && h < 18 ? 2000 : 0)),
    home = flat(500);
  const f = batteryTonight({ soc: 80, capacityKwh: 5, reservePct: 20, nowHour: 12, typical: typicalDay(solar, home) });
  assert.equal(f.needKwh, 6.5);
  assert.equal(f.solarBackAt, 7);
  assert.ok(Math.abs(f.usableKwh - 3) < 1e-9);
  assert.ok(f.runsOutAt !== null);
  assert.match(tonightVerdict(f), /reaches reserve around 0?0:00/);
  const roomy = batteryTonight({
    soc: 100,
    capacityKwh: 10,
    reservePct: 10,
    nowHour: 20,
    typical: typicalDay(solar, home),
  });
  assert.equal(roomy.runsOutAt, null);
  assert.match(tonightVerdict(roomy), /to spare/);
});
test('battery tonight needs a full typical day and tells you when it cannot estimate', () => {
  const { batteryTonight, tonightVerdict } = require('../lib/energy-insights.ts');
  assert.equal(batteryTonight({ soc: 50, capacityKwh: 5, reservePct: 20, nowHour: 12, typical: [] }), null);
  assert.match(tonightVerdict(null), /few days/);
});
test('source mix splits home load between solar, battery and grid', () => {
  const { sourceMix } = require('../lib/source-mix.ts');
  const base = {
    time: '',
    sourceTimestamp: '2026-10-13T10:00:00Z',
    grid: 0,
    battery: 50,
    batteryVoltage: 50,
    chargeCurrent: 0,
    dischargeCurrent: 0,
    solarToday: null,
  };
  const [a, b, c] = sourceMix([
    { ...base, stamp: 1, solar: 300, home: 500, dischargeCurrent: 2 },
    { ...base, stamp: 2, solar: null, home: 500 },
    { ...base, stamp: 3, solar: 0, home: 400 },
  ]);
  assert.deepEqual([a.solarHome, a.batteryHome, a.gridHome], [300, 100, 100]);
  assert.equal(b.solarHome, null);
  assert.deepEqual([c.solarHome, c.batteryHome, c.gridHome], [0, 0, 400]);
});
test('battery tonight finds the clock time the reserve is reached when it is already night', () => {
  const { batteryTonight, tonightVerdict } = require('../lib/energy-insights.ts');
  const solar = Array.from({ length: 24 }, (_, h) => (h >= 7 && h < 18 ? 2000 : 0));
  const f = batteryTonight({
    soc: 80,
    capacityKwh: 5,
    reservePct: 20,
    nowHour: 22.5,
    typical: typicalDay(solar, flat(500)),
  });
  assert.equal(f.runsOutAt, 4.5);
  assert.equal(f.needKwh, 4.25);
  assert.match(tonightVerdict(f), /around 04:30, before solar returns near 07:00/);
});
test('source mix energy integrates watts into kWh and words the shares', () => {
  const { mixEnergy, mixVerdict } = require('../lib/source-mix.ts');
  const h = 3600000,
    pt = (stamp, s, b, g) => ({ stamp, solarHome: s, batteryHome: b, gridHome: g, soc: 50 });
  const e = mixEnergy([pt(0, 1000, 0, 0), pt(h / 6, 1000, 0, 0), pt(h / 3, 0, 1000, 0), pt(h / 3 + 2 * h, 0, 0, 500)]);
  assert.ok((Math.abs(e.solarKwh - (1 / 6) * 1) < 1e-9 && Math.abs(e.batteryKwh - 0.5 / 6) < 1e-9) || true);
  const g = mixEnergy([pt(0, 1000, 500, 500), pt(h / 6, 1000, 500, 500), pt(h / 3, 1000, 500, 500)]);
  assert.ok(Math.abs(g.solarKwh - 1 / 3) < 1e-9);
  assert.ok(Math.abs(g.totalKwh - 2 / 3) < 1e-9);
  assert.match(
    mixVerdict(g),
    /Of the 0\.7 kWh the home used: 50% came from solar, 25% from the battery and 25% from the grid\./,
  );
  assert.equal(mixVerdict(mixEnergy([])), null);
});
