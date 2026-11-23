/* ASTERRE — carte/vue.js · Vue de la carte : viewBox, zoom, animation, coordonnées souris. */
import { S } from "../etat.js?v=15";
import { $ } from "../utils.js?v=15";

/* ─────────────── Vue / pan / zoom ─────────────── */
export function appliquerVB() { $("#carte").setAttribute("viewBox", `${S.vb.x} ${S.vb.y} ${S.vb.w} ${S.vb.h}`); }
export function zoomer(f, cx, cy) {
  const v = S.vb;
  const nw = Math.min(2600, Math.max(130, v.w * f));
  const k = nw / v.w;
  const px = cx == null ? v.x + v.w / 2 : cx, py = cy == null ? v.y + v.h / 2 : cy;
  v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k;
  v.w = nw; v.h = v.h * k;
  appliquerVB();
}
export function zoomVers(pos, largeur = 520) {
  const cible = { w: largeur, h: largeur * S.vb0.h / S.vb0.w };
  cible.x = pos[0] - cible.w / 2; cible.y = pos[1] - cible.h / 2;
  animerVB(cible);
}
export function animerVB(cible) {
  const dep = { ...S.vb }, t0 = performance.now(), D = 550;
  function pas(t) {
    const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
    for (const a of ["x", "y", "w", "h"]) S.vb[a] = dep[a] + (cible[a] - dep[a]) * e;
    appliquerVB();
    if (k < 1) requestAnimationFrame(pas);
  }
  requestAnimationFrame(pas);
}
export function coordsSouris(e) {
  const svg = $("#carte"), r = svg.getBoundingClientRect();
  return [S.vb.x + (e.clientX - r.left) / r.width * S.vb.w, S.vb.y + (e.clientY - r.top) / r.height * S.vb.h];
}
