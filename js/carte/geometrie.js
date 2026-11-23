/* ASTERRE — carte/geometrie.js · Géométrie pure : courbes, contours ondulés, point dans polygone, semis aléatoire. */
import { rng } from "../utils.js?v=16";

/* ─────────────── Géométrie ─────────────── */
export function catmullPath(pts, closed) {
  if (pts.length < 3) return "M" + pts.map(p => p.join(",")).join(" L");
  const P = closed ? [...pts, pts[0], pts[1], pts[2]] : pts;
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - (closed ? 3 : 1); i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? d + " Z" : d;
}
export function wobble(pts, seed, amp = 9, sub = 3, closed = true) {
  const R = rng(seed), out = [];
  const n = pts.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = 0; j < sub; j++) {
      const t = j / sub, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const off = (R() - .5) * 2 * amp * (j === 0 ? .55 : 1);
      out.push([x + (-dy / L) * off, y + (dx / L) * off]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function scatterInPoly(poly, n, seed) {
  const R = rng(seed), xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out = []; let tries = 0;
  while (out.length < n && tries++ < n * 40) {
    const p = [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)];
    if (pointInPoly(p, poly)) out.push(p);
  }
  return out.sort((a, b) => a[1] - b[1]);
}
export function polyLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
