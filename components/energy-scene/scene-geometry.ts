export type Vec3 = [number, number, number];
export type Node = 'solar' | 'grid' | 'battery' | 'home';
export type Lut = { path: [number, number][]; len: number; xs: Float32Array; ys: Float32Array; N: number };

const raw = (x: number, y: number, z: number): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z];

/** Isometric projection that fits the scene into a W x H box. */
export function makeProjection(W: number, H: number) {
  const pts = ([[-3.4, 11.4, 0], [-2.5, 10.5, 8.6], [-4.4, 10.5, 6.4], [10.6, 0, 0], [10.4, -0.6, 4.5], [0, 3.5, 8.1], [6.5, 10.8, 0]] as Vec3[]).map(p => raw(...p));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const S = Math.min((W * 0.9) / bw, (H * 0.74) / bh);
  const OX = W * 0.52 - ((Math.max(...xs) + Math.min(...xs)) / 2) * S;
  const OY = H * 0.52 - ((Math.max(...ys) + Math.min(...ys)) / 2) * S;
  const P = (x: number, y: number, z: number): [number, number] => { const r = raw(x, y, z); return [OX + r[0] * S, OY + r[1] * S]; };
  return { S, P };
}
export type Projection = ReturnType<typeof makeProjection>;

export const ANCHORS: Record<Node, Vec3> = { solar: [5, 5.2, 6.6], grid: [-2.5, 10.5, 8.6], battery: [2, 7.45, 2.9], home: [10.3, 6.1, 2.5] };
export const ROUTES: Record<Node, Vec3[]> = {
  solar: [[6.1, 7.12, 4.92], [6.1, 7.62, 4.5], [6.1, 7.62, 3.75], [6.1, 7.22, 3.32]],
  grid: [[-0.6, 10.5, 5.75], [-0.6, 10.5, 0.05], [6.1, 10.5, 0.05], [6.1, 7.05, 0.05], [6.1, 7.05, 2.0]],
  battery: [[5.5, 7.05, 2.65], [3.0, 7.05, 2.65], [3.0, 7.05, 1.4], [2.8, 7.45, 1.4]],
  home: [[6.7, 7.05, 2.65], [9.98, 7.05, 2.65], [10.03, 6.9, 2.65], [10.03, 6.55, 2.65]],
};
export const WINDOWS: [number, number][] = [[0.9, 2.5], [3.1, 4.7]];
/** Where each callout sits relative to its anchor, in px at the reference width. */
export const OFFSETS: Record<Node, [number, number]> = { solar: [70, -78], grid: [-10, -66], battery: [-34, 96], home: [10, 78] };

/** Rounded polyline resampled by arc length into a lookup table, so per-frame positions need no allocation. */
export function buildLut(pts: [number, number][]): Lut {
  const rad = 10, path: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]), d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(rad, d1 / 2, d2 / 2);
    const p1 = [b[0] - (b[0] - a[0]) * r / d1, b[1] - (b[1] - a[1]) * r / d1], p2 = [b[0] + (c[0] - b[0]) * r / d2, b[1] + (c[1] - b[1]) * r / d2];
    for (let t = 0; t <= 1.0001; t += 0.125) { const u = 1 - t; path.push([u * u * p1[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * b[1] + t * t * p2[1]]); }
  }
  path.push(pts[pts.length - 1]);
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const len = cum[cum.length - 1], N = 120, xs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * len;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    xs[i] = path[j][0] + (path[j + 1][0] - path[j][0]) * t; ys[i] = path[j][1] + (path[j + 1][1] - path[j][1]) * t;
  }
  return { path, len, xs, ys, N };
}

export function pointAt(l: Lut, f: number, out: [number, number]) {
  const p = f * l.N, i = Math.min(l.N - 1, Math.floor(p)), t = p - i;
  out[0] = l.xs[i] + (l.xs[i + 1] - l.xs[i]) * t; out[1] = l.ys[i] + (l.ys[i + 1] - l.ys[i]) * t;
  return out;
}

/** Distance in px from (x, y) to the nearest point of the route. */
export function distanceToLut(l: Lut, x: number, y: number) {
  let best = Infinity;
  for (let i = 0; i <= l.N; i++) { const d = Math.hypot(l.xs[i] - x, l.ys[i] - y); if (d < best) best = d; }
  return best;
}
