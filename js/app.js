"use strict";
/* ══════════════════════════════════════════════════════════
   ASTERRE — Carte Interactive du Monde
   Données : data/monde.json + un fichier par pays.
   La carte est stylisée ; les durées de voyage se calculent
   sur les distances canoniques du graphe des routes.
   ══════════════════════════════════════════════════════════ */

const IS_BROWSER = typeof window !== "undefined";
const SVGNS = "http://www.w3.org/2000/svg";

const S = {
  monde: null, pays: null, lieux: {}, sousLieux: {}, graphe: {},
  mj: false, vue: "carte", reveals: new Set(), masques: new Set(),
  voyage: { actif: false, etapes: [], modifs: new Set(), choix: {} },
  vb: { x: 0, y: 0, w: 2000, h: 1500 }, vb0: null,
  kmParUnite: 0.22
};
function estRevele(id) { return S.reveals.has(id); }
function sauveReveals() { try { localStorage.setItem("asterre-reveals", JSON.stringify([...S.reveals])); localStorage.setItem("asterre-masques", JSON.stringify([...S.masques])); } catch (e) {} }
function chargeReveals() {
  try { S.reveals = new Set(JSON.parse(localStorage.getItem("asterre-reveals") || "[]")); } catch (e) { S.reveals = new Set(); }
  try { S.masques = new Set(JSON.parse(localStorage.getItem("asterre-masques") || "[]")); } catch (e) { S.masques = new Set(); }
}

/* ─────────────── Utilitaires ─────────────── */
const $ = s => document.querySelector(s);
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in (attrs || {})) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("visible");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("visible"), 2600);
}

/* ─────────────── Géométrie ─────────────── */
function catmullPath(pts, closed) {
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
function wobble(pts, seed, amp = 9, sub = 3, closed = true) {
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
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function scatterInPoly(poly, n, seed) {
  const R = rng(seed), xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out = []; let tries = 0;
  while (out.length < n && tries++ < n * 40) {
    const p = [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)];
    if (pointInPoly(p, poly)) out.push(p);
  }
  return out.sort((a, b) => a[1] - b[1]);
}
function polyLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

/* ─────────────── Chargement ─────────────── */
async function boot() {
  try {
    S.monde = await (await fetch("data/monde.json")).json();
    const actifs = S.monde.pays.filter(p => p.actif && p.fichier);
    S.pays = await (await fetch(actifs[0].fichier)).json();
  } catch (e) {
    $("#chargement").innerHTML = "Impossible de lire les données.<br><small style='font-size:14px'>Si vous avez ouvert le fichier en double-cliquant (file://), lancez plutôt un petit serveur local — voir le README — ou déployez sur GitHub Pages.</small>";
    return;
  }
  for (const l of S.pays.lieux) {
    S.lieux[l.id] = l;
    for (const sl of (l.lieuxNotables || [])) S.sousLieux[sl.id] = { ...sl, parent: l.id };
  }
  S.graphe = construireGraphe(S.pays.routes);
  S.mj = sessionStorage.getItem("asterre-mj") === "1";
  chargeReveals();
  majBoutonMJ();
  const vb = S.monde.vueMonde.viewBox;
  S.vb = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  S.vb0 = { ...S.vb };
  // échelle km/unité dérivée des routes maritimes canoniques
  const refs = S.pays.routes.filter(r => r.type === "maritime");
  if (refs.length) S.kmParUnite = refs.reduce((s, r) => s + r.km / polyLength(r.points), 0) / refs.length;
  $("#titre-monde").textContent = S.monde.monde.toUpperCase();
  $("#sous-titre").textContent = S.pays.nom;
  renderCarte(); renderLegende(); construireCodex(); remplirRecherche(); brancherUI();
  $("#chargement").remove();
}

/* ─────────────── Rendu de la carte ─────────────── */
const COULEURS = {
  ileFill: "#cfc190", ileTrait: "#3f331f",
  prairie: "#a3ba74", foret: "#7d955e", "foret-neige": "#dde5df",
  "montagne-neige": "#e7e9e4", marais: "#8f9c6d", colline: "#c4b684", ville: "#c9b78d"
};

function renderCarte() {
  const svg = $("#carte");
  svg.innerHTML = "";
  appliquerVB();

  // ── defs
  const defs = el("defs", {}, svg);
  const grad = el("radialGradient", { id: "mer-grad", cx: "50%", cy: "38%", r: "85%" }, defs);
  el("stop", { offset: "0%", "stop-color": "#4b7d88" }, grad);
  el("stop", { offset: "70%", "stop-color": "#396a75" }, grad);
  el("stop", { offset: "100%", "stop-color": "#2c545e" }, grad);
  const gradIle = el("linearGradient", { id: "ile-grad", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
  el("stop", { offset: "0%", "stop-color": "#d6c99b" }, gradIle);
  el("stop", { offset: "100%", "stop-color": "#c8b783" }, gradIle);

  const M = S.monde.vueMonde.viewBox;
  el("rect", { x: M[0] - 400, y: M[1] - 400, width: M[2] + 800, height: M[3] + 800, fill: "url(#mer-grad)" }, svg);

  // vaguelettes éparses
  const gV = el("g", { opacity: .28, stroke: "#bcd7db", "stroke-width": 1.6, fill: "none", "stroke-linecap": "round" }, svg);
  const RV = rng(777);
  for (let i = 0; i < 90; i++) {
    const x = M[0] + RV() * M[2], y = M[1] + RV() * M[3];
    if (S.pays.iles.some(il => pointInPoly([x, y], il.forme))) continue;
    el("path", { d: `M${x},${y} q6,-4 12,0 q6,4 12,0` }, gV);
  }

  const gCotes = el("g", {}, svg);
  const gIles = el("g", {}, svg);
  const gZones = el("g", {}, svg);
  const gFleuves = el("g", {}, svg);
  const gVoies = el("g", {}, svg);
  const gTrajet = el("g", { id: "g-trajet" }, svg);
  const gMarqueurs = el("g", { id: "g-marqueurs" }, svg);
  const gTextes = el("g", {}, svg);

  // ── îles + anneaux côtiers
  for (const ile of S.pays.iles) {
    const w = wobble(ile.forme, ile.seed, ile.type === "ilot" ? 4 : 10, 3);
    const d = catmullPath(w, true);
    for (const [larg, op] of [[30, .12], [18, .18], [9, .3]])
      el("path", { d, fill: "none", stroke: "#cfe4e6", "stroke-width": larg, opacity: op, "stroke-linejoin": "round" }, gCotes);
    el("path", { d, fill: "url(#ile-grad)", stroke: COULEURS.ileTrait, "stroke-width": 2.4, "stroke-linejoin": "round" }, gIles);
    // hachures d'ombre côté sud-est (style carte ancienne)
    el("path", { d, fill: "none", stroke: "#7a6a45", "stroke-width": 5, opacity: .18, transform: "translate(3,4)" }, gIles);

    for (const z of (ile.zones || [])) dessinerZone(gZones, z, ile.seed);
    for (const f of (ile.fleuves || [])) {
      const fp = wobble(f.points, ile.seed + 5, 5, 4, false);
      el("path", { d: catmullPath(fp, false), fill: "none", stroke: "#4f8794", "stroke-width": 4.5, "stroke-linecap": "round", opacity: .9 }, gFleuves);
      el("path", { d: catmullPath(fp, false), fill: "none", stroke: "#9cc4cb", "stroke-width": 1.6, "stroke-linecap": "round" }, gFleuves);
    }
    if (ile.nom && ile.labelPos)
      el("text", { x: ile.labelPos[0], y: ile.labelPos[1], "text-anchor": "middle", "font-size": ile.id === "limehahu" ? 40 : 30, class: "label-ile" }, gTextes).textContent = ile.nom;
  }

  // ── routes & voies maritimes
  for (const r of S.pays.routes) {
    const d = catmullPath(r.points, false);
    let attrs;
    if (r.type === "route") attrs = { stroke: "#5a4326", "stroke-width": 3.2, "stroke-dasharray": "12 7" };
    else if (r.type === "piste") attrs = { stroke: "#6b5638", "stroke-width": 2.4, "stroke-dasharray": "3 7" };
    else if (r.type === "montagne") attrs = { stroke: "#4c3a22", "stroke-width": 2.4, "stroke-dasharray": "2 8" };
    else if (r.type === "cotier") attrs = { stroke: "#dceef0", "stroke-width": 2, "stroke-dasharray": "2 9", opacity: .8 };
    else attrs = { stroke: r.danger ? "#a9c4c8" : "#cfe4e6", "stroke-width": 2.2, "stroke-dasharray": "10 12", opacity: r.danger ? .5 : .75 };
    el("path", { d, fill: "none", "stroke-linecap": "round", ...attrs }, gVoies);
  }

  // ── vers le continent
  const cont = S.monde.pays.find(p => p.id === "continent");
  if (cont) {
    const g = el("g", { opacity: .85 }, gTextes);
    el("path", { d: "M1880,640 h82 m-14,-11 l14,11 l-14,11", fill: "none", stroke: "#e8dcb8", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    const t1 = el("text", { x: 1918, y: 618, "text-anchor": "middle", "font-size": 20, class: "label-ile", fill: "#e8dcb8" }, g);
    t1.textContent = "Vers le Continent";
    const t2 = el("text", { x: 1918, y: 676, "text-anchor": "middle", "font-size": 14, class: "label-ile", fill: "#cfe0e2" }, g);
    t2.textContent = `${cont.distanceDepuis.km} km — 3 j de navire`;
  }

  for (const lb of (S.pays.labels || [])) {
    const t = el("text", { x: lb.pos[0], y: lb.pos[1], "text-anchor": "middle", "font-size": lb.taille || 15, class: "label-ile",
      transform: lb.angle ? `rotate(${lb.angle} ${lb.pos[0]} ${lb.pos[1]})` : "" }, gTextes);
    t.textContent = lb.texte;
  }
  dessinerRose(gTextes, 1000, 218, 62);
  dessinerEchelle(gTextes, 830, 1442);

  // ── marqueurs & noms de lieux
  for (const l of S.pays.lieux) {
    const g = el("g", { class: "marqueur", "data-id": l.id, tabindex: 0, role: "button", "aria-label": l.nom }, gMarqueurs);
    dessinerMarqueur(g, l);
    const ty = l.pos[1] + (l.type === "capitale" ? 40 : 32);
    el("text", { x: l.pos[0], y: ty, "text-anchor": "middle", "font-size": tailleLabel(l.type), class: "label-lieu" }, g).textContent = l.nom;
    g.addEventListener("click", () => clicLieu(l.id));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clicLieu(l.id); } });
  }
}
function tailleLabel(type) { return { capitale: 22, ville: 18, "ville-detruite": 18, academie: 17, village: 14, "lieu-dit": 13, danger: 15 }[type] || 14; }

function dessinerZone(g, z, seed) {
  const c = COULEURS[z.type];
  const wp = wobble(z.poly, seed + 91, 12, 2);
  el("path", { d: catmullPath(wp, true), fill: c, opacity: z.type.includes("neige") ? .85 : .55, stroke: "none" }, g);
  const pts = scatterInPoly(z.poly, z.densite || 12, seed + 13);
  const R = rng(seed + 29);
  for (const p of pts) glyphe(g, z.type, p[0], p[1], R);
}
function glyphe(g, type, x, y, R) {
  const s = 8 + R() * 7;
  if (type === "montagne-neige") {
    el("path", { d: `M${x - s},${y} L${x},${y - s * 1.7} L${x + s},${y} Z`, fill: "#d9d6cb", stroke: "#40331e", "stroke-width": 1.5, "stroke-linejoin": "round" }, g);
    el("path", { d: `M${x},${y - s * 1.7} L${x + s},${y} L${x + s * .25},${y} Z`, fill: "#a99e87", opacity: .5 }, g);
    el("path", { d: `M${x - s * .34},${y - s * 1.12} L${x},${y - s * 1.7} L${x + s * .34},${y - s * 1.12} L${x + s * .15},${y - s * .95} L${x - s * .15},${y - s * .95} Z`, fill: "#fff" }, g);
  } else if (type === "foret" ) {
    el("line", { x1: x, y1: y, x2: x, y2: y - s * .55, stroke: "#4d3a22", "stroke-width": 1.8 }, g);
    el("circle", { cx: x, cy: y - s * .85, r: s * .55, fill: "#5f7d49", stroke: "#33431f", "stroke-width": 1.4 }, g);
    el("circle", { cx: x - s * .3, cy: y - s * .62, r: s * .34, fill: "#6c8a54", stroke: "none" }, g);
  } else if (type === "foret-neige") {
    el("line", { x1: x, y1: y, x2: x, y2: y - s * .5, stroke: "#4d3a22", "stroke-width": 1.6 }, g);
    el("path", { d: `M${x - s * .5},${y - s * .4} L${x},${y - s * 1.6} L${x + s * .5},${y - s * .4} Z`, fill: "#41603c", stroke: "#27391f", "stroke-width": 1.2 }, g);
    el("path", { d: `M${x - s * .26},${y - s * 1.0} L${x},${y - s * 1.6} L${x + s * .26},${y - s * 1.0} Z`, fill: "#eef2ec" }, g);
  } else if (type === "prairie") {
    el("path", { d: `M${x},${y} q-2,-6 -4,-7 M${x},${y} q1,-6 4,-7`, fill: "none", stroke: "#5c7340", "stroke-width": 1.4, "stroke-linecap": "round" }, g);
  } else if (type === "marais") {
    el("path", { d: `M${x - 6},${y} h12 M${x - 3},${y + 4} h9`, stroke: "#54614a", "stroke-width": 1.4, opacity: .8 }, g);
    el("path", { d: `M${x},${y} v-7 M${x - 3},${y} v-5 M${x + 3},${y} v-5`, stroke: "#4a5a3c", "stroke-width": 1.5, "stroke-linecap": "round" }, g);
  } else if (type === "colline") {
    el("path", { d: `M${x - s},${y} q${s},-${s * 1.1} ${s * 2},0`, fill: "none", stroke: "#6d5c39", "stroke-width": 1.7 }, g);
  } else if (type === "ville") {
    const w = 5 + R() * 4;
    el("rect", { x: x - w / 2, y: y - w, width: w, height: w, fill: "#b39b6d", stroke: "#40331e", "stroke-width": 1 }, g);
    el("path", { d: `M${x - w / 2 - 1},${y - w} L${x},${y - w * 1.7} L${x + w / 2 + 1},${y - w} Z`, fill: "#7e4c33", stroke: "#40331e", "stroke-width": 1 }, g);
  }
}

function dessinerMarqueur(g, l) {
  const [x, y] = l.pos, t = l.type;
  el("ellipse", { cx: x, cy: y + 9, rx: 15, ry: 5, fill: "rgba(40,28,10,.3)" }, g);
  el("circle", { cx: x, cy: y, r: t === "capitale" ? 17 : 14, class: "socle", fill: "#f0e6c6", stroke: "#3f331f", "stroke-width": 2 }, g);
  const enc = "#3f331f", or = "#b8892c";
  if (t === "capitale") {
    el("path", { d: `M${x - 9},${y + 8} v-9 h3 v3 h3 v-3 h2 v-9 l2,-5 l2,5 v9 h2 v3 h3 v-3 h3 v9 Z`, fill: or, stroke: enc, "stroke-width": 1.4, "stroke-linejoin": "round" }, g);
  } else if (t === "ville") {
    el("path", { d: `M${x - 8},${y + 8} v-10 h2 v-3 h3 v3 h2 v-4 h2 v4 h2 v-3 h3 v3 h2 v10 Z`, fill: "#d8c48f", stroke: enc, "stroke-width": 1.4, "stroke-linejoin": "round" }, g);
    el("rect", { x: x - 1.6, y: y + 2, width: 3.2, height: 6, fill: enc }, g);
  } else if (t === "ville-detruite") {
    el("path", { d: `M${x - 8},${y + 8} v-9 h3 v-3 h3 l2,4 l3,-6 l2,3 v11 Z`, fill: "#c9b183", stroke: enc, "stroke-width": 1.4, "stroke-linejoin": "round" }, g);
    el("path", { d: `M${x + 1},${y - 8} l6,-4 M${x + 4},${y - 3} l6,-3`, stroke: "#7e5b3a", "stroke-width": 1.3 }, g);
  } else if (t === "academie") {
    el("path", { d: `M${x - 4},${y + 8} v-14 l4,-4 l4,4 v14 Z`, fill: "#d8c48f", stroke: enc, "stroke-width": 1.4, "stroke-linejoin": "round" }, g);
    el("path", { d: `M${x},${y - 10} v-6 l7,2 l-7,3`, fill: or, stroke: enc, "stroke-width": 1.1 }, g);
  } else if (t === "village" || t === "lieu-dit") {
    el("path", { d: `M${x - 6},${y + 7} v-7 l6,-6 l6,6 v7 Z`, fill: "#d8c48f", stroke: enc, "stroke-width": 1.4, "stroke-linejoin": "round" }, g);
    el("rect", { x: x - 1.5, y: y + 2, width: 3, height: 5, fill: enc }, g);
  } else if (t === "danger") {
    el("circle", { cx: x, cy: y - 2, r: 6.5, fill: "#efe9dc", stroke: enc, "stroke-width": 1.5 }, g);
    el("circle", { cx: x - 2.4, cy: y - 3, r: 1.5, fill: enc }, g);
    el("circle", { cx: x + 2.4, cy: y - 3, r: 1.5, fill: enc }, g);
    el("path", { d: `M${x - 3},${y + 5} h6 M${x - 2},${y + 7.5} h4`, stroke: enc, "stroke-width": 1.5, "stroke-linecap": "round" }, g);
  }
}

function dessinerRose(g, x, y, r) {
  const gr = el("g", { opacity: .8 }, g);
  el("circle", { cx: x, cy: y, r: r * .62, fill: "none", stroke: "#e8dcb8", "stroke-width": 1.6 }, gr);
  el("circle", { cx: x, cy: y, r: r * .3, fill: "none", stroke: "#e8dcb8", "stroke-width": 1 }, gr);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, L = i % 2 ? r * .45 : r;
    const px = x + Math.sin(a) * L, py = y - Math.cos(a) * L;
    const s = i % 2 ? r * .09 : r * .16;
    const bx1 = x + Math.sin(a + Math.PI / 2) * s, by1 = y - Math.cos(a + Math.PI / 2) * s;
    const bx2 = x + Math.sin(a - Math.PI / 2) * s, by2 = y - Math.cos(a - Math.PI / 2) * s;
    el("path", { d: `M${bx1},${by1} L${px},${py} L${bx2},${by2} Z`, fill: i === 0 ? "#d9b45c" : "#e8dcb8", stroke: "#2c545e", "stroke-width": 1 }, gr);
    el("path", { d: `M${bx1},${by1} L${px},${py} L${x},${y} Z`, fill: "#2c545e", opacity: .35 }, gr);
  }
  el("text", { x, y: y - r - 10, "text-anchor": "middle", "font-size": 20, class: "label-ile", fill: "#e8dcb8" }, gr).textContent = "N";
}
function dessinerEchelle(g, x, y) {
  const u = 100 / S.kmParUnite; // 100 km en unités carte
  const gr = el("g", { opacity: .9 }, g);
  el("rect", { x, y, width: u, height: 8, fill: "#e8dcb8", stroke: "#2c545e", "stroke-width": 1.4 }, gr);
  el("rect", { x: x + u / 2, y, width: u / 2, height: 8, fill: "#2c545e" }, gr);
  const t = el("text", { x: x + u / 2, y: y - 8, "text-anchor": "middle", "font-size": 15, class: "label-ile", fill: "#e8dcb8" }, gr);
  t.textContent = "≈ 100 km";
}

function renderLegende() {
  $("#legende").innerHTML = `
    <b>LÉGENDE</b>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#5a4326" stroke-width="3" stroke-dasharray="9 5"/></svg> Route</div>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#6b5638" stroke-width="2.4" stroke-dasharray="2.5 6"/></svg> Piste · col de montagne</div>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#7fa7ad" stroke-width="2" stroke-dasharray="2 7"/></svg> Voie côtière</div>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#8fb5ba" stroke-width="2.2" stroke-dasharray="8 9"/></svg> Voie maritime</div>`;
}

/* ─────────────── Vue / pan / zoom ─────────────── */
function appliquerVB() { $("#carte").setAttribute("viewBox", `${S.vb.x} ${S.vb.y} ${S.vb.w} ${S.vb.h}`); }
function zoomer(f, cx, cy) {
  const v = S.vb;
  const nw = Math.min(2600, Math.max(130, v.w * f));
  const k = nw / v.w;
  const px = cx == null ? v.x + v.w / 2 : cx, py = cy == null ? v.y + v.h / 2 : cy;
  v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k;
  v.w = nw; v.h = v.h * k;
  appliquerVB();
}
function zoomVers(pos, largeur = 520) {
  const cible = { w: largeur, h: largeur * S.vb0.h / S.vb0.w };
  cible.x = pos[0] - cible.w / 2; cible.y = pos[1] - cible.h / 2;
  animerVB(cible);
}
function animerVB(cible) {
  const dep = { ...S.vb }, t0 = performance.now(), D = 550;
  function pas(t) {
    const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
    for (const a of ["x", "y", "w", "h"]) S.vb[a] = dep[a] + (cible[a] - dep[a]) * e;
    appliquerVB();
    if (k < 1) requestAnimationFrame(pas);
  }
  requestAnimationFrame(pas);
}
function coordsSouris(e) {
  const svg = $("#carte"), r = svg.getBoundingClientRect();
  return [S.vb.x + (e.clientX - r.left) / r.width * S.vb.w, S.vb.y + (e.clientY - r.top) / r.height * S.vb.h];
}

/* ─────────────── Graphe & voyage ─────────────── */
function construireGraphe(routes) {
  const g = {};
  const ajoute = (de, a, r, pts) => { (g[de] = g[de] || []).push({ vers: a, km: r.km, type: r.type, terrain: r.terrain, danger: r.danger, points: pts }); };
  for (const r of routes) {
    ajoute(r.de, r.a, r, r.points);
    ajoute(r.a, r.de, r, [...r.points].reverse());
  }
  return g;
}
function penalite(transportId, edge) {
  if (edge.type === "montagne") { if (transportId === "pied") return .7; if (transportId === "cheval") return .6; }
  if (edge.terrain === "difficile") { if (transportId === "pied") return .7; if (transportId === "cheval") return .7; }
  return 1;
}
function vitesseGlobale(t, modifs, defsModifs) {
  let m = 1;
  for (const id of modifs) {
    const d = defsModifs.find(x => x.id === id);
    if (d && !d.bloqueMer) m += d.effet;
  }
  return Math.max(4, t.kmJour * m);
}
function dijkstra(graphe, de, a, transport, opts) {
  const { modifs = new Set(), defsModifs = [] } = opts || {};
  const tempete = modifs.has("tempete");
  const dist = { [de]: 0 }, prev = {}, prevEdge = {}, faits = new Set();
  const base = vitesseGlobale(transport, modifs, defsModifs);
  while (true) {
    let u = null, best = Infinity;
    for (const k in dist) if (!faits.has(k) && dist[k] < best) { best = dist[k]; u = k; }
    if (u == null) break;
    if (u === a) break;
    faits.add(u);
    for (const e of (graphe[u] || [])) {
      if (!transport.autorise.includes(e.type)) continue;
      if (tempete && (e.type === "maritime" || e.type === "cotier") && transport.id !== "vol") continue;
      const t = e.km / (base * penalite(transport.id, e));
      const nd = dist[u] + t;
      if (nd < (dist[e.vers] ?? Infinity)) { dist[e.vers] = nd; prev[e.vers] = u; prevEdge[e.vers] = e; }
    }
  }
  if (!(a in dist)) return null;
  const noeuds = [a], edges = [];
  let cur = a;
  while (cur !== de) { edges.unshift(prevEdge[cur]); cur = prev[cur]; noeuds.unshift(cur); }
  const km = edges.reduce((s, e) => s + e.km, 0);
  return { jours: dist[a], km, noeuds, edges };
}
function raisonImpossible(transport, de, a, modifs, defsModifs) {
  const tous = { id: "x", kmJour: 100, autorise: ["route", "piste", "montagne", "cotier", "maritime"] };
  const libre = dijkstra(S.graphe, de, a, tous, { modifs: new Set(), defsModifs });
  if (!libre) return "Aucun itinéraire connu.";
  if (modifs.has("tempete") && (transport.id === "navire" || transport.id === "cotier"))
    return "Tempête — navigation impossible.";
  if (["pied", "cheval", "caleche"].includes(transport.id) &&
      libre.edges.some(e => e.type === "maritime" || e.type === "cotier") &&
      !dijkstra(S.graphe, de, a, { ...transport, autorise: ["route", "piste", "montagne"] }, { modifs, defsModifs }))
    { if (transport.id !== "caleche" || !dijkstra(S.graphe, de, a, { id:"cheval", kmJour:50, autorise:["route","piste","montagne"] }, { modifs, defsModifs })) return "Impossible — la mer vous barre la route."; }
  if (transport.id === "caleche") return "Routes uniquement — impossible en montagne ou sur piste.";
  if (transport.id === "cotier") return "Ce trajet exige une traversée hauturière — prenez un navire.";
  return "Impossible avec ce moyen de transport.";
}
/* Arrondi « du voyageur » — calibré sur les tables de la fiche du Royaume :
   à pied on compte en journées pleines ; le cheval exige un repos par 3 jours
   et arrondit à la journée en montagne ; mer et calèche à la demi-journée ;
   le vol au quart de journée. */
function arrondiVoyageur(t, r) {
  const mont = r.edges.some(e => e.type === "montagne");
  let j = r.jours;
  if (t.id === "cheval" && j >= 3) j += Math.floor(j / 3);
  if (t.id === "pied" || (t.id === "cheval" && mont)) return Math.max(1, Math.ceil(j));
  if (t.id === "vol") return Math.max(.25, Math.ceil(j * 4) / 4);
  return Math.max(.5, Math.ceil(j * 2) / 2);
}
function fmtJours(j) {
  const q = Math.max(.25, Math.round(j * 4) / 4);
  const ent = Math.floor(q), frac = q - ent;
  const F = { 0: "", .25: "¼", .5: "½", .75: "¾" }[frac];
  if (ent === 0) return F + " j";
  return F ? `${ent} ${F} j`.replace(" ¼", "¼").replace(" ½", "½").replace(" ¾", "¾") : `${ent} j`;
}

/* ── Interface voyage ── */
function toggleVoyage(on) {
  S.voyage.actif = on == null ? !S.voyage.actif : on;
  $("#btn-voyage").classList.toggle("actif", S.voyage.actif);
  $("#carte").classList.toggle("voyage", S.voyage.actif);
  $("#voyage-box").classList.toggle("ouvert", S.voyage.actif);
  if (S.voyage.actif) { fermerPanneau(); majVoyage(); }
  else viderTrajet();
}
function clicLieu(id) {
  if (S.voyage.actif) {
    const et = S.voyage.etapes;
    if (et[et.length - 1] === id) return toast("Ce lieu est déjà la dernière étape.");
    et.push(id); S.voyage.choix = {};
    majVoyage();
  } else {
    ouvrirLieu(id);
    zoomVers(S.lieux[id].pos, 620);
  }
}
function retirerEtape(i) { S.voyage.etapes.splice(i, 1); S.voyage.choix = {}; majVoyage(); }
function majVoyage() {
  const box = $("#voyage-box"), et = S.voyage.etapes, defs = S.pays.modificateurs;
  let html = `<h3>🧭 Calcul de voyage</h3>`;
  if (et.length === 0) html += `<p class="consigne">Cliquez sur votre point de <b style="color:var(--vert)">départ</b>.</p>`;
  else if (et.length === 1) html += `<p class="consigne">Cliquez sur votre <b style="color:var(--sang)">arrivée</b> — puis, si vous voulez, d'autres étapes.</p>`;
  else html += `<p class="consigne">Cliquez sur la carte pour ajouter des étapes, ou lisez les résultats.</p>`;

  if (et.length) {
    html += `<ul class="etapes-liste">` + et.map((id, i) => {
      const cl = i === 0 ? "d" : (i === et.length - 1 ? "a" : "i");
      const role = i === 0 ? "Départ" : (i === et.length - 1 ? "Arrivée" : "Étape");
      return `<li><span class="pt ${cl}"></span> <span><b>${esc(S.lieux[id].nom)}</b> <small style="color:var(--encre-3)">— ${role}</small></span>
        <button class="sup" data-i="${i}" title="Retirer" aria-label="Retirer ${esc(S.lieux[id].nom)}">✕</button></li>`;
    }).join("") + `</ul>`;
  }

  if (et.length >= 2) html += htmlResultats();

  html += `<details id="modifs" ${S.voyage.modifs.size ? "open" : ""}><summary>⚙ Modificateurs (MJ) ${S.voyage.modifs.size ? "· " + S.voyage.modifs.size + " actif(s)" : ""}</summary>` +
    defs.map(m => `<label><input type="checkbox" data-m="${m.id}" ${S.voyage.modifs.has(m.id) ? "checked" : ""}> ${esc(m.nom)}
      <span class="pct">${m.bloqueMer ? "mer ✕" : (m.effet > 0 ? "+" : "") + Math.round(m.effet * 100) + " %"}</span></label>`).join("") + `</details>`;

  html += `<div class="mini-btns">
    <button class="btn" id="v-recommencer">Recommencer</button>
    <button class="btn" id="v-fermer">Fermer</button></div>`;

  box.innerHTML = html;
  box.querySelectorAll(".sup").forEach(b => b.addEventListener("click", () => retirerEtape(+b.dataset.i)));
  box.querySelectorAll("#modifs input").forEach(c => c.addEventListener("change", () => {
    c.checked ? S.voyage.modifs.add(c.dataset.m) : S.voyage.modifs.delete(c.dataset.m);
    majVoyage();
  }));
  box.querySelectorAll(".segment select").forEach(sel => sel.addEventListener("change", () => {
    S.voyage.choix[sel.dataset.seg] = sel.value; majVoyage();
  }));
  const rec = box.querySelector("#v-recommencer");
  if (rec) rec.addEventListener("click", () => { S.voyage.etapes = []; S.voyage.choix = {}; majVoyage(); });
  const fer = box.querySelector("#v-fermer");
  if (fer) fer.addEventListener("click", () => toggleVoyage(false));
  marquerEtapes(); dessinerTrajet();
}
function htmlResultats() {
  const et = S.voyage.etapes, defs = S.pays.modificateurs, opts = { modifs: S.voyage.modifs, defsModifs: defs };
  let html = `<h3 style="margin-top:14px">Durée totale par moyen</h3><table class="resultats"><tr><th></th><th>Moyen</th><th>Dist.</th><th>Durée</th></tr>`;
  const totaux = {};
  for (const t of S.pays.transports) {
    let km = 0, jours = 0, ok = true, raison = "";
    for (let i = 0; i < et.length - 1; i++) {
      const r = dijkstra(S.graphe, et[i], et[i + 1], t, opts);
      if (!r) { ok = false; raison = raisonImpossible(t, et[i], et[i + 1], S.voyage.modifs, defs); break; }
      km += r.km; jours += arrondiVoyageur(t, r);
    }
    totaux[t.id] = ok ? { km, jours } : null;
    html += ok
      ? `<tr><td>${t.icone}</td><td>${esc(t.nom)}</td><td>${km} km</td><td class="duree">${fmtJours(jours)}</td></tr>`
      : `<tr class="impossible"><td>${t.icone}</td><td>${esc(t.nom)}</td><td colspan="2">❌ ${esc(raison)}</td></tr>`;
  }
  html += `</table>`;

  // itinéraire suggéré (moyen réalisable le plus rapide)
  const rapide = S.pays.transports.filter(t => totaux[t.id]).sort((a, b) => totaux[a.id].jours - totaux[b.id].jours)[0];
  if (rapide) {
    const noms = [];
    for (let i = 0; i < et.length - 1; i++) {
      const r = dijkstra(S.graphe, et[i], et[i + 1], rapide, { modifs: S.voyage.modifs, defsModifs: defs });
      r.noeuds.forEach((n, j) => { if (!(i > 0 && j === 0)) noms.push(S.lieux[n].nom); });
    }
    html += `<p style="font-size:14.5px"><b class="cinzel" style="font-size:12px">ITINÉRAIRE SUGGÉRÉ (${rapide.icone})</b><br>${noms.map(esc).join(" → ")}</p>`;
  }

  // trajets mixtes : un moyen par segment
  html += `<h3>Trajet mixte — choisir par segment</h3>`;
  let totalMixte = 0, mixteOK = true;
  for (let i = 0; i < et.length - 1; i++) {
    const faisables = S.pays.transports
      .map(t => ({ t, r: dijkstra(S.graphe, et[i], et[i + 1], t, { modifs: S.voyage.modifs, defsModifs: defs }) }))
      .filter(x => x.r);
    if (!faisables.length) { html += `<div class="segment"><span class="titre-seg">${esc(S.lieux[et[i]].nom)} → ${esc(S.lieux[et[i + 1]].nom)}</span><br>❌ Aucun moyen possible.</div>`; mixteOK = false; continue; }
    faisables.forEach(x => { x.jA = arrondiVoyageur(x.t, x.r); });
    faisables.sort((a, b) => a.jA - b.jA);
    const choisi = S.voyage.choix[i] && faisables.find(x => x.t.id === S.voyage.choix[i]) ? S.voyage.choix[i] : faisables[0].t.id;
    S.voyage.choix[i] = choisi;
    const xChoisi = faisables.find(x => x.t.id === choisi);
    totalMixte += xChoisi.jA;
    html += `<div class="segment"><span class="titre-seg">${esc(S.lieux[et[i]].nom)} → ${esc(S.lieux[et[i + 1]].nom)} · ${xChoisi.r.km} km</span>
      <select data-seg="${i}" aria-label="Moyen de transport du segment ${i + 1}">` +
      faisables.map(x => `<option value="${x.t.id}" ${x.t.id === choisi ? "selected" : ""}>${x.t.icone} ${esc(x.t.nom)} — ${fmtJours(x.jA)}</option>`).join("") +
      `</select></div>`;
  }
  if (mixteOK && et.length >= 2) html += `<div class="total-voyage">Total du trajet mixte : ${fmtJours(totalMixte)}</div>`;

  html += htmlAvertissements();
  return html;
}
function htmlAvertissements() {
  const et = S.voyage.etapes, defs = S.pays.modificateurs;
  let out = "";
  if (S.voyage.modifs.has("tempete")) out += `<div class="avert">⛈ Tempête active : toute navigation est impossible.</div>`;
  if (et.includes("iles-glace-lieu")) out += `<div class="avert mortel">☠️ Les Îles de Glace sont mortelles — même pour des mages très puissants. Aucun voyage n'y est recommandé.</div>`;
  const edges = edgesDuTrajet();
  if (edges.some(e => e.type === "montagne")) out += `<div class="avert">⛰ Passage en montagne : calèche impossible, cheval ralenti (−40 %).</div>`;
  if (edges.some(e => e.terrain === "difficile")) out += `<div class="avert">🥾 Terrain difficile sur une partie du trajet (−30 % à pied).</div>`;
  if (edges.some(e => e.type === "maritime" || e.type === "cotier")) out += `<div class="avert" style="border-color:var(--mer)">⚓ Ce trajet comporte une traversée : une embarcation est nécessaire sur ces segments.</div>`;
  return out;
}
function edgesDuTrajet() {
  const et = S.voyage.etapes, defs = S.pays.modificateurs, out = [];
  for (let i = 0; i < et.length - 1; i++) {
    const tid = S.voyage.choix[i];
    const t = S.pays.transports.find(x => x.id === tid) || S.pays.transports.find(x => x.id === "vol");
    const r = dijkstra(S.graphe, et[i], et[i + 1], t, { modifs: S.voyage.modifs, defsModifs: defs });
    if (r) out.push(...r.edges);
  }
  return out;
}
function marquerEtapes() {
  document.querySelectorAll(".marqueur").forEach(m => m.classList.remove("depart", "arrivee", "etape-i"));
  const et = S.voyage.etapes;
  et.forEach((id, i) => {
    const m = document.querySelector(`.marqueur[data-id="${id}"]`);
    if (m) m.classList.add(i === 0 ? "depart" : (i === et.length - 1 ? "arrivee" : "etape-i"));
  });
}
function viderTrajet() { $("#g-trajet").innerHTML = ""; document.querySelectorAll(".marqueur").forEach(m => m.classList.remove("depart", "arrivee", "etape-i")); }
function dessinerTrajet() {
  const g = $("#g-trajet"); g.innerHTML = "";
  const edges = edgesDuTrajet();
  if (!edges.length) return;
  for (const e of edges) {
    const d = catmullPath(e.points, false);
    el("path", { d, class: "trace-voyage halo" }, g);
    el("path", { d, class: "trace-voyage" }, g);
  }
}

/* ─────────────── Fiches de lieux (panneau) ─────────────── */
function imgHTML(src, label) {
  return `<div class="cadre-img"><img src="${esc(src)}" alt="${esc(label)}" loading="lazy"
    onerror="this.parentNode.innerHTML='<div class=&quot;vide&quot;>Illustration à venir<code>${esc(src)}</code></div>'"></div>`;
}
function secretsHTML(liste) {
  if (!liste || !liste.length) return "";
  const visibles = liste.filter(s => s.revele || estRevele(s.id) || S.mj);
  if (!visibles.length) return "";
  return `<h3>Secrets</h3>` + visibles.map(s => {
    const ouvert = s.revele || estRevele(s.id);
    const coche = S.mj && !s.revele ? `<label class="coche-mj"><input type="checkbox" data-rev="${esc(s.id)}" ${ouvert ? "checked" : ""}> Visible pour les joueurs <small>(cet appareil — publiez via le bouton 🔓)</small></label>` : "";
    return `
    <div class="secret ${ouvert ? "revele" : ""}">
      <span class="sceau-secret">${ouvert ? "🔓 Révélé" : "🔒 Secret MJ"}</span>
      <b class="t">${esc(s.titre)}</b><p>${esc(s.texte)}</p>${coche}
    </div>`;
  }).join("");
}
function detailsHTML(liste, prefix) {
  if (!liste || !liste.length) return "";
  const items = [];
  liste.forEach((d, i) => {
    const obj = typeof d === "string" ? { texte: d } : d;
    const id = `${prefix}-${i}`;
    const defVisible = !obj.mj;
    const visible = S.masques.has(id) ? false : (S.reveals.has(id) ? true : defVisible);
    if (!visible && !S.mj) return;
    const coche = S.mj ? ` <label class="coche-mj coche-inline"><input type="checkbox" data-vis="${id}" data-def="${defVisible ? 1 : 0}" ${visible ? "checked" : ""}> joueurs</label>` : "";
    items.push(`<li class="${visible ? "" : "pt-cache"}">${esc(obj.texte)}${coche}</li>`);
  });
  if (!items.length) return "";
  return `<ul class="tensions">${items.join("")}</ul>`;
}
const NOMS_TYPES = { capitale: "Capitale", ville: "Ville", "ville-detruite": "Ville détruite", village: "Village", academie: "Académie", "lieu-dit": "Lieu-dit", danger: "Zone mortelle", "lieu-saint": "Lieu saint", prison: "Prison", palais: "Palais", port: "Port", caserne: "Caserne", auberge: "Auberge", taverne: "Taverne", commerce: "Commerce", illegal: "Activité illégale", mystere: "Mystère" };

function ouvrirLieu(id) {
  const l = S.lieux[id]; if (!l) return;
  const p = $("#panneau");
  let html = `<button class="fermer" aria-label="Fermer">✕</button>
    <span class="badge-type ${l.type === "danger" ? "danger" : ""}">${NOMS_TYPES[l.type] || l.type}</span>
    <h2>${esc(l.nom)}</h2>
    <div class="accroche">${esc(l.accroche)}</div>
    ${imgHTML((l.images || [])[0] || `images/lieux/${l.id}/principale.jpg`, l.nom)}
    <table class="meta">
      <tr><td>Population</td><td>${esc(l.population)}</td></tr>
      <tr><td>Climat</td><td>${esc(l.climat)}</td></tr>
      <tr><td>Dirigeant</td><td>${esc(l.dirigeant)}</td></tr>
    </table>
    <p>${esc(l.description)}</p>`;
  if (l.histoire) html += `<h3>Histoire</h3><p>${esc(l.histoire)}</p>`;
  if (l.lieuxNotables && l.lieuxNotables.length) {
    html += `<h3>Lieux notables</h3><ul class="liste-lieux">` +
      l.lieuxNotables.map(sl => `<li data-sl="${sl.id}"><b>${esc(sl.nom)}</b><small>${esc(NOMS_TYPES[sl.type] || "")}${sl.utilite ? " · " + esc(sl.utilite) : ""}</small></li>`).join("") + `</ul>`;
  }
  if (l.familles && l.familles.length) {
    html += `<h3>Familles présentes</h3><div class="chips">` +
      l.familles.map(f => { const fam = famille(f); return fam ? `<span class="chip" data-fam="${f}">🛡 ${esc(fam.nom)}</span>` : ""; }).join("") + `</div>`;
  }
  if (l.personnages && l.personnages.length) {
    html += `<h3>Personnages liés</h3><div class="chips">` +
      l.personnages.map(id2 => { const pn = pnj(id2); return pn ? `<span class="chip" data-pnj="${id2}">${esc(pn.nom)}</span>` : ""; }).join("") + `</div>`;
  }
  if (l.tensions && l.tensions.length) { const th = detailsHTML(l.tensions, "ten-" + l.id); if (th) html += `<h3>⚡ En jeu</h3>` + th; }
  html += secretsHTML(l.secrets);
  p.innerHTML = html; p.classList.add("ouvert"); p.scrollTop = 0;
  p.querySelector(".fermer").addEventListener("click", fermerPanneau);
  p.querySelectorAll("[data-sl]").forEach(li => li.addEventListener("click", () => ouvrirSousLieu(li.dataset.sl)));
  brancherChips(p, id);
}
function ouvrirSousLieu(sid) {
  const sl = S.sousLieux[sid]; if (!sl) return;
  const parent = S.lieux[sl.parent], p = $("#panneau");
  let html = `<button class="fermer" aria-label="Fermer">✕</button>
    <button class="retour" aria-label="Retour à ${esc(parent.nom)}">←</button>
    <span class="badge-type">${NOMS_TYPES[sl.type] || sl.type}</span>
    <h2>${esc(sl.nom)}</h2>
    <div class="accroche">${esc(parent.nom)}</div>
    ${imgHTML(`images/lieux/${parent.id}/${sl.id}.jpg`, sl.nom)}`;
  if (sl.description) html += `<p>${esc(sl.description)}</p>`;
  if (sl.utilite) html += `<h3>Que peut-on y faire ?</h3><p>${esc(sl.utilite)}</p>`;
  if (sl.pnj && sl.pnj.length) html += `<h3>PNJ présents</h3><div class="chips">` +
    sl.pnj.map(id2 => { const pn = pnj(id2); return pn ? `<span class="chip" data-pnj="${id2}">${esc(pn.nom)}</span>` : ""; }).join("") + `</div>`;
  html += secretsHTML(sl.secrets);
  p.innerHTML = html; p.scrollTop = 0;
  p.querySelector(".fermer").addEventListener("click", fermerPanneau);
  p.querySelector(".retour").addEventListener("click", () => ouvrirLieu(parent.id));
  brancherChips(p, parent.id);
}
function ouvrirPnj(id, retourVers) {
  const pn = pnj(id); if (!pn) return;
  const cache = pn.mjOnly && !(estRevele("pnj-" + pn.id));
  if (cache && !S.mj) return;
  const p = $("#panneau");
  let html = `<button class="fermer" aria-label="Fermer">✕</button>` +
    (retourVers ? `<button class="retour" aria-label="Retour">←</button>` : "") +
    `<span class="badge-type ${pn.mjOnly ? "danger" : ""}">${pn.mjOnly ? "Personnage · fiche MJ" : "Personnage"}</span>
    <h2>${esc(pn.nom)}</h2>
    <div class="accroche">${esc(pn.titre || "")}</div>
    ${imgHTML(pn.portrait || `images/pnj/${pn.id}.jpg`, pn.nom)}`;
  const meta = [["Origine", pn.origine], ["Race", pn.race], ["Statut", pn.statut], ["Naissance", pn.naissance], ["Religion", pn.religion]]
    .filter(x => x[1]);
  if (meta.length) html += `<table class="meta">` + meta.map(m => `<tr><td>${m[0]}</td><td>${esc(m[1])}</td></tr>`).join("") + `</table>`;
  if (S.mj && pn.mjOnly) html += `<div class="secret"><span class="sceau-secret">🔒 Fiche cachée aux joueurs</span>
    <label class="coche-mj"><input type="checkbox" data-rev="pnj-${esc(pn.id)}" ${estRevele("pnj-" + pn.id) ? "checked" : ""}> Fiche visible pour les joueurs <small>(cet appareil — publiez via 🔓)</small></label></div>`;
  html += `<p>${esc(pn.description)}</p>`;
  if (pn.details && pn.details.length) { html += `<h3>À savoir</h3>` + detailsHTML(pn.details, "det-" + pn.id); }
  if (pn.galerie && pn.galerie.length) {
    html += `<h3>Galerie</h3>` + pn.galerie.map(src => imgHTML(src, pn.nom)).join("");
  }
  html += secretsHTML(pn.secrets);
  if (pn.lieux && pn.lieux.length) html += `<h3>Lié aux lieux</h3><div class="chips">` +
    pn.lieux.map(lid => S.lieux[lid] ? `<span class="chip" data-lieu="${lid}">📍 ${esc(S.lieux[lid].nom)}</span>` : "").join("") + `</div>`;
  p.innerHTML = html; p.classList.add("ouvert"); p.scrollTop = 0;
  p.querySelector(".fermer").addEventListener("click", fermerPanneau);
  if (retourVers) p.querySelector(".retour").addEventListener("click", () => ouvrirLieu(retourVers));
  p.querySelectorAll("[data-lieu]").forEach(c => c.addEventListener("click", () => {
    montrerVue("carte"); ouvrirLieu(c.dataset.lieu); zoomVers(S.lieux[c.dataset.lieu].pos, 620);
  }));
}
function ouvrirFamille(fid, retourVers) {
  const f = famille(fid); if (!f) return;
  const p = $("#panneau");
  let html = `<button class="fermer" aria-label="Fermer">✕</button>` +
    (retourVers ? `<button class="retour" aria-label="Retour">←</button>` : "") +
    `<span class="badge-type">Famille fondatrice</span>
    <h2>${esc(f.nom)}</h2>
    <div class="accroche">« ${esc(f.devise)} » — ${esc(f.pilier)}</div>
    ${imgHTML(f.blason, "Blason " + f.nom)}
    <table class="meta">
      <tr><td>Couleurs</td><td>${esc(f.couleurs)}</td></tr>
      <tr><td>Symbole</td><td>${esc(f.symbole)}</td></tr>
      <tr><td>Demeure</td><td>${esc(f.demeure)}</td></tr>
    </table>
    <p>${esc(f.description)}</p>` +
    (f.membres ? `<h3>Membres notables</h3><p>${esc(f.membres)}</p>` : "");
  p.innerHTML = html; p.classList.add("ouvert"); p.scrollTop = 0;
  p.querySelector(".fermer").addEventListener("click", fermerPanneau);
  if (retourVers) p.querySelector(".retour").addEventListener("click", () => ouvrirLieu(retourVers));
}
function brancherChips(p, retourVers) {
  p.querySelectorAll("[data-pnj]").forEach(c => c.addEventListener("click", () => ouvrirPnj(c.dataset.pnj, retourVers)));
  p.querySelectorAll("[data-fam]").forEach(c => c.addEventListener("click", () => ouvrirFamille(c.dataset.fam, retourVers)));
}
function fermerPanneau() { $("#panneau").classList.remove("ouvert"); }
function pnj(id) { return S.pays.codex.personnages.find(p => p.id === id); }
function famille(id) { return S.pays.familles.find(f => f.id === id); }

/* ─────────────── Codex ─────────────── */
const CHAPITRES = [
  ["lois", "📜 Lois & Interdits"], ["religions", "⛪ Religions"], ["familles", "🛡 Familles & Blasons"],
  ["economie", "💰 Économie"], ["politique", "👑 Politique"], ["armees", "⚔ Armées"],
  ["chronologie", "📅 Chronologie"], ["personnages", "👤 Personnages"]
];
function construireCodex() {
  const nav = $("#codex-nav");
  nav.innerHTML = CHAPITRES.map(([id, nom], i) => `<a data-ch="${id}" class="${i === 0 ? "actif" : ""}" tabindex="0">${nom}</a>`).join("");
  nav.querySelectorAll("a").forEach(a => {
    const go = () => { nav.querySelectorAll("a").forEach(x => x.classList.remove("actif")); a.classList.add("actif"); renderChapitre(a.dataset.ch); };
    a.addEventListener("click", go);
    a.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
  renderChapitre("lois");
}
function articleHTML(sec) {
  return `<div class="article"><h4>${esc(sec.titre)}</h4><p>${esc(sec.contenu)}</p>${secretsHTML(sec.secrets)}</div>`;
}
function renderChapitre(ch) {
  const c = $("#codex-contenu"), cx = S.pays.codex;
  let html = "";
  if (["lois", "religions", "politique", "economie", "armees"].includes(ch)) {
    const bloc = cx[ch];
    html = `<h2>${esc(bloc.titre)}</h2><div class="filet"></div>` + bloc.sections.map(articleHTML).join("");
  } else if (ch === "familles") {
    html = `<h2>Familles & Blasons</h2><div class="filet"></div>
      <p class="fell" style="max-width:720px;margin-bottom:18px">Dix blasons. Un royaume, une Église, huit lignées. Les sept familles fondatrices furent choisies par Valène pour superviser les piliers de la société.</p>
      <div class="grille-familles">` +
      S.pays.blasonsInstitutions.map(b => carteBlason(b, true)).join("") +
      S.pays.familles.map(f => carteBlason(f, false)).join("") + `</div>`;
  } else if (ch === "chronologie") {
    const lieuxCites = [...new Set(cx.chronologie.flatMap(e => e.lieux))].filter(id => S.lieux[id]);
    const filtre = S._filtreChrono || "";
    html = `<h2>Chronologie du Royaume</h2><div class="filet"></div>
      <select class="filtre" id="filtre-chrono" aria-label="Filtrer par lieu"><option value="">Tous les lieux</option>` +
      lieuxCites.map(id => `<option value="${id}" ${filtre === id ? "selected" : ""}>${esc(S.lieux[id].nom)}</option>`).join("") + `</select>
      <ul class="chrono">` +
      cx.chronologie.filter(e => !filtre || e.lieux.includes(filtre)).map(e => `
        <li><span class="date">${esc(e.date)}</span><br>${esc(e.evenement)}
        ${e.lieux.length ? `<div class="liens-lieux">📍 ${e.lieux.filter(id => S.lieux[id]).map(id => esc(S.lieux[id].nom)).join(" · ")}</div>` : ""}</li>`).join("") + `</ul>`;
  } else if (ch === "personnages") {
    const visiblesPnj = cx.personnages.filter(p => !p.mjOnly || S.mj || estRevele("pnj-" + p.id));
    const ordre = ["Îles Saintes", "Drémora", "Babel", "Désert Magistral", "Eden"];
    const groupes = {};
    for (const p of visiblesPnj) (groupes[p.origine || "Origine inconnue"] = groupes[p.origine || "Origine inconnue"] || []).push(p);
    const regions = Object.keys(groupes).sort((a, b) => {
      const ia = ordre.indexOf(a), ib = ordre.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "fr");
    });
    html = `<h2>Personnages</h2><div class="filet"></div>` + regions.map(r => `
      <h3 class="titre-region">${esc(r)} <small>· ${groupes[r].length}</small></h3>
      <div class="grille-pnj">` +
      groupes[r].map(p => `
        <div class="carte-pnj ${p.mjOnly ? "mj-only" : ""}" data-pnj="${p.id}" tabindex="0" role="button" aria-label="${esc(p.nom)}">
          <div class="portrait"><img src="${esc(p.portrait)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Portrait à venir'}))"></div>
          <div class="infos"><b>${p.mjOnly ? "🔒 " : ""}${esc(p.nom)}</b><small>${esc(p.titre || "")}</small></div>
        </div>`).join("") + `</div>`).join("");
  }
  c.innerHTML = html; c.scrollTop = 0;
  const f = c.querySelector("#filtre-chrono");
  if (f) f.addEventListener("change", () => { S._filtreChrono = f.value; renderChapitre("chronologie"); });
  c.querySelectorAll("[data-pnj]").forEach(k => {
    const go = () => ouvrirPnj(k.dataset.pnj);
    k.addEventListener("click", go);
    k.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
}
function carteBlason(f, institution) {
  return `<div class="carte-famille">
    <div class="blason"><img src="${esc(f.blason)}" alt="Blason ${esc(f.nom)}"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Blason à déposer : ${esc(f.blason)}'}))"></div>
    <div><h4>${esc(f.nom)}${f.pilier ? ` <small style="font-weight:400;font-size:12px;color:var(--encre-2)">· ${esc(f.pilier)}</small>` : ""}</h4>
    <div class="devise">« ${esc(f.devise)} »</div>
    <small><b>${esc(f.couleurs)}</b> — ${esc(f.symbole)}${f.demeure ? `<br>Demeure : ${esc(f.demeure)}` : ""}</small>
    ${f.description ? `<p>${esc(f.description)}</p>` : ""}
    ${f.membres ? `<small><b>Membres :</b> ${esc(f.membres)}</small>` : ""}</div></div>`;
}

/* ─────────────── UI générale ─────────────── */
function montrerVue(v) {
  S.vue = v;
  $("#codex").classList.toggle("ouvert", v === "codex");
  $("#ong-carte").classList.toggle("actif", v === "carte");
  $("#ong-codex").classList.toggle("actif", v === "codex");
  if (v === "codex") { fermerPanneau(); toggleVoyage(false); }
}
function majBoutonMJ() {
  $("#btn-mj").classList.toggle("actif", S.mj);
  $("#btn-mj").title = S.mj ? "Mode MJ actif — cliquer pour quitter" : "Mode Maître du Jeu";
  let b = $("#btn-reveals");
  if (S.mj) {
    if (!b) {
      b = document.createElement("button");
      b.id = "btn-reveals"; b.className = "btn";
      b.title = "Copier la liste des révélations pour publication";
      $("#btn-mj").before(b);
      b.addEventListener("click", copierReveals);
    }
    b.textContent = `🔓 ${S.reveals.size + S.masques.size}`;
  } else if (b) b.remove();
}
function copierReveals() {
  const rev = [...S.reveals], mas = [...S.masques];
  const texte = (rev.length || mas.length)
    ? `Modifications Asterre à publier :\nÀ RENDRE VISIBLES :\n${rev.join("\n") || "(aucun)"}\nÀ MASQUER :\n${mas.join("\n") || "(aucun)"}`
    : "Aucune modification cochée sur cet appareil.";
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject()).then(
    () => toast((rev.length || mas.length) ? "Liste copiée — collez-la à Claude pour publier aux joueurs." : "Aucune modification cochée."),
    () => { prompt("Copiez cette liste :", texte); }
  );
}
document.addEventListener("change", e => {
  const t = e.target;
  if (t && t.dataset && t.dataset.rev) {
    t.checked ? S.reveals.add(t.dataset.rev) : S.reveals.delete(t.dataset.rev);
    sauveReveals(); majBoutonMJ();
    toast(t.checked ? "🔓 Visible sur cet appareil — pensez à publier (bouton 🔓)." : "🔒 De nouveau caché sur cet appareil.");
    return;
  }
  if (t && t.dataset && t.dataset.vis) {
    const id = t.dataset.vis, defVisible = t.dataset.def === "1";
    if (t.checked) { S.masques.delete(id); if (!defVisible) S.reveals.add(id); else S.reveals.delete(id); }
    else { S.reveals.delete(id); if (defVisible) S.masques.add(id); else S.masques.delete(id); }
    const li = t.closest("li"); if (li) li.classList.toggle("pt-cache", !t.checked);
    sauveReveals(); majBoutonMJ();
    toast(t.checked ? "👁 Point visible (cet appareil) — publiez via 🔓." : "🙈 Point masqué (cet appareil) — publiez via 🔓.");
  }
});
function toggleMJ() {
  if (S.mj) { S.mj = false; sessionStorage.removeItem("asterre-mj"); toast("Mode MJ désactivé."); }
  else {
    const rep = prompt("Phrase de passe du Maître du Jeu :");
    if (rep == null) return;
    if (rep.trim() === S.monde.mj.phrase) { S.mj = true; sessionStorage.setItem("asterre-mj", "1"); toast("✠ Mode MJ actif — les secrets vous sont ouverts."); }
    else return toast("La Lumière ne vous reconnaît pas.");
  }
  majBoutonMJ();
  if ($("#panneau").classList.contains("ouvert")) fermerPanneau();
  if (S.vue === "codex") renderChapitre(document.querySelector("#codex-nav a.actif").dataset.ch);
}
function remplirRecherche() {
  $("#lieux-datalist").innerHTML = S.pays.lieux.map(l => `<option value="${esc(l.nom)}">`).join("");
  $("#recherche").addEventListener("change", () => {
    const v = $("#recherche").value.trim().toLowerCase();
    const l = S.pays.lieux.find(x => x.nom.toLowerCase() === v) || S.pays.lieux.find(x => x.nom.toLowerCase().includes(v));
    if (!l) return toast("Aucun lieu de ce nom sur la carte.");
    montrerVue("carte"); clicLieu(l.id); $("#recherche").value = "";
  });
}
function brancherUI() {
  $("#ong-carte").addEventListener("click", () => montrerVue("carte"));
  $("#ong-codex").addEventListener("click", () => montrerVue("codex"));
  $("#btn-voyage").addEventListener("click", () => { montrerVue("carte"); toggleVoyage(); });
  $("#btn-mj").addEventListener("click", toggleMJ);
  $("#z-plus").addEventListener("click", () => zoomer(.72));
  $("#z-moins").addEventListener("click", () => zoomer(1.38));
  $("#z-reset").addEventListener("click", () => animerVB({ ...S.vb0 }));

  const svg = $("#carte");
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    drag = { x: e.clientX, y: e.clientY, vb: { ...S.vb }, bouge: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / r.width * S.vb.w, dy = (e.clientY - drag.y) / r.height * S.vb.h;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { drag.bouge = true; svg.classList.add("drag"); }
    S.vb.x = drag.vb.x - dx; S.vb.y = drag.vb.y - dy;
    appliquerVB();
  });
  svg.addEventListener("pointerup", () => { drag = null; svg.classList.remove("drag"); });
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const [cx, cy] = coordsSouris(e);
    zoomer(e.deltaY > 0 ? 1.16 : .86, cx, cy);
  }, { passive: false });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { fermerPanneau(); } });
}

/* ─────────────── Lancement ─────────────── */
if (IS_BROWSER) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
if (typeof module !== "undefined") module.exports = { construireGraphe, dijkstra, fmtJours, arrondiVoyageur, penalite, S };
