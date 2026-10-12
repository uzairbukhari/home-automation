'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { OfflineLink as Link } from '@/components/app-shell';
import { allocate, ACTIVE_W, type EnergySnapshot, type Routes } from '@/lib/energy-flow';
import { createEngine, type Engine, type Shown } from './scene-engine';
import { OFFSETS, type Node } from './scene-geometry';
import './scene.css';

const kw = (w: number) => (Math.abs(w) / 1000).toFixed(2);
const num = (v: number | null | undefined, digits = 1, unit = '') => (v == null ? '—' : v.toFixed(digits) + unit);
const NODES: Node[] = ['solar', 'grid', 'battery', 'home'];
const LABEL: Record<Node, string> = { solar: 'Solar', grid: 'Grid', battery: 'Battery', home: 'Home' };
type Row = [string, string];
type Tip = { x: number; y: number; title: string; rows: Row[] };

function batteryState(s: EnergySnapshot) { return s.battery > ACTIVE_W ? 'charging' : s.battery < -ACTIVE_W ? 'discharging' : 'idle'; }
function colorOf(n: Node, s: EnergySnapshot) { return n === 'battery' ? (s.battery < -ACTIVE_W ? 'var(--flow-discharge)' : s.battery > ACTIVE_W ? 'var(--flow-charge)' : 'var(--muted-foreground)') : n === 'grid' ? 'var(--flow-grid-import)' : `var(--flow-${n})`; }

export function describe(s: EnergySnapshot, r: Routes) {
  const parts = [`Solar ${kw(s.solar)} kilowatts`];
  if (r.solarHome > ACTIVE_W) parts.push(`${kw(r.solarHome)} to the home`);
  if (r.solarBattery > ACTIVE_W) parts.push(`${kw(r.solarBattery)} charging the battery`);
  parts.push(s.gridDown ? 'Grid is down' : `grid import ${kw(s.grid)} kilowatts`, `home load ${kw(s.home)} kilowatts`, `battery ${s.soc == null ? 'unknown' : Math.round(s.soc) + ' percent'} ${batteryState(s)}`);
  return `${s.fresh ? 'Current' : 'Last recorded'} energy flow. ${parts.join(', ')}.`;
}

function tipFor(n: Node | 'inverter', s: EnergySnapshot, r: Routes, capacity: number): { title: string; rows: Row[] } {
  const d = s.detail;
  switch (n) {
    case 'solar': return { title: 'Solar', rows: [['PV voltage', num(d.pv_voltage, 0, ' V')], ['PV current', num(d.pv_current, 1, ' A')], ['Today', num(d.solar_today, 2, ' kWh')], ['To home', kw(r.solarHome) + ' kW'], ['To battery', kw(r.solarBattery) + ' kW']] };
    case 'grid': return { title: 'Grid', rows: s.gridDown ? [['Status', 'Grid down']] : [['Voltage', num(d.grid_voltage, 0, ' V')], ['Frequency', num(d.grid_frequency, 1, ' Hz')], ['To home', kw(r.gridHome) + ' kW'], ['To battery', kw(r.gridBattery) + ' kW']] };
    case 'battery': return { title: 'Battery', rows: [['Charge', num(s.soc, 0, '%')], ['Power', (s.battery < 0 ? '−' : '+') + kw(s.battery) + ' kW'], ['Voltage', num(d.battery_voltage, 1, ' V')], ['Stored', s.soc == null ? '—' : ((capacity * s.soc) / 100).toFixed(1) + ' kWh']] };
    case 'home': return { title: 'Home', rows: [['Output voltage', num(d.output_voltage, 0, ' V')], ['Frequency', num(d.output_frequency, 1, ' Hz')], ['Inverter load', num(d.output_load, 0, '%')], ['From solar', s.home > 0 ? Math.round((r.solarHome / s.home) * 100) + '%' : '—']] };
    default: return { title: 'Inverter', rows: [['Mode', s.mode ?? '—'], ['Temperature', num(d.inverter_temperature, 0, ' °C')], ['Apparent power', num(d.output_apparent_power, 0, ' VA')]] };
  }
}

function routeTip(n: Node, s: EnergySnapshot, r: Routes): { title: string; rows: Row[] } {
  const rows: Row[] = n === 'solar' ? [['Solar → Home', kw(r.solarHome) + ' kW'], ['Solar → Battery', kw(r.solarBattery) + ' kW']]
    : n === 'grid' ? [['Grid → Home', kw(r.gridHome) + ' kW'], ['Grid → Battery', kw(r.gridBattery) + ' kW']]
    : n === 'battery' ? [[s.battery >= 0 ? 'Inverter → Battery' : 'Battery → Inverter', kw(s.battery) + ' kW']]
    : [['Inverter → Home', kw(s.home) + ' kW']];
  return { title: LABEL[n] + ' line', rows };
}

function useReducedMotion() {
  const ref = useRef(false);
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)'), set = () => { ref.current = q.matches; };
    set(); q.addEventListener('change', set); return () => q.removeEventListener('change', set);
  }, []);
  return ref;
}

export const EnergyScene = memo(function EnergyScene({ snapshot, capacity }: { snapshot: EnergySnapshot; threshold?: number; capacity: number }) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), engine = useRef<Engine | null>(null);
  const callouts = useRef<Partial<Record<Node, HTMLElement | null>>>({});
  const values = useRef<Partial<Record<keyof Shown, HTMLElement | null>>>({});
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<Node | null>(null), [tip, setTip] = useState<Tip | null>(null);
  const routes = useMemo(() => allocate(snapshot.solar, snapshot.home, snapshot.battery), [snapshot]);
  const latest = useRef({ snapshot, routes, capacity });
  useEffect(() => { latest.current = { snapshot, routes, capacity }; });

  function place() {
    const e = engine.current; if (!e) return; const [W, H] = e.size(); if (!W) return;
    const scale = Math.max(0.9, Math.min(1.5, W / 400));
    for (const n of NODES) {
      const el = callouts.current[n]; if (!el) continue;
      const [ax, ay] = e.anchor(n), [ox, oy] = OFFSETS[n], hw = el.offsetWidth / 2 + 6, hh = el.offsetHeight / 2 + 6;
      el.style.left = Math.max(hw, Math.min(W - hw, ax + ox * scale)) + 'px';
      el.style.top = Math.max(hh, Math.min(H - hh, ay + oy * scale)) + 'px';
    }
  }

  useEffect(() => {
    const e = createEngine(canvas.current!, {
      reducedMotion: () => reduced.current,
      onFrame: shown => {
        const v = values.current;
        if (v.solar) v.solar.textContent = kw(shown.solar);
        if (v.home) v.home.textContent = kw(shown.home);
        if (v.grid) v.grid.textContent = kw(shown.grid);
        if (v.soc) v.soc.textContent = String(Math.round(shown.soc));
      },
    });
    engine.current = e; e.setSnapshot(latest.current.snapshot);
    const ro = new ResizeObserver(() => { e.resize(); place(); }); ro.observe(stage.current!);
    const io = new IntersectionObserver(([x]) => e.setVisible(x.isIntersecting)); io.observe(stage.current!);
    const mo = new MutationObserver(() => e.retheme()); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = matchMedia('(prefers-color-scheme: dark)'), onScheme = () => e.retheme(); scheme.addEventListener('change', onScheme);
    return () => { ro.disconnect(); io.disconnect(); mo.disconnect(); scheme.removeEventListener('change', onScheme); e.destroy(); engine.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { engine.current?.setSnapshot(snapshot); place(); }, [snapshot]);
  useEffect(() => { engine.current?.setSelected(selected); }, [selected]);

  function showNodeTip(n: Node) {
    const el = callouts.current[n], box = stage.current; if (!el || !box) return;
    const t = tipFor(n, latest.current.snapshot, latest.current.routes, latest.current.capacity);
    const left = el.offsetLeft, below = el.offsetTop < box.clientHeight / 2;
    setTip({ ...t, x: Math.max(8, Math.min(box.clientWidth - 228, left - 100)), y: below ? el.offsetTop + el.offsetHeight / 2 + 10 : Math.max(8, el.offsetTop - el.offsetHeight / 2 - 10 - (t.rows.length * 17 + 40)) });
  }
  function onMove(ev: React.PointerEvent) {
    if (ev.pointerType === 'touch' || (ev.target as HTMLElement).closest('.scene-callout')) return;
    const box = stage.current!.getBoundingClientRect(), x = ev.clientX - box.left, y = ev.clientY - box.top, hit = engine.current?.hitTest(x, y);
    if (!hit) return setTip(null);
    const { snapshot: s, routes: r, capacity: c } = latest.current;
    const t = hit.kind === 'inverter' ? tipFor('inverter', s, r, c) : routeTip(hit.node, s, r);
    setTip({ ...t, x: Math.max(8, Math.min(box.width - 228, x + 12)), y: Math.max(8, Math.min(box.height - 120, y + 12)) });
  }

  const b = batteryState(snapshot);
  const subs: Record<Node, string> = {
    solar: snapshot.solar < ACTIVE_W ? 'No sun right now' : `${kw(routes.solarHome)} home · ${kw(routes.solarBattery)} battery`,
    grid: snapshot.gridDown ? 'Grid down' : snapshot.grid < ACTIVE_W ? 'Not importing' : 'Importing',
    battery: b === 'idle' ? 'Idle' : `${b === 'charging' ? 'Charging +' : 'Discharging −'}${kw(snapshot.battery)} kW`,
    home: `${snapshot.home > 0 ? Math.round((routes.solarHome / snapshot.home) * 100) : 0}% from solar`,
  };
  const valueRef = (k: keyof Shown) => (el: HTMLElement | null) => { values.current[k] = el; };
  const initial: Record<Node, [string, string, keyof Shown]> = { solar: [kw(snapshot.solar), 'kW', 'solar'], grid: [kw(snapshot.grid), 'kW', 'grid'], battery: [String(Math.round(snapshot.soc ?? 0)), '%', 'soc'], home: [kw(snapshot.home), 'kW', 'home'] };

  const rows: [string, number, string, Node[]][] = [
    ['Solar → Home', routes.solarHome, 'var(--flow-solar)', ['solar', 'home']],
    ['Solar → Battery', routes.solarBattery, 'var(--flow-solar)', ['solar', 'battery']],
    ['Battery → Home', routes.batteryHome, 'var(--flow-discharge)', ['battery', 'home']],
    ['Grid → Home', routes.gridHome, 'var(--flow-grid-import)', ['grid', 'home']],
    ['Grid → Battery', routes.gridBattery, 'var(--flow-grid-import)', ['grid', 'battery']],
  ];
  const shownRows = selected ? rows.filter(r => r[3].includes(selected)) : rows, max = Math.max(500, ...rows.map(r => r[1]));

  return (
    <div className="energy-scene" data-stale={!snapshot.fresh}>
      <div ref={stage} className="scene-stage" onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        <canvas ref={canvas} role="img" aria-label={describe(snapshot, routes)} />
        {NODES.map(n => {
          const [text, unit, key] = initial[n];
          return (
            <button key={n} type="button" ref={el => { callouts.current[n] = el; }} className="scene-callout" style={{ ['--c' as string]: colorOf(n, snapshot), left: '50%', top: '50%' }} aria-pressed={selected === n}
              onClick={() => { setSelected(s => (s === n ? null : n)); try { navigator.vibrate?.(8); } catch {} }}
              onPointerEnter={ev => { if (ev.pointerType !== 'touch') showNodeTip(n); }} onPointerLeave={() => setTip(null)} onFocus={() => showNodeTip(n)} onBlur={() => setTip(null)}
              onKeyDown={ev => { if (ev.key === 'Escape') setTip(null); }}>
              <span className="lab">{LABEL[n]}<i aria-hidden="true">›</i></span>
              <span className="val"><span ref={valueRef(key)}>{text}</span><small>{unit}</small></span>
              <span className="sub">{subs[n]}</span>
            </button>
          );
        })}
        {tip && <div className="scene-tip" role="status" style={{ left: tip.x, top: tip.y }}><strong>{tip.title}</strong>{tip.rows.map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>)}</div>}
      </div>
      <div className="scene-breakdown" aria-live="polite">
        <header><span>{selected ? LABEL[selected] + ' routes' : 'Where the power goes'}</span>{selected ? <Link href={`/solar?entity=${selected}`}>View details ›</Link> : <span className="scene-pill">All routes</span>}</header>
        {shownRows.map(([name, w, color]) => (
          <div className="scene-row" key={name}><span>{name}</span><output>{kw(w)} kW</output><div className="track"><span className="fill" style={{ width: `${(w / max) * 100}%`, background: color }} /></div></div>
        ))}
      </div>
    </div>
  );
});
