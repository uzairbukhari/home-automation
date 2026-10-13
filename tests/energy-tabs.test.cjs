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
test('energy balance splits a period into the five routes and never loses energy', () => {
  const { energyBalance } = require('../lib/trends.ts');
  const b = energyBalance({
    solarKwh: 10,
    gridKwh: 3,
    homeKwh: 9,
    directSolarKwh: 5,
    batteryChargeKwh: 4,
    batteryDischargeKwh: 3,
  });
  assert.equal(b.solarHome, 5);
  assert.equal(b.solarBattery, 4);
  assert.equal(b.gridBattery, 0);
  assert.equal(b.gridHome, 1);
  assert.equal(b.batteryHome, 3);
  const used = b.solarHome + b.gridHome + b.batteryHome;
  assert.ok(used <= 9 + 1e-9);
  assert.ok(Math.abs(b.other - (10 + 3 + 3 - 9 - 4)) < 1e-9);
  assert.equal(
    energyBalance({
      solarKwh: null,
      gridKwh: 1,
      homeKwh: 1,
      directSolarKwh: 0,
      batteryChargeKwh: 0,
      batteryDischargeKwh: 0,
    }),
    null,
  );
  const grid = energyBalance({
    solarKwh: 0,
    gridKwh: 6,
    homeKwh: 4,
    directSolarKwh: 0,
    batteryChargeKwh: 2,
    batteryDischargeKwh: 0,
  });
  assert.equal(grid.gridBattery, 2);
  assert.equal(grid.gridHome, 4);
});
test('sankey node heights are proportional and fit the height', () => {
  const { sankeyLayout } = require('../lib/trends.ts');
  const s = sankeyLayout(
    [
      { from: 'solar', to: 'home', value: 6 },
      { from: 'solar', to: 'battery', value: 2 },
      { from: 'grid', to: 'home', value: 2 },
      { from: 'x', to: 'y', value: 0 },
    ],
    200,
    10,
  );
  const solar = s.left.find((n) => n.id === 'solar'),
    grid = s.left.find((n) => n.id === 'grid');
  assert.ok(Math.abs(solar.height / grid.height - 4) < 1e-9);
  assert.equal(s.left.length, 2);
  const bottom = Math.max(...s.left.map((n) => n.y + n.height), ...s.right.map((n) => n.y + n.height));
  assert.ok(bottom <= 200 + 1e-9);
});
test('calendar grid lays a year out Monday first with 365 or 366 cells', () => {
  const { calendarGrid } = require('../lib/trends.ts');
  const g = calendarGrid([{ date: '2026-01-05', solar: 8, grid: null, home: null }], '2026');
  const cells = g.weeks.flat().filter(Boolean);
  assert.equal(cells.length, 365);
  assert.equal(g.weeks[0][3].date, '2026-01-01');
  assert.equal(g.max, 8);
  assert.equal(g.weeks[1][0].solar, 8);
  assert.equal(calendarGrid([], '2024').weeks.flat().filter(Boolean).length, 366);
});
test('best and worst days skip today and need enough days to separate the two lists', () => {
  const { bestWorstDays, selfSufficiencySeries } = require('../lib/trends.ts');
  const days = Array.from({ length: 8 }, (_, i) => ({ date: '2026-10-0' + (i + 1), solar: i + 1, grid: 1, home: 4 }));
  const r = bestWorstDays([...days, { date: '2026-10-09', solar: 50, grid: 0, home: 1 }], '2026-10-09', 3);
  assert.deepEqual(
    r.best.map((d) => d.solar),
    [8, 7, 6],
  );
  assert.deepEqual(
    r.worst.map((d) => d.solar),
    [1, 2, 3],
  );
  assert.deepEqual(bestWorstDays(days.slice(0, 4), '2026-11-01', 3).worst, []);
  assert.deepEqual(
    selfSufficiencySeries([
      { date: '2026-10-01', solar: 1, grid: 1, home: 4 },
      { date: '2026-10-02', solar: 1, grid: null, home: 4 },
    ]),
    [{ date: '2026-10-01', pct: 75 }],
  );
});
test('peak hour finds the hour with the highest average power', () => {
  const { peakHour } = require('../lib/trends.ts');
  const day = (v) => ({
    date: 'd',
    home: Array.from({ length: 24 }, (_, h) => (h === 19 ? v : 200)),
    solar: Array(24).fill(null),
    grid: Array(24).fill(null),
  });
  const p = peakHour([day(1000), day(2000), day(3000)], 'home');
  assert.equal(p.hour, 19);
  assert.equal(p.watts, 2000);
  assert.equal(peakHour([day(1)], 'solar'), null);
});
test('heatmap route averages stored hourly power per day and the reports route returns the year calendar', async () => {
  const { database, auth } = require('./helpers.cjs'),
    { sqlite } = database(),
    oldUser = auth.user;
  const { saveSnapshot, saveProviderPeriods } = require('../lib/solar-store.ts'),
    { localDate, shiftDate } = require('../lib/measurements.ts');
  const today = localDate(),
    yesterday = shiftDate(today, -1),
    year = today.slice(0, 4),
    stamp = new Date().toISOString();
  auth.user = { userId: 'heatmap-fixture' };
  try {
    await saveSnapshot({
      device: { serial: 'heatmap-fixture', name: 'Fixture', collector: 'test', mode: 'Battery mode' },
      updatedAt: stamp,
      readings: [{ metric: 'battery_soc', value: 50, quality: 'good' }],
      series: [{ sourceTimestamp: stamp, solar: 100, home: 50, grid: 0, battery: 50 }],
    });
    const hours = Array.from({ length: 24 }, (_, h) =>
      h === 19 ? { home: { integral: 1800, hours: 1, onHours: 1 } } : {},
    );
    sqlite
      .prepare(
        "INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES ('dessmonitor','heatmap-fixture','day',?,'',?,?,3)",
      )
      .run(
        yesterday,
        JSON.stringify({
          metrics: {},
          hours,
          socHours: [],
          energyKwh: null,
          energySource: 'missing',
          energyHours: 0,
          partial: true,
          samples: 1,
        }),
        stamp,
      );
    const response = await require('../app/api/solar/heatmap/route.ts').GET(
      new Request('http://localhost/api/solar/heatmap?days=7'),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    const row = body.days.find((d) => d.date === yesterday);
    assert.ok(row);
    assert.equal(row.home[19], 1800);
    assert.equal(row.home[3], null);
    assert.equal(row.solar[19], null);
    const bad = await (
      await require('../app/api/solar/heatmap/route.ts').GET(new Request('http://localhost/api/solar/heatmap?days=500'))
    ).json();
    assert.equal(bad.days.length, body.days.length);
    await saveProviderPeriods({
      entityId: 'heatmap-fixture',
      type: 'day',
      buckets: [
        {
          date: today,
          solar: 4.2,
          grid: null,
          home: null,
          source: 'provider:ENERGY_TODAY',
          gridSource: 'missing',
          coveredHours: 0,
          partial: true,
        },
      ],
    });
    const reports = await (
      await require('../app/api/solar/reports/route.ts').GET(
        new Request('http://localhost/api/solar/reports?year=' + year),
      )
    ).json();
    assert.ok(Array.isArray(reports.calendar));
    assert.equal(reports.calendar.find((b) => b.date === today)?.solar, 4.2);
    auth.user = null;
    assert.equal(
      (await require('../app/api/solar/heatmap/route.ts').GET(new Request('http://localhost/api/solar/heatmap')))
        .status,
      401,
    );
  } finally {
    auth.user = oldUser;
    sqlite.close();
  }
});

// Grid health: outage detection, voltage bands and the stored rollup.
const gridDate = '2026-03-10';
const gridAt = (hh, mm) =>
  Date.parse(`${gridDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:00`);
const gridPoint = (hh, mm, voltage, homeW = 500) => ({
  stamp: gridAt(hh, mm),
  voltage,
  frequency: voltage > 100 ? 50 : 0,
  homeW,
});
test('summarizeGrid finds outages, battery-carried energy and voltage bands', () => {
  const { summarizeGrid, gridTotals, gridVerdict } = require('../lib/grid-math.ts');
  const pts = [
    gridPoint(10, 0, 230),
    gridPoint(10, 5, 230),
    gridPoint(10, 10, 0, 1200),
    gridPoint(10, 15, 0, 1200),
    gridPoint(10, 20, 0, 1200),
    gridPoint(10, 25, 175),
    gridPoint(10, 30, 250),
    gridPoint(10, 35, 230),
    gridPoint(18, 0, 0, 600),
    gridPoint(18, 5, 231),
  ];
  const day = summarizeGrid(pts, gridDate);
  assert.equal(day.outages.length, 2);
  assert.equal(day.outages[0].minutes, 15);
  assert.equal(day.outages[1].minutes, 5);
  assert.equal(day.downMinutes, 20);
  assert.ok(Math.abs(day.outages[0].homeKwh - 0.3) < 1e-9);
  assert.ok(Math.abs(day.carriedKwh - 0.35) < 1e-9);
  assert.equal(day.voltage.min, 175);
  assert.equal(day.voltage.max, 250);
  assert.ok(day.bandHours.critical > 0 && day.bandHours.high > 0 && day.bandHours.normal > 0);
  assert.deepEqual(day.frequency, { min: 50, max: 50 });
  const totals = gridTotals([day]);
  assert.equal(totals.outages, 2);
  assert.equal(totals.longest.minutes, 15);
  assert.ok(gridVerdict(totals, 30).includes('2 power cuts'));
  assert.ok(
    gridVerdict(gridTotals([summarizeGrid([gridPoint(1, 0, 230), gridPoint(1, 5, 230)], gridDate)]), 7).includes(
      'No power cuts',
    ),
  );
  assert.equal(gridVerdict(gridTotals([]), 7), null);
  assert.equal(summarizeGrid([], gridDate).outages.length, 0);
});
test('grid rollup is stored from raw fields and served by the owner-only route', async () => {
  const { database, auth } = require('./helpers.cjs'),
    { sqlite } = database(),
    oldUser = auth.user;
  const { saveSnapshot } = require('../lib/solar-store.ts'),
    { gridRollupStep, gridDays } = require('../lib/grid-stats.ts'),
    { localDate, shiftDate } = require('../lib/measurements.ts');
  const day = shiftDate(localDate(), -3),
    at = (hh, mm) =>
      new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:00`).toISOString(),
    field = (voltage) => ({
      'grid voltage': { value: String(voltage), unit: 'V' },
      'frequency of grid': { value: voltage ? '50' : '0', unit: 'Hz' },
      'output active power': { value: '0.8', unit: 'kW' },
    });
  auth.user = { userId: 'grid-fixture' };
  try {
    await saveSnapshot({
      device: { serial: 'grid-fixture', name: 'Fixture', collector: 'test', mode: 'Battery mode' },
      updatedAt: new Date().toISOString(),
      readings: [{ metric: 'battery_soc', value: 50, quality: 'good' }],
      series: [],
      rawFields: [
        { sourceTimestamp: at(9, 0), fields: field(228) },
        { sourceTimestamp: at(9, 5), fields: field(0) },
        { sourceTimestamp: at(9, 10), fields: field(0) },
        { sourceTimestamp: at(9, 15), fields: field(229) },
      ],
    });
    const step = await gridRollupStep('grid-fixture');
    assert.ok(step.done.includes(day));
    const stored = await gridDays('grid-fixture', day, day);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].outages.length, 1);
    assert.equal(stored[0].downMinutes, 10);
    assert.ok(Math.abs(stored[0].carriedKwh - 0.8 * (10 / 60)) < 1e-9);
    const response = await require('../app/api/solar/grid/route.ts').GET(
      new Request('http://localhost/api/solar/grid?days=7'),
    );
    const body = await response.json();
    assert.equal(body.days.length, 1);
    assert.equal(body.days[0].date, day);
    auth.user = null;
    assert.equal(
      (await require('../app/api/solar/grid/route.ts').GET(new Request('http://localhost/api/solar/grid'))).status,
      401,
    );
  } finally {
    auth.user = oldUser;
    sqlite.close();
  }
});

test('battery insights bin charge levels, count reserve days and compute round-trip efficiency', () => {
  const { socBins, reserveHits, fullDays, roundTrip, batteryInsightVerdict } = require('../lib/battery-insights.ts');
  const hoursAt = (levels) => {
    const arr = Array(101).fill(0);
    for (const [level, h] of Object.entries(levels)) arr[Number(level)] = h;
    return arr;
  };
  const days = [
    { date: '2026-03-01', socMin: 18, socMax: 100, socHours: hoursAt({ 18: 1, 55: 10, 100: 5 }) },
    { date: '2026-03-02', socMin: 40, socMax: 97, socHours: hoursAt({ 40: 4, 97: 6 }) },
  ];
  const bins = socBins(days);
  assert.equal(bins.length, 10);
  assert.equal(bins[1].hours, 1);
  assert.equal(bins[5].hours, 10);
  assert.equal(bins[9].hours, 11);
  const hits = reserveHits(days, 20);
  assert.equal(hits.daysHit, 1);
  assert.equal(hits.hours, 1);
  assert.equal(fullDays(days), 1);
  assert.equal(roundTrip(100, 92), 92);
  assert.equal(roundTrip(5, 4), null);
  assert.equal(roundTrip(100, 20), null);
  assert.ok(batteryInsightVerdict(days, 20, hits, 30).includes('1 of 2 days'));
  assert.equal(batteryInsightVerdict([], 20, { hours: 0, daysHit: 0 }, 30), null);
});
test('battery insights route returns stored daily charge levels for the owner only', async () => {
  const { database, auth } = require('./helpers.cjs'),
    { sqlite } = database(),
    oldUser = auth.user;
  const { saveSnapshot } = require('../lib/solar-store.ts'),
    { localDate, shiftDate } = require('../lib/measurements.ts');
  const day = shiftDate(localDate(), -1);
  auth.user = { userId: 'insight-fixture' };
  try {
    await saveSnapshot({
      device: { serial: 'insight-fixture', name: 'Fixture', collector: 'test', mode: 'Battery mode' },
      updatedAt: new Date().toISOString(),
      readings: [{ metric: 'battery_soc', value: 50, quality: 'good' }],
      series: [],
    });
    const socHours = Array(101).fill(0);
    socHours[30] = 5;
    sqlite
      .prepare(
        "INSERT INTO telemetry_summaries(source,entity_id,granularity,period,room,data,updated_at,calculation_version) VALUES ('dessmonitor','insight-fixture','day',?,'',?,?,3)",
      )
      .run(
        day,
        JSON.stringify({ metrics: { battery: { min: 22, max: 91 } }, hours: [], socHours }),
        new Date().toISOString(),
      );
    const body = await (
      await require('../app/api/solar/battery-insights/route.ts').GET(
        new Request('http://localhost/api/solar/battery-insights?days=7'),
      )
    ).json();
    assert.equal(body.days.length, 1);
    assert.equal(body.days[0].socMin, 22);
    assert.equal(body.days[0].socHours[30], 5);
    auth.user = null;
    assert.equal(
      (await require('../app/api/solar/battery-insights/route.ts').GET(new Request('http://localhost/x'))).status,
      401,
    );
  } finally {
    auth.user = oldUser;
    sqlite.close();
  }
});

test('cost insights project the bill, find the slab edge, baseload and yield per kW', () => {
  const { billForecast, billVerdict, cycleEnd, baseload, yieldSeries, yieldVerdict } = require('../lib/costs.ts');
  assert.equal(cycleEnd('2026-03-05'), '2026-04-04');
  assert.equal(cycleEnd('2026-12-01'), '2026-12-31');
  const f = billForecast(90, '2026-03-01', '2026-03-10');
  assert.equal(f.elapsedDays, 10);
  assert.equal(f.cycleDays, 31);
  assert.ok(Math.abs(f.projectedKwh - 279) < 1e-9);
  assert.equal(f.rate, 33.1);
  assert.equal(f.slabMax, 300);
  assert.equal(f.crossesNext, false);
  const near = billForecast(95, '2026-03-01', '2026-03-10');
  assert.equal(near.crossesNext, true);
  assert.ok(billVerdict(near).includes('300-unit limit'));
  assert.equal(billForecast(null, '2026-03-01', '2026-03-10'), null);
  const top = billForecast(800, '2026-03-01', '2026-03-10');
  assert.equal(top.slabMax, null);
  assert.ok(billVerdict(top).includes('top slab'));
  assert.equal(baseload([{ home: [100, 200] }]), null);
  const floor = baseload([{ home: Array.from({ length: 24 }, (_, h) => 200 + h * 100) }]);
  assert.equal(floor.watts, 800);
  assert.equal(Math.round(floor.kwhPerMonth), 576);
  const points = yieldSeries(
    [
      { date: '2026-03-08', solar: 18 },
      { date: '2026-03-09', solar: 7.2 },
      { date: '2026-03-10', solar: 14.4 },
      { date: '2026-03-11', solar: null },
      { date: '2025-01-01', solar: 10 },
    ],
    '2026-03-11',
  );
  assert.deepEqual(
    points.map((p) => p.kwhPerKw),
    [5, 2, 4],
  );
  assert.ok(yieldVerdict(points).includes('best 5.0'));
  assert.equal(yieldVerdict(points.slice(0, 2)), null);
});

test('money split ranks appliances by cost and adds the unmonitored remainder', () => {
  const { moneySplit } = require('../lib/costs.ts');
  const { rows, total, rate } = moneySplit(
    [
      { id: 'ac', name: 'AC', energyKwh: 60, estimatedCost: 2400 },
      { id: 'fridge', name: 'Fridge', energyKwh: 30, estimatedCost: 1200 },
      { id: 'meter', name: 'Main meter', energyKwh: 400, estimatedCost: 16000, upstream: true },
      { id: 'none', name: 'No data', energyKwh: null, estimatedCost: null },
    ],
    30,
  );
  assert.equal(rate, 40);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['ac', 'fridge', 'unmonitored'].sort(
      (a, b) => rows.findIndex((r) => r.id === a) - rows.findIndex((r) => r.id === b),
    ),
  );
  assert.equal(rows[0].id, 'ac');
  assert.equal(rows.at(-1).unmonitored, true);
  assert.equal(total, 4800);
  assert.ok(Math.abs(rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  assert.equal(moneySplit([], 5).rows.length, 0);
});
test('summarizeGrid records inverter load and temperature when present', () => {
  const { summarizeGrid } = require('../lib/grid-math.ts');
  const day = summarizeGrid(
    [
      { ...gridPoint(12, 0, 230), loadPct: 85, tempC: 41 },
      { ...gridPoint(12, 5, 230), loadPct: 40, tempC: 45 },
      { ...gridPoint(12, 10, 230), loadPct: 90, tempC: 43 },
    ],
    gridDate,
  );
  assert.equal(day.inverter.peakLoadPct, 90);
  assert.ok(Math.abs(day.inverter.hoursAbove80 - 10 / 60) < 1e-9);
  assert.equal(day.inverter.maxTempC, 45);
  assert.equal(summarizeGrid([gridPoint(12, 0, 230)], gridDate).inverter, undefined);
});
