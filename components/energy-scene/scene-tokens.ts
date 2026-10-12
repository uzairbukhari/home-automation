export type RGB = [number, number, number];
const NAMES = ['solar', 'grid', 'charge', 'discharge', 'home', 'sky-day-top', 'sky-day-bot', 'sky-night-top', 'sky-night-bot', 'wall-l', 'wall-r', 'roof', 'roof-back', 'panel-a', 'panel-b', 'panel-line', 'ground', 'conduit', 'pylon', 'window-off', 'window-on', 'box', 'box-side', 'frame', 'footing'] as const;
export type Tokens = Record<(typeof NAMES)[number], RGB> & { light: boolean };

const hex = (h: string): RGB => { h = h.trim().replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
export const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
export const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Reads the scene colours from CSS variables on the element, so themes stay in one place (scene.css). */
export function readTokens(el: Element): Tokens {
  const cs = getComputedStyle(el), t = {} as Tokens;
  for (const n of NAMES) t[n] = hex(cs.getPropertyValue('--scene-' + n));
  t.light = cs.getPropertyValue('color-scheme').trim() === 'light';
  return t;
}

export function makeSprite(c: RGB) {
  const s = document.createElement('canvas'); s.width = s.height = 64;
  const g = s.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, rgba(mix(c, [255, 255, 255], 0.5), 0.95));
  r.addColorStop(0.35, rgba(c, 0.45)); r.addColorStop(1, rgba(c, 0));
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return s;
}
