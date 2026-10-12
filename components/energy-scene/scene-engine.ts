import { allocate, particleCount, particleRadius, particleSpeed, ringPeriod, smoothstep, type EnergySnapshot } from '@/lib/energy-flow';
import { drawArt } from './scene-art';
import { ANCHORS, ROUTES, WINDOWS, buildLut, distanceToLut, makeProjection, pointAt, type Lut, type Node, type Projection, type Vec3 } from './scene-geometry';
import { makeSprite, mix, readTokens, rgba, type RGB, type Tokens } from './scene-tokens';

const NODES: Node[] = ['solar', 'grid', 'battery', 'home'];
const K = 9, C = 2 * Math.sqrt(K), MAXP = 14;
const RANK = [0, 7, 3, 11, 5, 13, 1, 9, 4, 12, 2, 10, 6, 8];
const STARS = Array.from({ length: 40 }, (_, i) => [((i * 97) % 100) / 100, ((i * 53) % 45) / 100, 0.4 + ((i * 31) % 10) / 16] as const);

export type Shown = { solar: number; home: number; grid: number; soc: number };
export type Hit = { kind: 'route'; node: Node } | { kind: 'inverter' };
type Spring = { x: number; v: number; phase: number };

export function createEngine(canvas: HTMLCanvasElement, opts: { reducedMotion: () => boolean; onFrame: (shown: Shown) => void }) {
  const ctx = canvas.getContext('2d')!, art = document.createElement('canvas');
  const springs = Object.fromEntries(NODES.map(k => [k, { x: 0, v: 0, phase: Math.random() }])) as Record<Node, Spring>;
  const shown = { solar: 0, home: 0, grid: 0, soc: 0 };
  const lut = {} as Record<Node, Lut>;
  let T: Tokens, proj: Projection, sprites = {} as Record<string, HTMLCanvasElement>;
  let W = 0, H = 0, dpr = 1, artDirty = true, battMix = 0, clock = 0, last = 0, raf = 0, visible = true, stale = false, selected: Node | null = null;
  let targets = { solar: 0, grid: 0, battery: 0, home: 0 }, goal: Shown = { solar: 0, home: 0, grid: 0, soc: 0 };
  const tmp: [number, number] = [0, 0];

  const poly = (pts: Vec3[], fill: string) => {
    ctx.beginPath(); pts.forEach((p, i) => { const q = proj.P(...p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  const routeColor = (k: Node): RGB => (k === 'battery' ? mix(T.charge, T.discharge, battMix) : T[k]);

  function retheme() {
    T = readTokens(canvas);
    sprites = { solar: makeSprite(T.solar), grid: makeSprite(T.grid), home: makeSprite(T.home), charge: makeSprite(T.charge), discharge: makeSprite(T.discharge) };
    artDirty = true;
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    proj = makeProjection(W, H);
    for (const k of NODES) lut[k] = buildLut(ROUTES[k].map(p => proj.P(...p)));
    artDirty = true; start();
  }

  function draw(dt: number) {
    if (!W) return;
    if (artDirty) { drawArt(art, W, H, dpr, proj, T); artDirty = false; }
    const { P, S } = proj, add = T.light ? 'source-over' : 'lighter', calm = opts.reducedMotion();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const daylight = smoothstep(0, 2500, Math.max(0, springs.solar.x));
    const top = mix(T['sky-night-top'], T['sky-day-top'], daylight), bot = mix(T['sky-night-bot'], T['sky-day-bot'], daylight);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, rgba(top)); sky.addColorStop(0.75, rgba(bot)); sky.addColorStop(1, rgba(bot));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (daylight < 0.9) STARS.forEach(([x, y, r], i) => { ctx.fillStyle = `rgba(255,255,255,${(1 - daylight) * (0.35 + (calm ? 0 : 0.35 * Math.sin(clock * 1.3 + i)))})`; ctx.beginPath(); ctx.arc(x * W, y * H, r, 0, 7); ctx.fill(); });
    if (daylight > 0.05) { const sun = ctx.createRadialGradient(W * 0.86, H * 0.1, 0, W * 0.86, H * 0.1, W * 0.35); sun.addColorStop(0, `rgba(255,236,170,${0.55 * daylight})`); sun.addColorStop(1, 'rgba(255,236,170,0)'); ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(art, 0, 0, W, H);

    // shimmer across the panels in proportion to solar output
    if (!calm && springs.solar.x > 50) {
      const a0 = P(0, 3.6, 7.9), a1 = P(10, 7.5, 4.6), sweep = (clock * 0.25) % 1.6 - 0.3, cl = (v: number) => Math.min(1, Math.max(0, v));
      const gl = ctx.createLinearGradient(a0[0], a0[1], a1[0], a1[1]), a = 0.18 * smoothstep(50, 3000, springs.solar.x);
      gl.addColorStop(cl(sweep - 0.12), 'rgba(255,255,255,0)'); gl.addColorStop(cl(sweep), `rgba(255,255,255,${a})`); gl.addColorStop(cl(sweep + 0.12), 'rgba(255,255,255,0)');
      ctx.save(); ctx.beginPath(); ([[0.5, 3.9, 7.6], [10, 3.9, 7.6], [10, 7.2, 4.8], [0.5, 7.2, 4.8]] as Vec3[]).forEach((p, i) => { const q = P(...p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath(); ctx.clip(); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H); ctx.restore();
    }

    // windows: four panes each, warmth follows home load (more at night)
    const load = smoothstep(100, 3500, springs.home.x) * (1 - daylight * 0.55);
    const glass = rgba(mix(T['window-off'], T['window-on'], Math.min(1, 0.15 + load)));
    WINDOWS.forEach(([y0, y1]) => {
      const ym = (y0 + y1) / 2;
      [[y0, ym - 0.05], [ym + 0.05, y1]].forEach(([a, b]) => [[1.6, 2.57], [2.63, 3.6]].forEach(([z0, z1]) => poly([[10.02, a, z0], [10.02, b, z0], [10.02, b, z1], [10.02, a, z1]], glass)));
      if (load > 0.05) { const wc = P(10, ym, 2.6), wg = ctx.createRadialGradient(wc[0], wc[1], 0, wc[0], wc[1], S * 2.6); wg.addColorStop(0, rgba(T['window-on'], 0.3 * load)); wg.addColorStop(1, rgba(T['window-on'], 0)); ctx.fillStyle = wg; ctx.fillRect(wc[0] - S * 3, wc[1] - S * 3, S * 6, S * 6); }
    });

    // battery cabinet with live state-of-charge segments
    const front = rgba(T.box), side = rgba(T['box-side']), topc = rgba(mix(T.box, [255, 255, 255], 0.3));
    poly([[1.2, 7.9, 0], [2.8, 7.9, 0], [2.8, 7.9, 2.8], [1.2, 7.9, 2.8]], front);
    poly([[2.8, 7, 0], [2.8, 7.9, 0], [2.8, 7.9, 2.8], [2.8, 7, 2.8]], side);
    poly([[1.2, 7, 2.8], [2.8, 7, 2.8], [2.8, 7.9, 2.8], [1.2, 7.9, 2.8]], topc);
    const bcol = routeColor('battery'), filled = (shown.soc / 100) * 5;
    for (let i = 0; i < 5; i++) { const z0 = 0.35 + i * 0.4, z1 = z0 + 0.28, f = Math.max(0, Math.min(1, filled - i)); poly([[1.45, 7.91, z0], [2.55, 7.91, z0], [2.55, 7.91, z1], [1.45, 7.91, z1]], rgba(mix(T.conduit, bcol, f), 0.95)); }

    // conduits: idle base, glow and bright core in the route colour
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const k of NODES) {
      const l = lut[k], act = smoothstep(0, 40, Math.abs(springs[k].x)), col = routeColor(k), dim = selected && selected !== k && !linked(selected, k) ? 0.35 : 1;
      ctx.beginPath(); l.path.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.strokeStyle = rgba(T.conduit, 0.9); ctx.lineWidth = 3.2; ctx.stroke();
      if (act > 0.01) { ctx.globalCompositeOperation = add; ctx.strokeStyle = rgba(col, 0.16 * act * dim); ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = rgba(col, 0.75 * act * dim); ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
    }

    // particles flow from sources to sinks; static arrowheads when motion is reduced
    for (const k of NODES) {
      const l = lut[k], s = springs[k], w = Math.abs(s.x), act = smoothstep(0, 40, w);
      if (act < 0.01) continue;
      // every table runs source to sink (panels, tower or inverter outward), so a positive value follows it and a negative one reverses
      const dir = Math.sign(s.x) || 1;
      if (calm) { arrows(l, dir, routeColor(k), act); continue; }
      s.phase = (s.phase + dir * (particleSpeed(w) / l.len) * dt + 10) % 1;
      const density = Math.min(MAXP, particleCount(w) * (l.len / 160)), size = particleRadius(w) * 6;
      ctx.globalCompositeOperation = add;
      for (let i = 0; i < MAXP; i++) {
        const vis = Math.max(0, Math.min(1, density - RANK[i])) * act; if (vis < 0.01) continue;
        const f = (s.phase + i / MAXP) % 1, a = vis * smoothstep(0, 0.06, f) * smoothstep(1, 0.94, f);
        pointAt(l, f, tmp);
        if (k === 'battery') {
          ctx.globalAlpha = a * (1 - battMix); ctx.drawImage(sprites.charge, tmp[0] - size / 2, tmp[1] - size / 2, size, size);
          ctx.globalAlpha = a * battMix; ctx.drawImage(sprites.discharge, tmp[0] - size / 2, tmp[1] - size / 2, size, size);
        } else { ctx.globalAlpha = a; ctx.drawImage(sprites[k], tmp[0] - size / 2, tmp[1] - size / 2, size, size); }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // breathing rings at each node
    for (const k of NODES) {
      const w = Math.abs(springs[k].x), act = smoothstep(0, 40, w), c = P(...ANCHORS[k]), col = routeColor(k);
      const period = calm ? 1e9 : ringPeriod(w);
      for (let j = 0; j < 2; j++) {
        const ph = ((clock / period) + j / 2) % 1, r = 9 + 16 * ph;
        ctx.strokeStyle = rgba(col, (1 - ph) * 0.55 * Math.max(act, 0.15) * (selected && selected !== k ? 0.35 : 1)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(c[0], c[1], r, r * 0.62, 0, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = rgba(col, 0.25 + 0.6 * act); ctx.beginPath(); ctx.ellipse(c[0], c[1], 4, 2.6, 0, 0, 7); ctx.fill();
    }
  }

  function linked(a: Node, b: Node) { return a === 'solar' ? b === 'home' || b === 'battery' : a === 'grid' ? b === 'home' || b === 'battery' : true; }
  function arrows(l: Lut, dir: number, col: RGB, act: number) {
    ctx.fillStyle = rgba(col, 0.9 * act);
    for (const f of [0.3, 0.7]) {
      const a = pointAt(l, f, [0, 0]), b = pointAt(l, Math.min(1, Math.max(0, f + 0.02 * dir)), [0, 0]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-4, 4.5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    let moving = false;
    for (const k of NODES) {
      const s = springs[k], g = stale ? 0 : targets[k];
      s.v += (K * (g - s.x) - C * s.v) * dt; s.x += s.v * dt;
      if (Math.abs(g - s.x) > 1 || Math.abs(s.v) > 1) moving = true;
    }
    battMix += ((springs.battery.x >= 0 ? 0 : 1) - battMix) * Math.min(1, dt * 3);
    const e = Math.min(1, dt * 6);
    for (const key of ['solar', 'home', 'grid', 'soc'] as const) { const d = goal[key] - shown[key]; if (Math.abs(d) > 0.01) moving = true; shown[key] += d * e; }
    draw(dt); opts.onFrame(shown);
    const animated = !opts.reducedMotion() && !stale;
    raf = visible && (moving || animated) ? requestAnimationFrame(tick) : 0;
  }
  function start() { if (!raf && visible) raf = requestAnimationFrame(t => { last = t; tick(t); }); }

  retheme();
  return {
    setSnapshot(s: EnergySnapshot) {
      const r = allocate(s.solar, s.home, s.battery);
      // the grid cable only carries power the inverter takes in; during an outage it is idle
      targets = { solar: r.solarHome + r.solarBattery, grid: s.gridDown ? 0 : r.gridHome + r.gridBattery, battery: s.battery, home: s.home };
      goal = { solar: s.solar, home: s.home, grid: r.gridHome + r.gridBattery, soc: s.soc ?? 0 };
      stale = !s.fresh; start();
    },
    setSelected(n: Node | null) { selected = n; start(); },
    setVisible(v: boolean) { visible = v; if (v) start(); },
    resize, retheme() { retheme(); start(); },
    anchor(n: Node) { return W ? proj.P(...ANCHORS[n]) : ([0, 0] as [number, number]); },
    size: () => [W, H] as const,
    hitTest(x: number, y: number): Hit | null {
      if (!W) return null;
      const inv = [proj.P(5.5, 7.35, 3.3), proj.P(6.7, 7.35, 3.3), proj.P(6.7, 7.35, 2.0), proj.P(5.5, 7.35, 2.0)];
      const xs = inv.map(p => p[0]), ys = inv.map(p => p[1]);
      if (x >= Math.min(...xs) - 4 && x <= Math.max(...xs) + 4 && y >= Math.min(...ys) - 4 && y <= Math.max(...ys) + 4) return { kind: 'inverter' };
      let best: Node | null = null, bd = 10;
      for (const k of NODES) { const d = distanceToLut(lut[k], x, y); if (d < bd) { bd = d; best = k; } }
      return best ? { kind: 'route', node: best } : null;
    },
    destroy() { cancelAnimationFrame(raf); raf = 0; visible = false; },
  };
}
export type Engine = ReturnType<typeof createEngine>;
