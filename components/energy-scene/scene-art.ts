import { WINDOWS, type Vec3, type Projection } from './scene-geometry';
import { mix, rgba, type Tokens } from './scene-tokens';

/** Draws the static isometric house, tower and equipment into `art`. Called once per size or theme. */
export function drawArt(art: HTMLCanvasElement, w: number, h: number, dpr: number, { S, P }: Projection, T: Tokens) {
  art.width = Math.round(w * dpr); art.height = Math.round(h * dpr);
  const g = art.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const poly = (pts: Vec3[], fill: string | CanvasGradient) => {
    g.beginPath(); pts.forEach((p, i) => { const q = P(...p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, front: string, side: string, top: string) => {
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], front);
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], side);
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
  };
  const line = (a: Vec3, b: Vec3) => { const m = P(...a), n = P(...b); g.beginPath(); g.moveTo(m[0], m[1]); g.lineTo(n[0], n[1]); g.stroke(); };
  const boxFill = [rgba(T.box), rgba(T['box-side']), rgba(mix(T.box, [255, 255, 255], 0.3))] as const;

  // ground pad
  g.save(); const c = P(4, 8, 0); g.translate(c[0], c[1]); g.scale(1, 0.5);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 11); gr.addColorStop(0, rgba(T.ground, 0.95)); gr.addColorStop(1, rgba(T.ground, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S * 11, 0, Math.PI * 2); g.fill(); g.restore();

  // lattice tower: tapered legs, cross bracing, two truss crossarms, insulators, sagging lines
  const px = -2.5, py = 10.5;
  const half = (z: number) => (z <= 5 ? 1.0 - 0.65 * (z / 5) : 0.35 - 0.1 * ((z - 5) / 3));
  const corner = (sx: number, sy: number, z: number): Vec3 => [px + sx * half(z), py + sy * half(z), z];
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  g.strokeStyle = rgba(T.pylon, 0.55); g.lineWidth = 0.8;
  ([[6.2, 1.9], [7.3, 1.4]] as [number, number][]).forEach(([z, wd]) => [-1, 1].forEach(sd => {
    const a = P(px + sd * wd, py, z - 0.45), far = P(px + sd * wd - 16, py - 3, z + 1.2), mid = [(a[0] + far[0]) / 2, (a[1] + far[1]) / 2 + S * 1.4];
    g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mid[0], mid[1], far[0], far[1]); g.stroke();
  }));
  corners.forEach(([sx, sy]) => box(px + sx - 0.18, px + sx + 0.18, py + sy - 0.18, py + sy + 0.18, 0, 0.25, rgba(T.footing), rgba(mix(T.footing, [0, 0, 0], 0.2)), rgba(mix(T.footing, [255, 255, 255], 0.15))));
  g.strokeStyle = rgba(T.pylon, 0.95); g.lineWidth = 1.3;
  corners.forEach(([sx, sy]) => { for (let z = 0; z < 8; z += 0.5) line(corner(sx, sy, z), corner(sx, sy, z + 0.5)); });
  g.lineWidth = 0.7;
  const levels = [0.25, 1.4, 2.6, 3.8, 5.0, 6.2, 7.3, 8.0];
  for (let i = 0; i < levels.length - 1; i++) {
    const z0 = levels[i], z1 = levels[i + 1];
    line(corner(-1, 1, z0), corner(1, 1, z1)); line(corner(1, 1, z0), corner(-1, 1, z1));
    line(corner(1, -1, z0), corner(1, 1, z1)); line(corner(1, 1, z0), corner(1, -1, z1));
    line(corner(-1, 1, z1), corner(1, 1, z1)); line(corner(1, -1, z1), corner(1, 1, z1));
  }
  const peak: Vec3 = [px, py, 8.6]; corners.forEach(([sx, sy]) => line(corner(sx, sy, 8), peak));
  g.lineWidth = 1.1;
  ([[6.2, 1.9], [7.3, 1.4]] as [number, number][]).forEach(([z, wd]) => [-1, 1].forEach(sd => {
    const tip: Vec3 = [px + sd * wd, py, z], hh = half(z);
    line([px + sd * hh, py + hh, z], tip); line([px + sd * hh, py - hh, z], tip); line([px + sd * hh, py + hh, z + 0.45], tip); line([px + sd * hh, py - hh, z + 0.45], tip);
    g.lineWidth = 1.8; g.strokeStyle = rgba(T.frame, 0.95); line(tip, [tip[0], tip[1], z - 0.45]);
    g.lineWidth = 1.1; g.strokeStyle = rgba(T.pylon, 0.95);
  }));

  // house
  poly([[-0.4, 3.5, 8], [10.4, 3.5, 8], [10.4, -0.6, 4.5], [-0.4, -0.6, 4.5]], rgba(T['roof-back']));
  poly([[0, 7, 0], [10, 7, 0], [10, 7, 5], [0, 7, 5]], rgba(T['wall-l']));
  poly([[10, 0, 0], [10, 7, 0], [10, 7, 5], [10, 3.5, 8], [10, 0, 5]], rgba(T['wall-r']));
  poly([[7.4, 7.01, 0], [8.6, 7.01, 0], [8.6, 7.01, 2.3], [7.4, 7.01, 2.3]], rgba(mix(T['wall-l'], [0, 0, 0], 0.25)));
  poly([[-0.4, 3.5, 8], [10.4, 3.5, 8], [10.4, 7.6, 4.5], [-0.4, 7.6, 4.5]], rgba(T.roof));

  // 8 framed solar modules (2 rows x 4) with cell grid, standoff shadow and a gloss band
  const onRoof = (x: number, v: number, lift = 0): Vec3 => [x, 3.5 + 4.1 * v, 8 - 3.5 * v + lift];
  const quad = (x0: number, x1: number, v0: number, v1: number, lift = 0): Vec3[] => [onRoof(x0, v0, lift), onRoof(x1, v0, lift), onRoof(x1, v1, lift), onRoof(x0, v1, lift)];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const x0 = 0.55 + k * 2.3, x1 = x0 + 2.18, v0 = 0.1 + r * 0.39, v1 = v0 + 0.37;
    poly(quad(x0 + 0.08, x1 + 0.08, v0 + 0.02, v1 + 0.03), rgba([0, 0, 0], 0.28));
    poly(quad(x0, x1, v0, v1, 0.12), rgba(T.frame));
    const ix0 = x0 + 0.07, ix1 = x1 - 0.07, iv0 = v0 + 0.025, iv1 = v1 - 0.025, inner = quad(ix0, ix1, iv0, iv1, 0.13);
    const a = P(...inner[0]), b = P(...inner[2]), lg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
    lg.addColorStop(0, rgba(T['panel-b'])); lg.addColorStop(1, rgba(T['panel-a']));
    poly(inner, lg);
    g.strokeStyle = rgba(T['panel-line'], 0.35); g.lineWidth = 0.5;
    for (let i = 1; i < 6; i++) { const x = ix0 + ((ix1 - ix0) * i) / 6; line(onRoof(x, iv0, 0.13), onRoof(x, iv1, 0.13)); }
    for (let i = 1; i < 4; i++) { const v = iv0 + ((iv1 - iv0) * i) / 4; line(onRoof(ix0, v, 0.13), onRoof(ix1, v, 0.13)); }
    const ga = P(...onRoof(ix0, iv0, 0.13)), gb = P(...onRoof(ix1, iv1, 0.13)), gloss = g.createLinearGradient(ga[0], ga[1], gb[0], gb[1]);
    gloss.addColorStop(0.15, 'rgba(255,255,255,0)'); gloss.addColorStop(0.3, 'rgba(255,255,255,0.16)'); gloss.addColorStop(0.42, 'rgba(255,255,255,0)');
    poly(inner, gloss);
  }
  // junction box under the array where the solar cable starts
  const jb = onRoof(6.1, 0.9);
  box(jb[0] - 0.3, jb[0] + 0.3, jb[1] - 0.1, jb[1] + 0.15, jb[2] - 0.05, jb[2] + 0.22, ...boxFill);
  // window frames and sills on the right wall (glass is drawn live)
  WINDOWS.forEach(([y0, y1]) => {
    poly([[10.01, y0 - 0.12, 1.48], [10.01, y1 + 0.12, 1.48], [10.01, y1 + 0.12, 3.72], [10.01, y0 - 0.12, 3.72]], rgba(T.frame));
    box(10, 10.22, y0 - 0.2, y1 + 0.2, 1.36, 1.48, ...boxFill);
  });
  // meter and breaker board where the home cable ends
  box(10, 10.3, 5.7, 6.5, 1.9, 3.1, ...boxFill);
  poly([[10.31, 5.85, 2.55], [10.31, 6.35, 2.55], [10.31, 6.35, 2.9], [10.31, 5.85, 2.9]], rgba([20, 32, 52]));
  // inverter
  box(5.5, 6.7, 7, 7.35, 2.0, 3.3, ...boxFill);
  poly([[5.75, 7.36, 2.6], [6.45, 7.36, 2.6], [6.45, 7.36, 3.05], [5.75, 7.36, 3.05]], rgba([20, 32, 52]));
}
