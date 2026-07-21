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
  seance: { pnj: [], lieu: null },
  des: { historique: [] }, musiques: [], pisteActive: null,
  joueur: { perso: null, sousOnglet: "fiche" }, fichesJoueur: {},
  meca: { fiche: "alchimie", tab: "bases", sel: {} }, mecaData: {},
  vb: { x: 0, y: 0, w: 2000, h: 1500 }, vb0: null,
  kmParUnite: 0.22
};
const STATS_DEF = [
  { id: "vitalite", nom: "Vitalité", max: 100, color: "#7e2a2a" },
  { id: "mana", nom: "Mana", max: 100, color: "#396a75" },
  { id: "combat", nom: "Combat", max: 100, color: "#b8892c" },
  { id: "defense", nom: "Défense", max: 100, color: "#5f7d49" },
  { id: "agilite", nom: "Agilité", max: 100, color: "#58929c" },
  { id: "esprit", nom: "Esprit", max: 100, color: "#8a5aa0" }
];
function ficheJ(pid) {
  if (!S.fichesJoueur[pid]) {
    S.fichesJoueur[pid] = { stats: {}, ame: null, bourse: { or: 0, argent: 0, bronze: 0 },
      inventaire: [], quetes: [], competences: [], etats: [], journal: [], niveau: 1, xp: 0 };
  }
  return S.fichesJoueur[pid];
}
function chargeFiches() { try { S.fichesJoueur = JSON.parse(localStorage.getItem("asterre-fiches") || "{}"); } catch (e) { S.fichesJoueur = {}; } }
function sauveFiches() { try { localStorage.setItem("asterre-fiches", JSON.stringify(S.fichesJoueur)); } catch (e) {} }
function estRevele(id) { return S.reveals.has(id); }
function visib(id, def) { if (S.masques.has(id)) return false; if (S.reveals.has(id)) return true; return def; }
function cocheMJ(id, def, label) {
  if (!S.mj) return "";
  const v = visib(id, def);
  return `<label class="coche-mj"><input type="checkbox" data-vis="${esc(id)}" data-def="${def ? 1 : 0}" ${v ? "checked" : ""}> ${label || "Visible pour les joueurs"} <small>(cet appareil — publiez via 🔓)</small></label>`;
}
function blocMJ(id, def, contenu, label) {
  const v = visib(id, def);
  if (!v && !S.mj) return "";
  return `<div class="bloc-mj ${v ? "" : "pt-cache"}" data-bloc="${esc(id)}">${contenu}${cocheMJ(id, def, label)}</div>`;
}
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
  chargeFiches();
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
  try { S.mecaData.alchimie = await (await fetch("data/alchimie.json")).json(); } catch (e) { S.mecaData.alchimie = null; }
  try { S.musiques = (await (await fetch("data/musiques.json")).json()).pistes || []; } catch (e) { S.musiques = []; }
  initMusique();
  chargerSeanceHash();
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
    if (!S.mj && !visib("lieu-" + l.id, true)) continue;
    const g = el("g", { class: "marqueur", "data-id": l.id, tabindex: 0, role: "button", "aria-label": l.nom }, gMarqueurs);
    dessinerMarqueur(g, l);
    const ty = l.pos[1] + (l.type === "capitale" ? 40 : 32);
    el("text", { x: l.pos[0], y: ty, "text-anchor": "middle", "font-size": tailleLabel(l.type), class: "label-lieu" }, g).textContent = l.nom;
    g.addEventListener("click", ev => { ev.stopPropagation(); clicLieu(l.id); });
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

/* ── Voyage libre : géométrie ── */
function eucKm(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) * S.kmParUnite; }
function posEtape(et) { return et.type === "lieu" ? S.lieux[et.id].pos : et.pos; }
function nomEtape(et, i) { return et.type === "lieu" ? S.lieux[et.id].nom : `Point libre ${et.no || i + 1}`; }
function surIle(p) { for (const ile of S.pays.iles) { if (pointInPoly(p, ile.forme)) return ile.id; } return null; }
function analyseLigne(a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(3, Math.ceil(L / 10));
  const pasKm = (L / n) * S.kmParUnite;
  let eau = 0, eauMax = 0, eauCour = 0, mont = 0, marais = 0;
  const iles = new Set();
  for (let i = 0; i <= n; i++) {
    const p = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n];
    const ile = surIle(p);
    if (ile) { iles.add(ile); if (eauCour > eauMax) eauMax = eauCour; eauCour = 0; }
    else { eau++; eauCour += pasKm; }
    if (ile) {
      const io = S.pays.iles.find(x => x.id === ile);
      for (const z of (io.zones || [])) {
        if (pointInPoly(p, z.poly)) { if (z.type.indexOf("montagne") === 0) mont++; if (z.type === "marais") marais++; break; }
      }
    }
  }
  if (eauCour > eauMax) eauMax = eauCour;
  return { kmTotal: L * S.kmParUnite, traverseMer: eau > 0, eauMaxKm: eauMax,
           fracMont: mont / (n + 1), fracMarais: marais / (n + 1) };
}
function capVol() { return (S.pays.reglages && S.pays.reglages.volMaxTraiteKm) || 300; }
/* Calcule le meilleur trajet A→B pour un transport : par les routes (si deux lieux)
   et/ou en ligne directe (pied, cheval, vol). Renvoie null si impossible. */
function calcSegment(A, B, t, opts) {
  let meilleur = null;
  if (A.type === "lieu" && B.type === "lieu") {
    const r = dijkstra(S.graphe, A.id, B.id, t, opts);
    if (r) meilleur = { ...r, mode: "routes" };
  }
  if (["pied", "cheval", "vol"].includes(t.id)) {
    const a = posEtape(A), b = posEtape(B), an = analyseLigne(a, b);
    let ok = true;
    if (t.id !== "vol" && an.traverseMer) ok = false;
    if (t.id === "vol" && an.eauMaxKm > capVol()) ok = false;
    if (ok && an.kmTotal > 0.5) {
      const base = vitesseGlobale(t, opts.modifs, opts.defsModifs);
      let pen = 1, type = "direct", terrain;
      if (t.id !== "vol" && an.fracMont > 0.25) { pen = t.id === "pied" ? .7 : .6; type = "montagne"; }
      else if (t.id !== "vol" && an.fracMarais > 0.2) { pen = .7; type = "piste"; terrain = "difficile"; }
      const jours = an.kmTotal / (base * pen);
      const direct = { jours, km: Math.round(an.kmTotal), noeuds: [], mode: "direct",
        edges: [{ type, terrain, km: Math.round(an.kmTotal), points: [a, b], direct: true }] };
      if (!meilleur || direct.jours < meilleur.jours) meilleur = direct;
    }
  }
  return meilleur;
}
function raisonSegment(t, A, B, modifs, defs) {
  if (A.type === "lieu" && B.type === "lieu") {
    const opts = { modifs, defsModifs: defs };
    if (["pied", "cheval", "vol"].includes(t.id)) {
      const an = analyseLigne(posEtape(A), posEtape(B));
      if (t.id === "vol" && an.eauMaxKm > capVol())
        return `Trop loin pour voler d'une traite au-dessus de la mer (max ${capVol()} km) — prévoyez une halte.`;
    }
    return raisonImpossible(t, A.id, B.id, modifs, defs);
  }
  const an = analyseLigne(posEtape(A), posEtape(B));
  if (modifs.has("tempete") && (t.id === "navire" || t.id === "cotier")) return "Tempête — navigation impossible.";
  if (t.id === "vol" && an.eauMaxKm > capVol())
    return `Trop loin pour voler d'une traite au-dessus de la mer (max ${capVol()} km) — prévoyez une halte.`;
  if ((t.id === "pied" || t.id === "cheval") && an.traverseMer) return "Impossible — la mer vous barre la route.";
  if (t.id === "caleche") return "Routes uniquement — la calèche ne quitte pas les routes tracées.";
  if (t.id === "cotier" || t.id === "navire") return "Les embarcations suivent les lignes portuaires — choisissez deux lieux reliés par la mer.";
  return "Impossible avec ce moyen de transport.";
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
  if (S.voyage.actif) ajouterEtape({ type: "lieu", id });
  else { ouvrirLieu(id); zoomVers(S.lieux[id].pos, 620); }
}
function clicLibre(pos) {
  if (!S.voyage.actif) return;
  S._noLibre = (S._noLibre || 0) + 1;
  ajouterEtape({ type: "libre", pos: [Math.round(pos[0]), Math.round(pos[1])], no: S._noLibre });
}
function ajouterEtape(et) {
  const list = S.voyage.etapes, dern = list[list.length - 1];
  if (dern && dern.type === "lieu" && et.type === "lieu" && dern.id === et.id)
    return toast("Ce lieu est déjà la dernière étape.");
  list.push(et); S.voyage.choix = {};
  majVoyage();
}
function retirerEtape(i) { S.voyage.etapes.splice(i, 1); S.voyage.choix = {}; majVoyage(); }
function majVoyage() {
  const box = $("#voyage-box"), et = S.voyage.etapes, defs = S.pays.modificateurs;
  let html = `<h3>🧭 Calcul de voyage</h3>`;
  if (et.length === 0) html += `<p class="consigne">Cliquez votre <b style="color:var(--vert)">départ</b> — un lieu, ou n'importe quel point de la carte.</p>`;
  else if (et.length === 1) html += `<p class="consigne">Cliquez votre <b style="color:var(--sang)">arrivée</b> — lieu ou point libre — puis d'autres étapes si besoin.</p>`;
  else html += `<p class="consigne">Cliquez la carte pour ajouter des étapes (lieux ou points libres), ou lisez les résultats.</p>`;

  if (et.length) {
    html += `<ul class="etapes-liste">` + et.map((e, i) => {
      const cl = i === 0 ? "d" : (i === et.length - 1 ? "a" : "i");
      const role = i === 0 ? "Départ" : (i === et.length - 1 ? "Arrivée" : "Étape");
      return `<li><span class="pt ${cl}"></span> <span><b>${esc(nomEtape(e, i))}</b> <small style="color:var(--encre-3)">— ${role}${e.type === "libre" ? " · 📍" : ""}</small></span>
        <button class="sup" data-i="${i}" title="Retirer" aria-label="Retirer">✕</button></li>`;
    }).join("") + `</ul>`;
  }

  if (et.length >= 2) html += htmlResultats();

  html += `<details id="modifs" ${S.voyage.modifs.size ? "open" : ""}><summary>⚙ Modificateurs (MJ) ${S.voyage.modifs.size ? "· " + S.voyage.modifs.size + " actif(s)" : ""}</summary>` +
    defs.map(m => `<label><input type="checkbox" data-m="${m.id}" ${S.voyage.modifs.has(m.id) ? "checked" : ""}> ${esc(m.nom)}
      <span class="pct">${m.bloqueMer ? "mer ✕" : (m.effet > 0 ? "+" : "") + Math.round(m.effet * 100) + " %"}</span></label>`).join("") +
    `<label style="margin-top:6px"><span>🦅 Vol max d'une traite (mer)</span><span class="pct">${capVol()} km</span></label></details>`;

  html += `<div class="mini-btns">
    <button class="btn" id="v-recommencer">Recommencer</button>
    <button class="btn" id="v-fermer">Fermer</button></div>`;

  box.innerHTML = html;
  box.querySelectorAll(".sup").forEach(b => b.addEventListener("click", () => retirerEtape(+b.dataset.i)));
  box.querySelectorAll("#modifs input").forEach(c => c.addEventListener("change", () => {
    c.checked ? S.voyage.modifs.add(c.dataset.m) : S.voyage.modifs.delete(c.dataset.m);
    S.voyage.choix = {}; majVoyage();
  }));
  box.querySelectorAll(".segment select").forEach(sel => sel.addEventListener("change", () => {
    S.voyage.choix[sel.dataset.seg] = sel.value; majVoyage();
  }));
  const rec = box.querySelector("#v-recommencer");
  if (rec) rec.addEventListener("click", () => { S.voyage.etapes = []; S.voyage.choix = {}; S._noLibre = 0; majVoyage(); });
  const fer = box.querySelector("#v-fermer");
  if (fer) fer.addEventListener("click", () => toggleVoyage(false));
  marquerEtapes(); dessinerTrajet();
}
function htmlResultats() {
  const et = S.voyage.etapes, defs = S.pays.modificateurs, opts = { modifs: S.voyage.modifs, defsModifs: defs };
  let html = `<h3 style="margin-top:14px">Durée totale par moyen</h3><table class="resultats"><tr><th></th><th>Moyen</th><th>Dist.</th><th>Durée</th></tr>`;
  const totaux = {};
  for (const t of S.pays.transports) {
    let km = 0, jours = 0, ok = true, raison = "", direct = false;
    for (let i = 0; i < et.length - 1; i++) {
      const r = calcSegment(et[i], et[i + 1], t, opts);
      if (!r) { ok = false; raison = raisonSegment(t, et[i], et[i + 1], S.voyage.modifs, defs); break; }
      km += r.km; jours += arrondiVoyageur(t, r); if (r.mode === "direct") direct = true;
    }
    totaux[t.id] = ok ? { km, jours } : null;
    html += ok
      ? `<tr><td>${t.icone}</td><td>${esc(t.nom)}${direct ? " <small title=\"comprend un tronçon en ligne directe\">➤</small>" : ""}</td><td>${km} km</td><td class="duree">${fmtJours(jours)}</td></tr>`
      : `<tr class="impossible"><td>${t.icone}</td><td>${esc(t.nom)}</td><td colspan="2">❌ ${esc(raison)}</td></tr>`;
  }
  html += `</table>`;

  const rapide = S.pays.transports.filter(t => totaux[t.id]).sort((a, b) => totaux[a.id].jours - totaux[b.id].jours)[0];
  if (rapide) {
    const noms = [];
    for (let i = 0; i < et.length - 1; i++) {
      const r = calcSegment(et[i], et[i + 1], rapide, opts);
      if (r.mode === "routes") r.noeuds.forEach((n, j) => { if (!(i > 0 && j === 0)) noms.push(S.lieux[n].nom); });
      else { if (i === 0) noms.push(nomEtape(et[i], i)); noms.push("➤ " + nomEtape(et[i + 1], i + 1)); }
    }
    html += `<p style="font-size:14.5px"><b class="cinzel" style="font-size:12px">ITINÉRAIRE SUGGÉRÉ (${rapide.icone})</b><br>${noms.map(esc).join(" → ").replace(/→ ➤/g, "➤")}</p>`;
  }

  html += `<h3>Trajet mixte — choisir par segment</h3>`;
  let totalMixte = 0, mixteOK = true;
  for (let i = 0; i < et.length - 1; i++) {
    const faisables = S.pays.transports
      .map(t => ({ t, r: calcSegment(et[i], et[i + 1], t, opts) }))
      .filter(x => x.r);
    const titre = `${esc(nomEtape(et[i], i))} → ${esc(nomEtape(et[i + 1], i + 1))}`;
    if (!faisables.length) { html += `<div class="segment"><span class="titre-seg">${titre}</span><br>❌ Aucun moyen possible.</div>`; mixteOK = false; continue; }
    faisables.forEach(x => { x.jA = arrondiVoyageur(x.t, x.r); });
    faisables.sort((a, b) => a.jA - b.jA);
    const choisi = S.voyage.choix[i] && faisables.find(x => x.t.id === S.voyage.choix[i]) ? S.voyage.choix[i] : faisables[0].t.id;
    S.voyage.choix[i] = choisi;
    const xC = faisables.find(x => x.t.id === choisi);
    totalMixte += xC.jA;
    html += `<div class="segment"><span class="titre-seg">${titre} · ${xC.r.km} km${xC.r.mode === "direct" ? " ➤" : ""}</span>
      <select data-seg="${i}" aria-label="Moyen du segment ${i + 1}">` +
      faisables.map(x => `<option value="${x.t.id}" ${x.t.id === choisi ? "selected" : ""}>${x.t.icone} ${esc(x.t.nom)} — ${fmtJours(x.jA)}${x.r.mode === "direct" ? " ➤" : ""}</option>`).join("") +
      `</select></div>`;
  }
  if (mixteOK && et.length >= 2) html += `<div class="total-voyage">Total du trajet mixte : ${fmtJours(totalMixte)}</div>`;

  html += htmlAvertissements();
  return html;
}
function htmlAvertissements() {
  const et = S.voyage.etapes;
  let out = "";
  if (S.voyage.modifs.has("tempete")) out += `<div class="avert">⛈ Tempête active : toute navigation est impossible.</div>`;
  if (et.some(e => e.type === "lieu" && e.id === "iles-glace-lieu")) out += `<div class="avert mortel">☠️ Les Îles de Glace sont mortelles — même pour des mages très puissants. Aucun voyage n'y est recommandé.</div>`;
  const edges = edgesDuTrajet();
  if (edges.some(e => e.type === "montagne")) out += `<div class="avert">⛰ Passage en montagne : calèche impossible, progression ralentie.</div>`;
  if (edges.some(e => e.terrain === "difficile")) out += `<div class="avert">🥾 Terrain difficile sur une partie du trajet (−30 % à pied).</div>`;
  if (edges.some(e => e.type === "maritime" || e.type === "cotier")) out += `<div class="avert" style="border-color:var(--mer)">⚓ Ce trajet comporte une traversée : une embarcation est nécessaire sur ces segments.</div>`;
  if (edges.some(e => e.direct)) out += `<div class="avert" style="border-color:var(--or)">➤ Tronçon hors des routes : progression à travers la campagne, en ligne directe.</div>`;
  return out;
}
function edgesDuTrajet() {
  const et = S.voyage.etapes, defs = S.pays.modificateurs, out = [];
  const opts = { modifs: S.voyage.modifs, defsModifs: defs };
  for (let i = 0; i < et.length - 1; i++) {
    const tid = S.voyage.choix[i];
    const t = S.pays.transports.find(x => x.id === tid) || S.pays.transports.find(x => x.id === "vol");
    const r = calcSegment(et[i], et[i + 1], t, opts);
    if (r) out.push(...r.edges);
  }
  return out;
}
function marquerEtapes() {
  document.querySelectorAll(".marqueur").forEach(m => m.classList.remove("depart", "arrivee", "etape-i"));
  const et = S.voyage.etapes;
  et.forEach((e, i) => {
    if (e.type !== "lieu") return;
    const m = document.querySelector(`.marqueur[data-id="${e.id}"]`);
    if (m) m.classList.add(i === 0 ? "depart" : (i === et.length - 1 ? "arrivee" : "etape-i"));
  });
}
function viderTrajet() { $("#g-trajet").innerHTML = ""; document.querySelectorAll(".marqueur").forEach(m => m.classList.remove("depart", "arrivee", "etape-i")); }
function dessinerTrajet() {
  const g = $("#g-trajet"); g.innerHTML = "";
  const edges = edgesDuTrajet();
  for (const e of edges) {
    const d = e.direct
      ? `M${e.points[0][0]},${e.points[0][1]} L${e.points[1][0]},${e.points[1][1]}`
      : catmullPath(e.points, false);
    el("path", { d, class: "trace-voyage halo" }, g);
    el("path", { d, class: "trace-voyage" }, g);
  }
  // épingles des points libres
  const et = S.voyage.etapes;
  et.forEach((e, i) => {
    if (e.type !== "libre") return;
    const cl = i === 0 ? "var(--vert)" : (i === et.length - 1 ? "var(--sang)" : "var(--mer-claire)");
    el("circle", { cx: e.pos[0], cy: e.pos[1], r: 8, fill: cl, stroke: "#2e2314", "stroke-width": 2 }, g);
    el("circle", { cx: e.pos[0], cy: e.pos[1], r: 2.6, fill: "#f3e9ce" }, g);
  });
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
    </table>`;
  if (S.mj) html += `<div class="secret ${visib("lieu-" + l.id, true) ? "revele" : ""}"><span class="sceau-secret">${visib("lieu-" + l.id, true) ? "👁 Lieu visible des joueurs" : "🔒 Lieu caché aux joueurs"}</span>
    ${cocheMJ("lieu-" + l.id, true, "Lieu visible sur la carte des joueurs")}</div>`;
  html += blocMJ("desc-lieu-" + l.id, true, `<p>${esc(l.description)}</p>`, "Description visible");
  if (l.histoire) html += blocMJ("hist-lieu-" + l.id, true, `<h3>Histoire</h3><p>${esc(l.histoire)}</p>`, "Histoire visible");
  if (l.lieuxNotables && l.lieuxNotables.length) {
    const lis = l.lieuxNotables.filter(sl => S.mj || visib("sl-" + sl.id, true))
      .map(sl => `<li data-sl="${sl.id}" class="${visib("sl-" + sl.id, true) ? "" : "pt-cache"}"><b>${visib("sl-" + sl.id, true) ? "" : "🔒 "}${esc(sl.nom)}</b><small>${esc(NOMS_TYPES[sl.type] || "")}${sl.utilite ? " · " + esc(sl.utilite) : ""}</small></li>`).join("");
    if (lis) html += `<h3>Lieux notables</h3><ul class="liste-lieux">${lis}</ul>`;
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
  if (!S.mj && !visib("sl-" + sid, true)) return;
  const parent = S.lieux[sl.parent], p = $("#panneau");
  let html = `<button class="fermer" aria-label="Fermer">✕</button>
    <button class="retour" aria-label="Retour à ${esc(parent.nom)}">←</button>
    <span class="badge-type">${NOMS_TYPES[sl.type] || sl.type}</span>
    <h2>${esc(sl.nom)}</h2>
    <div class="accroche">${esc(parent.nom)}</div>
    ${imgHTML(`images/lieux/${parent.id}/${sl.id}.jpg`, sl.nom)}`;
  if (S.mj) html += `<div class="secret ${visib("sl-" + sid, true) ? "revele" : ""}"><span class="sceau-secret">${visib("sl-" + sid, true) ? "👁 Visible des joueurs" : "🔒 Caché aux joueurs"}</span>
    ${cocheMJ("sl-" + sid, true, "Lieu notable visible pour les joueurs")}</div>`;
  if (sl.description) html += blocMJ("desc-sl-" + sid, true, `<p>${esc(sl.description)}</p>`, "Description visible");
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
  const ficheVisible = visib("pnj-" + pn.id, !pn.mjOnly);
  if (!ficheVisible && !S.mj) return;
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
  if (S.mj) html += `<div class="secret ${ficheVisible ? "revele" : ""}"><span class="sceau-secret">${ficheVisible ? "👁 Fiche visible des joueurs" : "🔒 Fiche cachée aux joueurs"}</span>
    ${cocheMJ("pnj-" + pn.id, !pn.mjOnly, "Fiche visible pour les joueurs")}</div>`;
  html += blocMJ("desc-pnj-" + pn.id, true, `<p>${esc(pn.description)}</p>`, "Description visible");
  if (pn.details && pn.details.length) { html += `<h3>À savoir</h3>` + detailsHTML(pn.details, "det-" + pn.id); }
  if (pn.galerie && pn.galerie.length) {
    html += blocMJ("gal-pnj-" + pn.id, true, `<h3>Galerie</h3>` + pn.galerie.map(src => imgHTML(src, pn.nom)).join(""), "Galerie visible");
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

/* ═══════════════ MÉCANIQUES ═══════════════ */
const CAT_SIGIL = { Cosmique: "#7d5fbf", "Élément": "#d9601f", "État": "#3f7bbf", "Matériau": "#806040", Race: "#3f9d5f" };
function getJet(A, niveauNom, nbSigils) {
  const row = A.jetTable[niveauNom]; if (!row) return null;
  if (nbSigils <= 0) return row[0];
  if (nbSigils > 6) { const base = row[5]; if (base === null) return null; return Math.max(5, base - (nbSigils - 6) * 10); }
  return row[nbSigils - 1];
}
function renderMeca() {
  const c = $("#meca-contenu"), fiches = [["alchimie", "⚗️ Alchimie"]];
  let html = `<div class="meca-choix">` + fiches.map(([id, l]) =>
    `<button class="meca-fiche ${S.meca.fiche === id ? "actif" : ""}" data-fiche="${id}">${l}</button>`).join("") +
    `<span class="fell" style="font-size:12.5px;margin-left:8px">D'autres fiches (Herboristerie, Magie du Sang…) s'ajouteront ici.</span></div>`;
  html += `<div id="meca-corps"></div>`;
  c.innerHTML = html;
  c.querySelectorAll("[data-fiche]").forEach(b => b.addEventListener("click", () => { S.meca.fiche = b.dataset.fiche; S.meca.tab = "bases"; renderMeca(); }));
  if (S.meca.fiche === "alchimie") renderAlchimie();
}
function renderAlchimie() {
  const A = S.mecaData.alchimie, corps = $("#meca-corps");
  if (!A) { corps.innerHTML = "<p class='fell'>Données d'alchimie indisponibles.</p>"; return; }
  const tabs = [["bases", "Bases"], ["sigils", "Sigils"], ["rites", "Rites"], ["simulateur", "Simulateur"], ["modifs", "Modificateurs"]];
  const s = S.meca.sel;
  s.niveau = s.niveau || "Adepte III"; s.carbs = s.carbs || []; s.sigils = s.sigils || [];
  s.sacrifice = s.sacrifice || "none"; s.filtre = s.filtre || "Tous";
  let html = `
    <div class="alch-tete">
      <div class="alch-eyebrow">✦ Codex d'Asterre · Systèmes ✦</div>
      <div class="alch-titre"><span style="font-size:34px">⚗️</span>
        <div><h2 style="margin:0;border:none;text-transform:none">Alchimie</h2>
        <div class="fell" style="letter-spacing:.1em">L'Art des Sigils · Rites & Transmutation</div></div></div>
      <p class="alch-cite">« L'Alchimie est distincte de la magie élémentaire. Paradoxalement, les mages ont plus de mal à la pratiquer — leur mana interfère avec l'équilibre du cercle. »</p>
      <div class="alch-stats">
        <div><b>${A.sigils.length}</b><small>Sigils connus</small></div>
        <div><b>3</b><small>Carburants</small></div>
        <div><b>${A.rites.filter(r => !r.mj || S.mj).length}</b><small>Rites connus</small></div>
      </div>
    </div>
    <nav class="alch-nav">${tabs.map(([id, l]) => `<button class="alch-tab ${S.meca.tab === id ? "actif" : ""}" data-tab="${id}">${l}</button>`).join("")}</nav>
    <div class="alch-corps">${contenuAlch(A, S.meca.tab, s)}</div>`;
  corps.innerHTML = html;
  brancherAlch(A, s);
}
function contenuAlch(A, tab, s) {
  if (tab === "bases") {
    const piliers = [
      ["🔣", "Sigils", "Symboles tracés dans le cercle. Leur combinaison définit l'effet. Plus il y en a, plus c'est complexe."],
      ["🔥", "Carburant", "Mercure · Soufre · Sang. Chaque carburant amplifie différemment — avec ses propres risques et lois."],
      ["⚖️", "Équilibre Élémentaire", "Les 4 éléments doivent être parfaitement équilibrés aux 4 coins du cercle. Si déséquilibre → EXPLOSION."]];
    return `<h4 class="alch-h">Les 3 Piliers du Rite</h4>` +
      piliers.map(p => `<div class="alch-pilier"><span>${p[0]}</span><div><b>${p[1]}</b><p>${esc(p[2])}</p></div></div>`).join("") +
      `<h4 class="alch-h">Les 3 Carburants</h4>` +
      A.carburants.map(carb => `<div class="alch-carb" style="border-left-color:${carb.color}">
        <div class="alch-carb-t"><span>${carb.icon} <b style="color:${carb.color}">${carb.nom}</b></span>
          <span style="color:${carb.modificateur >= 0 ? "#5f7d49" : "#a52a2a"}">${carb.modificateur >= 0 ? "+" : ""}${carb.modificateur}</span></div>
        <p>${esc(carb.description)}</p><p class="fell">${esc(carb.sujetion)}</p>
        ${carb.interdit ? `<div class="alch-interdit">🚫 ${esc(carb.interdit)}</div>` : ""}
        ${carb.niveaux ? `<div class="alch-sang">${carb.niveaux.map(n => `<div><span style="color:${n.color}">${n.icon} ${esc(n.label)}</span><span style="color:${n.mod >= 0 ? "#5f7d49" : "#a52a2a"}">${n.mod >= 0 ? "+" : ""}${n.mod}</span></div>`).join("")}</div>` : ""}
      </div>`).join("") +
      `<div class="alch-warn"><b>⚠ PROTECTION DU RITUALISTE</b><p>Le ritualiste se place au centre du cercle — zone de protection si maîtrisé. Un ritualiste inexpérimenté dans un rite raté ne survivra pas.</p></div>`;
  }
  if (tab === "sigils") {
    const cats = ["Tous", ...Array.from(new Set(A.sigils.map(x => x.cat)))];
    const list = s.filtre === "Tous" ? A.sigils : A.sigils.filter(x => x.cat === s.filtre);
    return `<h4 class="alch-h">${A.sigils.length} Sigils Documentés</h4>
      <div class="alch-filtres">${cats.map(cat => `<button class="alch-fil ${s.filtre === cat ? "actif" : ""}" data-fil="${esc(cat)}" style="${s.filtre === cat ? `border-color:${CAT_SIGIL[cat] || "#7d5fbf"};color:${CAT_SIGIL[cat] || "#7d5fbf"}` : ""}">${esc(cat)}</button>`).join("")}</div>
      <div class="alch-grille">${list.map(x => { const col = CAT_SIGIL[x.cat] || "#7d5fbf"; return `<div class="alch-sigil" style="border-left-color:${col}">
        <div><span>${x.icon}</span> <b style="color:${col}">${esc(x.nom)}</b></div><small>${esc(x.cat)}</small><p>${esc(x.desc)}</p></div>`; }).join("")}</div>
      <p class="alch-note">Tout concept, race ou matériau peut devenir un Sigil. Ces ${A.sigils.length} sont les premiers documentés.</p>`;
  }
  if (tab === "rites") {
    const rites = A.rites.filter(r => !r.mj || S.mj);
    return `<h4 class="alch-h">Rites Connus</h4>
      <p class="alch-note">Ces rites sont documentés dans le Codex. Leur réplication nécessite de trouver les formules exactes.</p>` +
      rites.map(r => `<div class="alch-rite ${r.mj ? "rite-mj" : ""}" style="border-left-color:${r.color}">
        <div class="alch-rite-t"><span>${r.icon} <b style="color:${r.color}">${r.mj ? "🔒 " : ""}${esc(r.nom)}</b></span>
          <span class="fell" style="text-align:right">${esc(r.niveau)}<br><span style="color:#a52a2a">${esc(r.carburant)}</span></span></div>
        <div class="alch-rite-sigils">${r.sigils.map(sg => { const f = A.sigils.find(y => y.nom === sg); const col = f ? CAT_SIGIL[f.cat] : "#7d5fbf"; return `<span style="color:${col};border-color:${col}">${f ? f.icon : ""} ${esc(sg)}</span>`; }).join("")}</div>
        <div class="alch-ingr">${r.ingredients.map(i => `<div>· ${esc(i)}</div>`).join("")}</div>
        <p>${esc(r.description)}</p><p style="color:${r.color};font-style:italic">Effet : ${esc(r.effet)}</p></div>`).join("");
  }
  if (tab === "simulateur") {
    const niv = A.niveaux.find(n => n.nom === s.niveau) || A.niveaux[3];
    let res = "";
    if (s.resultat) {
      const R = s.resultat;
      res = R.impossible
        ? `<div class="alch-res"><div class="alch-res-h">Résultat</div><div style="text-align:center;color:#c0392b;padding:14px">❌ Rite impossible à ce niveau avec ${R.nb} Sigils</div></div>`
        : `<div class="alch-res"><div class="alch-res-h">Résultat</div>
           <div class="alch-res-cases"><div class="alch-case grand"><b>${R.jet}</b><small>JET À FAIRE</small></div>
             <div class="alch-case"><b>${R.nb}</b><small>SIGILS</small></div>
             ${R.carbMultiMalus < 0 ? `<div class="alch-case malus"><b>${R.carbMultiMalus}</b><small>MULTI-CARB</small></div>` : ""}</div>
           ${R.warnings.map(w => `<div class="alch-res-warn">${esc(w)}</div>`).join("")}
           <p class="fell" style="margin-top:8px">Tire sous ${R.jet} · 1-5 = critique · 96-100 = échec critique · Échec = pas d'effet</p></div>`;
    }
    return `<h4 class="alch-h">Simulateur de Rite</h4>
      <p class="alch-note">Critique 1-5 = réussite critique · 96-100 = échec critique · Échec = pas d'effet</p>
      <div class="alch-champ"><label>Ton niveau</label><div class="alch-btns">${A.niveaux.map(n => `<button class="alch-opt ${s.niveau === n.nom ? "actif" : ""}" data-niv="${esc(n.nom)}" style="${s.niveau === n.nom ? `border-color:${n.color};color:${n.color}` : ""}">${esc(n.nom)}${n.isMaster ? " ★" : ""}</button>`).join("")}</div>
        <small class="fell">Jet de base : ${niv.jet} · Max ${niv.maxSigils === 99 ? "∞" : niv.maxSigils} sigils sans malus</small></div>
      <div class="alch-champ"><label>Carburant(s)</label><small class="fell">1 à 3 — plusieurs = malus (−10 pour 2, −25 pour 3)</small>
        <div class="alch-btns">${A.carburants.map(carb => `<button class="alch-opt gros ${s.carbs.includes(carb.nom) ? "actif" : ""}" data-carb="${esc(carb.nom)}" style="${s.carbs.includes(carb.nom) ? `border-color:${carb.color};color:${carb.color}` : ""}">${carb.icon} ${esc(carb.nom)}<br><small>${esc(carb.role)}</small></button>`).join("")}</div>
        ${s.carbs.includes("Sang") ? `<div class="alch-sangsel">${A.carburants[2].niveaux.map(n => `<button class="alch-opt ${s.sang === n.label ? "actif" : ""}" data-sang="${esc(n.label)}" style="${s.sang === n.label ? `border-color:${n.color};color:${n.color}` : ""}">${n.icon} ${esc(n.label)} <span style="float:right;color:${n.mod >= 0 ? "#5f7d49" : "#a52a2a"}">${n.mod >= 0 ? "+" : ""}${n.mod}</span></button>`).join("")}</div>` : ""}</div>
      <div class="alch-champ"><label>Sigils (${s.sigils.length})</label><div class="alch-btns">${A.sigils.map(x => { const col = CAT_SIGIL[x.cat]; return `<button class="alch-opt ${s.sigils.includes(x.nom) ? "actif" : ""}" data-sig="${esc(x.nom)}" style="${s.sigils.includes(x.nom) ? `border-color:${col};color:${col}` : ""}">${x.icon} ${esc(x.nom)}</button>`; }).join("")}</div></div>
      <div class="alch-champ"><label>Sacrifice (optionnel)</label><div class="alch-btns">${[["none", "Aucun", ""], ["objet", "Objet", "+5"], ["animal", "Animal", "+10"], ["humain", "Humain", "+25"]].map(o => `<button class="alch-opt ${s.sacrifice === o[0] ? "actif" : ""}" data-sac="${o[0]}">${o[1]}${o[2] ? `<br><small style="color:#5f7d49">${o[2]}</small>` : ""}</button>`).join("")}</div></div>
      <button class="btn de principal" id="alch-calc" ${s.carbs.length ? "" : "disabled"} style="width:100%;margin:6px 0 14px">⚗ Calculer la Difficulté</button>
      ${res}`;
  }
  if (tab === "modifs") {
    return `<h4 class="alch-h">Rôles des Carburants</h4>` +
      A.carburants.map(carb => `<div class="alch-carb" style="border-left-color:${carb.color}"><div class="alch-carb-t"><span>${carb.icon} <b style="color:${carb.color}">${esc(carb.nom)}</b></span><span class="fell">${esc(carb.role)}</span></div><p>${esc(carb.description)}</p></div>`).join("") +
      `<h4 class="alch-h">Table de Difficulté — Jet par Sigils</h4>
      <div style="overflow-x:auto"><table class="alch-table"><thead><tr><th>Sigils</th>${A.niveaux.map(n => `<th style="color:${n.color}">${esc(n.nom)}</th>`).join("")}</tr></thead>
      <tbody>${[1, 2, 3, 4, 5, 6, "7+"].map(nb => `<tr><td><b>${nb}</b></td>${A.niveaux.map(n => { const val = nb === "7+" ? (getJet(A, n.nom, 6) !== null ? `${getJet(A, n.nom, 6)}−10/S` : "❌") : getJet(A, n.nom, nb); return `<td>${val === null ? "❌" : val}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      <h4 class="alch-h">Autres Modificateurs</h4>` +
      A.modificateurs.map(m => `<div class="alch-mod" style="border-left-color:${m.color}"><span>${esc(m.label)}</span><b style="color:${m.mod.startsWith("+") ? "#5f7d49" : m.mod === "EXPLOSION" ? "#c0392b" : "#a52a2a"}">${esc(m.mod)}</b></div>`).join("") +
      `<div class="alch-warn"><b>CARBURANTS MULTIPLES</b><p>2 carburants : −10 · 3 carburants : −25</p></div>`;
  }
  return "";
}
function calcAlch(A, s) {
  const nb = s.sigils.length;
  if (!s.carbs.length) return;
  let jet = getJet(A, s.niveau, nb);
  if (jet === null) { s.resultat = { impossible: true, nb }; return; }
  let carbMod = 0;
  if (s.carbs.includes("Mercure")) carbMod += 10;
  if (s.carbs.includes("Soufre")) carbMod += 5;
  if (s.carbs.includes("Sang")) { const sn = A.carburants[2].niveaux.find(n => n.label === s.sang); carbMod += sn ? sn.mod : -20; }
  let multi = 0; if (s.carbs.length === 2) multi = -10; if (s.carbs.length === 3) multi = -25;
  let sac = 0; if (s.sacrifice === "objet") sac = 5; if (s.sacrifice === "animal") sac = 10; if (s.sacrifice === "humain") sac = 25;
  const jf = Math.max(1, Math.min(95, jet + carbMod + multi + sac));
  const warnings = [];
  if (s.carbs.includes("Soufre")) warnings.push("⚠️ Interdit aux Îles Saintes — emprisonnement si découvert.");
  if (s.carbs.includes("Sang")) warnings.push("⚠️ Usage du Sang interdit partout sur Asterre.");
  if (s.carbs.length > 1) warnings.push(`⚠️ ${s.carbs.length} carburants combinés — malus ${multi}`);
  s.resultat = { jet: jf, nb, carbMultiMalus: multi, warnings, impossible: false };
}
function brancherAlch(A, s) {
  const corps = $("#meca-corps");
  corps.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { S.meca.tab = b.dataset.tab; renderAlchimie(); }));
  corps.querySelectorAll("[data-fil]").forEach(b => b.addEventListener("click", () => { s.filtre = b.dataset.fil; renderAlchimie(); }));
  corps.querySelectorAll("[data-niv]").forEach(b => b.addEventListener("click", () => { s.niveau = b.dataset.niv; s.resultat = null; renderAlchimie(); }));
  corps.querySelectorAll("[data-carb]").forEach(b => b.addEventListener("click", () => {
    const n = b.dataset.carb; s.carbs = s.carbs.includes(n) ? s.carbs.filter(x => x !== n) : [...s.carbs, n];
    if (!s.carbs.includes("Sang")) s.sang = null; s.resultat = null; renderAlchimie();
  }));
  corps.querySelectorAll("[data-sang]").forEach(b => b.addEventListener("click", () => { s.sang = b.dataset.sang; s.resultat = null; renderAlchimie(); }));
  corps.querySelectorAll("[data-sig]").forEach(b => b.addEventListener("click", () => {
    const n = b.dataset.sig; s.sigils = s.sigils.includes(n) ? s.sigils.filter(x => x !== n) : [...s.sigils, n]; s.resultat = null; renderAlchimie();
  }));
  corps.querySelectorAll("[data-sac]").forEach(b => b.addEventListener("click", () => { s.sacrifice = b.dataset.sac; s.resultat = null; renderAlchimie(); }));
  const calc = corps.querySelector("#alch-calc");
  if (calc) calc.addEventListener("click", () => { calcAlch(A, s); renderAlchimie(); });
}

/* ═══════════════ PARTIE JOUEUR ═══════════════ */
function renderJoueur() {
  const c = $("#joueur-contenu"), J = S.joueur;
  if (!J.perso) {
    const visibles = S.pays.codex.personnages.filter(p => S.mj || visib("pnj-" + p.id, !p.mjOnly));
    c.innerHTML = `<h2>Espace Joueur</h2><div class="filet"></div>
      <p class="fell" style="max-width:640px;margin-bottom:16px">Choisissez votre personnage. Votre fiche — inventaire, quêtes, entraînement — est enregistrée sur cet appareil.</p>
      <input id="choix-perso" list="pnj-datalist-j" placeholder="Votre personnage…" autocomplete="off">
      <datalist id="pnj-datalist-j">${visibles.map(p => `<option value="${esc(p.nom)}">`).join("")}</datalist>
      <div class="grille-pnj" style="margin-top:18px">${visibles.slice(0, 12).map(p => `
        <div class="carte-pnj" data-choix="${p.id}" tabindex="0" role="button">
          <div class="portrait"><img src="${esc(p.portrait)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Portrait à venir'}))"></div>
          <div class="infos"><b>${esc(p.nom)}</b><small>${esc(p.titre || "")}</small></div>
        </div>`).join("")}</div>`;
    const inp = c.querySelector("#choix-perso");
    inp.addEventListener("change", () => {
      const v = inp.value.trim().toLowerCase();
      const p = S.pays.codex.personnages.find(x => x.nom.toLowerCase() === v) || S.pays.codex.personnages.find(x => x.nom.toLowerCase().includes(v));
      if (p) { J.perso = p.id; renderJoueur(); } else toast("Personnage introuvable.");
    });
    c.querySelectorAll("[data-choix]").forEach(k => k.addEventListener("click", () => { J.perso = k.dataset.choix; renderJoueur(); }));
    return;
  }
  const pn = pnj(J.perso), f = ficheJ(J.perso);
  const sous = [["fiche", "📋 Fiche"], ["inventaire", "🎒 Inventaire"], ["quetes", "📜 Quêtes"], ["entrainement", "🏋️ Entraînement"], ["journal", "📖 Journal"]];
  c.innerHTML = `
    <div class="j-tete">
      <div class="j-portrait"><img src="${esc(pn.portrait)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'—',className:'cs-vide'}))"></div>
      <div>
        <h2 style="margin:0">${esc(pn.nom)}</h2>
        <div class="accroche" style="margin:4px 0">${esc(pn.titre || "")}</div>
        <div class="cs-meta"><span><b>Niveau</b> ${f.niveau}</span><span><b>XP</b> ${f.xp}</span><span><b>Origine</b> ${esc(pn.origine || "?")}</span><span><b>Race</b> ${esc(pn.race || "?")}</span></div>
      </div>
      <div class="j-actions-tete">
        <button class="btn" id="j-changer">Changer</button>
        <button class="btn" id="j-export" title="Copier ma fiche pour l'envoyer au MJ">📤 Exporter</button>
        <button class="btn" id="j-import" title="Coller une fiche">📥 Importer</button>
      </div>
    </div>
    <nav class="j-sous">${sous.map(([id, l]) => `<button class="j-tab ${J.sousOnglet === id ? "actif" : ""}" data-sous="${id}">${l}</button>`).join("")}</nav>
    <div id="j-corps"></div>`;
  c.querySelector("#j-changer").addEventListener("click", () => { J.perso = null; renderJoueur(); });
  c.querySelector("#j-export").addEventListener("click", () => exporterFiche(J.perso));
  c.querySelector("#j-import").addEventListener("click", () => importerFiche(J.perso));
  c.querySelectorAll("[data-sous]").forEach(b => b.addEventListener("click", () => { J.sousOnglet = b.dataset.sous; renderJoueur(); }));
  renderSousJoueur();
}
function renderSousJoueur() {
  const corps = $("#j-corps"), f = ficheJ(S.joueur.perso), pn = pnj(S.joueur.perso), o = S.joueur.sousOnglet;
  if (o === "fiche") {
    const stats = STATS_DEF.map(s => {
      const v = f.stats[s.id] || 0;
      return `<div class="statline"><div class="statline-h"><span>${s.nom}</span><span>${v}${S.mj ? ` <button class="mini-pm" data-stat="${s.id}" data-d="-1">−</button><button class="mini-pm" data-stat="${s.id}" data-d="1">+</button>` : ""}</span></div>
        <div class="barre"><div class="barre-f" style="width:${Math.min(100, v / s.max * 100)}%;background:${s.color}"></div></div></div>`;
    }).join("");
    const dets = (pn.details || []).map((d, i) => ({ d: typeof d === "string" ? { texte: d } : d, i })).filter(x => S.mj || visib(`det-${pn.id}-${x.i}`, !x.d.mj));
    corps.innerHTML = `
      <div class="j-cols">
        <div class="carte-outil"><h4>📊 Statistiques</h4>${stats}
          ${S.mj ? `<button class="btn" id="lvlup" style="margin-top:8px">⭐ Level up (+1 niveau)</button>` : ""}</div>
        <div class="carte-outil"><h4>📖 Biographie</h4>
          ${visib("desc-pnj-" + pn.id, true) || S.mj ? `<p>${esc(pn.description)}</p>` : "<p class='fell'>—</p>"}
          ${dets.length ? `<ul class="tensions">${dets.map(x => `<li>${esc(x.d.texte)}</li>`).join("")}</ul>` : ""}</div>
      </div>
      <div class="carte-outil"><h4>💗 États & Conditions</h4>
        <div id="liste-etats">${f.etats.length ? f.etats.map((e, i) => `<span class="etat-chip">${esc(e)} <button data-etat="${i}">✕</button></span>`).join("") : "<span class='fell'>Aucun état actif.</span>"}</div>
        <div class="add-row"><input id="add-etat" placeholder="Ajouter un état (blessure, addiction, malédiction…)"><button class="btn" id="btn-etat">+</button></div></div>`;
    corps.querySelectorAll("[data-stat]").forEach(b => b.addEventListener("click", () => {
      f.stats[b.dataset.stat] = Math.max(0, (f.stats[b.dataset.stat] || 0) + (+b.dataset.d)); sauveFiches(); renderSousJoueur();
    }));
    const lvl = corps.querySelector("#lvlup");
    if (lvl) lvl.addEventListener("click", () => { f.niveau++; f.xp = 0; STATS_DEF.forEach(s => f.stats[s.id] = (f.stats[s.id] || 0) + 3); sauveFiches(); toast("Niveau " + f.niveau + " !"); renderJoueur(); });
    corps.querySelectorAll("[data-etat]").forEach(b => b.addEventListener("click", () => { f.etats.splice(+b.dataset.etat, 1); sauveFiches(); renderSousJoueur(); }));
    const ae = corps.querySelector("#add-etat");
    corps.querySelector("#btn-etat").addEventListener("click", () => { if (ae.value.trim()) { f.etats.push(ae.value.trim()); sauveFiches(); renderSousJoueur(); } });
  } else if (o === "inventaire") {
    corps.innerHTML = `
      <div class="carte-outil"><h4>💰 Bourse</h4>
        <div class="bourse">${[["or", "🟡 Or"], ["argent", "⚪ Argent"], ["bronze", "🟤 Bronze"]].map(([k, l]) =>
          `<div class="piece"><span>${l}</span><div><button class="mini-pm" data-piece="${k}" data-d="-1">−</button><b>${f.bourse[k]}</b><button class="mini-pm" data-piece="${k}" data-d="1">+</button></div>
           <input type="number" class="piece-set" data-piece="${k}" value="${f.bourse[k]}"></div>`).join("")}</div></div>
      <div class="carte-outil"><h4>🎒 Objets</h4>
        <table class="inv-table"><tbody>${f.inventaire.length ? f.inventaire.map((it, i) =>
          `<tr><td>${esc(it.nom)}</td><td class="qte"><button class="mini-pm" data-inv="${i}" data-d="-1">−</button>${it.qte}<button class="mini-pm" data-inv="${i}" data-d="1">+</button></td><td><button class="sup" data-suppr="${i}">✕</button></td></tr>`).join("") : "<tr><td class='fell'>Sac vide.</td></tr>"}</tbody></table>
        <div class="add-row"><input id="add-obj" placeholder="Nom de l'objet"><input type="number" id="add-qte" value="1" min="1" style="width:60px"><button class="btn" id="btn-obj">Ajouter</button></div></div>`;
    corps.querySelectorAll("[data-piece][data-d]").forEach(b => b.addEventListener("click", () => { f.bourse[b.dataset.piece] = Math.max(0, f.bourse[b.dataset.piece] + (+b.dataset.d)); sauveFiches(); renderSousJoueur(); }));
    corps.querySelectorAll(".piece-set").forEach(inp => inp.addEventListener("change", () => { f.bourse[inp.dataset.piece] = Math.max(0, +inp.value || 0); sauveFiches(); renderSousJoueur(); }));
    corps.querySelectorAll("[data-inv]").forEach(b => b.addEventListener("click", () => { const it = f.inventaire[+b.dataset.inv]; it.qte = Math.max(1, it.qte + (+b.dataset.d)); sauveFiches(); renderSousJoueur(); }));
    corps.querySelectorAll("[data-suppr]").forEach(b => b.addEventListener("click", () => { f.inventaire.splice(+b.dataset.suppr, 1); sauveFiches(); renderSousJoueur(); }));
    corps.querySelector("#btn-obj").addEventListener("click", () => { const n = corps.querySelector("#add-obj").value.trim(); if (n) { f.inventaire.push({ nom: n, qte: Math.max(1, +corps.querySelector("#add-qte").value || 1) }); sauveFiches(); renderSousJoueur(); } });
  } else if (o === "quetes") {
    corps.innerHTML = `<div class="carte-outil"><h4>📜 Objectifs & Quêtes</h4>
      <ul class="quetes-liste">${f.quetes.length ? f.quetes.map((q, i) =>
        `<li class="${q.fait ? "fait" : ""}"><label><input type="checkbox" data-q="${i}" ${q.fait ? "checked" : ""}> ${esc(q.texte)}</label><button class="sup" data-qsup="${i}">✕</button></li>`).join("") : "<li class='fell'>Aucun objectif — écrivez le premier.</li>"}</ul>
      <div class="add-row"><input id="add-quete" placeholder="Nouvel objectif…"><button class="btn" id="btn-quete">+</button></div></div>`;
    corps.querySelectorAll("[data-q]").forEach(b => b.addEventListener("change", () => { f.quetes[+b.dataset.q].fait = b.checked; sauveFiches(); renderSousJoueur(); }));
    corps.querySelectorAll("[data-qsup]").forEach(b => b.addEventListener("click", () => { f.quetes.splice(+b.dataset.qsup, 1); sauveFiches(); renderSousJoueur(); }));
    corps.querySelector("#btn-quete").addEventListener("click", () => { const v = corps.querySelector("#add-quete").value.trim(); if (v) { f.quetes.push({ texte: v, fait: false }); sauveFiches(); renderSousJoueur(); } });
  } else if (o === "entrainement") {
    corps.innerHTML = `
      <div class="carte-outil"><h4>🏋️ Compétences</h4>
        <p class="fell" style="font-size:13px">Le joueur enregistre et fait progresser ses compétences. Le MJ valide les paliers.</p>
        <table class="inv-table"><tbody>${f.competences.length ? f.competences.map((cp, i) =>
          `<tr><td>${esc(cp.nom)}</td><td class="qte"><button class="mini-pm" data-cp="${i}" data-d="-1">−</button>Niv. ${cp.niveau}<button class="mini-pm" data-cp="${i}" data-d="1">+</button></td>
           <td class="qte"><div class="barre mini"><div class="barre-f" style="width:${cp.xp % 100}%;background:var(--or)"></div></div> ${cp.xp} XP</td>
           <td><button class="sup" data-cpsup="${i}">✕</button></td></tr>`).join("") : "<tr><td class='fell'>Aucune compétence enregistrée.</td></tr>"}</tbody></table>
        <div class="add-row"><input id="add-comp" placeholder="Nouvelle compétence (ex. Magie du Sang, Épée, Herboristerie)"><button class="btn" id="btn-comp">Apprendre</button></div>
      </div>
      <div class="carte-outil"><h4>➕ Séance d'entraînement</h4>
        <div class="add-row"><select id="ent-comp">${f.competences.map((cp, i) => `<option value="${i}">${esc(cp.nom)}</option>`).join("") || "<option disabled>Ajoutez d'abord une compétence</option>"}</select>
          <input type="number" id="ent-xp" value="10" min="1" style="width:70px"> XP <button class="btn" id="btn-ent">S'entraîner</button></div>
        ${S.mj ? `<p class="fell" style="font-size:12.5px;margin-top:8px">Mode MJ : le bouton Level up de l'onglet Fiche applique le passage de niveau et augmente les stats.</p>` : ""}
      </div>`;
    corps.querySelectorAll("[data-cp]").forEach(b => b.addEventListener("click", () => { f.competences[+b.dataset.cp].niveau = Math.max(1, f.competences[+b.dataset.cp].niveau + (+b.dataset.d)); sauveFiches(); renderSousJoueur(); }));
    corps.querySelectorAll("[data-cpsup]").forEach(b => b.addEventListener("click", () => { f.competences.splice(+b.dataset.cpsup, 1); sauveFiches(); renderSousJoueur(); }));
    corps.querySelector("#btn-comp").addEventListener("click", () => { const n = corps.querySelector("#add-comp").value.trim(); if (n) { f.competences.push({ nom: n, niveau: 1, xp: 0 }); sauveFiches(); renderSousJoueur(); } });
    const be = corps.querySelector("#btn-ent");
    if (be) be.addEventListener("click", () => {
      const i = +corps.querySelector("#ent-comp").value, gain = Math.max(1, +corps.querySelector("#ent-xp").value || 0);
      if (!f.competences[i]) return;
      f.competences[i].xp += gain; f.xp += gain;
      while (f.competences[i].xp >= f.competences[i].niveau * 100) { f.competences[i].xp -= f.competences[i].niveau * 100; f.competences[i].niveau++; toast(f.competences[i].nom + " atteint le niveau " + f.competences[i].niveau + " !"); }
      sauveFiches(); renderSousJoueur();
    });
  } else if (o === "journal") {
    corps.innerHTML = `<div class="carte-outil"><h4>📖 Journal de bord</h4>
      <div class="add-row"><input id="add-journal" placeholder="Ce qui s'est passé…" style="flex:1"><button class="btn" id="btn-journal">Noter</button></div>
      <ul class="journal-liste">${f.journal.length ? f.journal.map((e, i) => `<li><small>${esc(e.date)}</small> ${esc(e.texte)} <button class="sup" data-jsup="${i}">✕</button></li>`).join("") : "<li class='fell'>Journal vierge.</li>"}</ul></div>`;
    corps.querySelector("#btn-journal").addEventListener("click", () => {
      const v = corps.querySelector("#add-journal").value.trim();
      if (v) { const d = (S.pays.calendrier && S.pays.calendrier.actuelle) || new Date().toLocaleDateString("fr-FR"); f.journal.unshift({ date: d, texte: v }); sauveFiches(); renderSousJoueur(); }
    });
    corps.querySelectorAll("[data-jsup]").forEach(b => b.addEventListener("click", () => { f.journal.splice(+b.dataset.jsup, 1); sauveFiches(); renderSousJoueur(); }));
  }
}
function exporterFiche(pid) {
  const paquet = { perso: pid, fiche: ficheJ(pid) };
  const txt = "ASTERRE-FICHE::" + btoa(unescape(encodeURIComponent(JSON.stringify(paquet))));
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
    () => toast("Fiche copiée — envoyez-la à votre MJ."), () => prompt("Copiez votre fiche :", txt));
}
function importerFiche(pid) {
  const v = prompt("Collez une fiche exportée (ASTERRE-FICHE::…) :");
  if (!v) return;
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(v.replace("ASTERRE-FICHE::", "").trim()))));
    S.fichesJoueur[p.perso] = p.fiche; sauveFiches();
    S.joueur.perso = p.perso; renderJoueur(); toast("Fiche importée.");
  } catch (e) { toast("Fiche illisible."); }
}

/* ─────────────── Codex ─────────────── */
const CHAPITRES = [
  ["lois", "📜 Lois & Interdits"], ["religions", "⛪ Religions"], ["familles", "🛡 Familles & Blasons"],
  ["economie", "💰 Économie"], ["politique", "👑 Politique"], ["armees", "⚔ Armées"],
  ["chronologie", "📅 Chronologie"], ["personnages", "👤 Personnages"], ["races", "🧬 Races"], ["bestiaire", "🩸 Bestiaire"]
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
function articleHTML(sec, prefix) {
  const contenu = `<h4>${esc(sec.titre)}</h4><p>${esc(sec.contenu)}</p>${secretsHTML(sec.secrets)}`;
  return `<div class="article">${prefix ? blocMJ(prefix, true, contenu, "Section visible pour les joueurs") : contenu}</div>`;
}
function renderChapitre(ch) {
  const c = $("#codex-contenu"), cx = S.pays.codex;
  let html = "";
  if (["lois", "religions", "politique", "economie", "armees"].includes(ch)) {
    const bloc = cx[ch];
    html = `<h2>${esc(bloc.titre)}</h2><div class="filet"></div>` + bloc.sections.map((s, i) => articleHTML(s, `art-${ch}-${i}`)).join("");
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
      cx.chronologie.map((e, i) => ({ e, i })).filter(x => (!filtre || x.e.lieux.includes(filtre)) && (S.mj || visib(`chr-${x.i}`, true))).map(({ e, i }) => `
        <li class="${visib(`chr-${i}`, true) ? "" : "pt-cache"}" data-bloc="chr-${i}"><span class="date">${esc(e.date)}</span><br>${esc(e.evenement)}
        ${e.lieux.length ? `<div class="liens-lieux">📍 ${e.lieux.filter(id => S.lieux[id]).map(id => esc(S.lieux[id].nom)).join(" · ")}</div>` : ""}${cocheMJ(`chr-${i}`, true, "Visible")}</li>`).join("") + `</ul>`;
  } else if (ch === "personnages") {
    const visiblesPnj = cx.personnages.filter(p => S.mj || visib("pnj-" + p.id, !p.mjOnly));
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
        <div class="carte-pnj ${visib("pnj-" + p.id, !p.mjOnly) ? "" : "mj-only"}" data-pnj="${p.id}" tabindex="0" role="button" aria-label="${esc(p.nom)}">
          <div class="portrait"><img src="${esc(p.portrait)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Portrait à venir'}))"></div>
          <div class="infos"><b>${visib("pnj-" + p.id, !p.mjOnly) ? "" : "🔒 "}${esc(p.nom)}</b><small>${esc(p.titre || "")}</small></div>
        </div>`).join("") + `</div>`).join("");
  } else if (ch === "races") {
    const races = (cx.races || []).filter(r => S.mj || visib("race-" + r.id, !r.mjOnly));
    const cats = [];
    for (const r of races) { if (!cats.includes(r.categorie)) cats.push(r.categorie); }
    html = `<h2>Les Peuples d'Asterre</h2><div class="filet"></div>
      <p class="fell" style="max-width:720px;margin-bottom:18px">Cinq mondes ont fusionné lors de la Conjonction des Sphères. Voici ce qui en est né — et ce qui a survécu.</p>` +
      cats.map(cat => `<h3 class="titre-region">${esc(cat)}</h3>` +
        races.filter(r => r.categorie === cat).map(r => {
          const vR = visib("race-" + r.id, !r.mjOnly);
          return `<div class="article carte-bete ${vR ? "" : "bete-mj"}">
            <h4>${vR ? "" : "🔒 "}${r.icone ? esc(r.icone) + " " : ""}${esc(r.nom)} <span class="badge-danger badge-race">${esc(r.statut)}</span></h4>
            <small class="ligne-bete">Origine : ${esc(r.origine)} · Vie : ${esc(r.vie)} · Magie : ${esc(r.magie)}${r.localisation ? " · " + esc(r.localisation) : ""}</small>
            ${blocMJ("desc-race-" + r.id, true, `<p>${esc(r.description)}</p>`, "Description visible")}
            ${detailsHTML(r.details, "rac-" + r.id)}${cocheMJ("race-" + r.id, !r.mjOnly, "Fiche visible pour les joueurs")}
          </div>`;
        }).join("")).join("");
  } else if (ch === "bestiaire") {
    const betes = (cx.bestiaire || []).filter(b => S.mj || visib("bete-" + b.id, !b.mjOnly));
    html = `<h2>Bestiaire</h2><div class="filet"></div>
      <p class="fell" style="max-width:720px;margin-bottom:18px">Ce que la Magie du Sang laisse derrière elle. Toutes les créatures ne sont pas connues du commun des mortels.</p>` +
      (betes.length ? "" : `<p>Aucune créature répertoriée — pour l'instant.</p>`) +
      betes.map(b => {
        const vB = visib("bete-" + b.id, !b.mjOnly);
        return `<div class="article carte-bete ${vB ? "" : "bete-mj"}">
          <h4>${vB ? "" : "🔒 "}${esc(b.nom)} <span class="badge-danger">${esc(b.danger)}</span></h4>
          <small class="ligne-bete">${esc(b.categorie)} · Origine : ${esc(b.origine)}</small>
          ${blocMJ("desc-bete-" + b.id, true, `<p>${esc(b.description)}</p>`, "Description visible")}
          ${detailsHTML(b.details, "bet-" + b.id)}${cocheMJ("bete-" + b.id, !b.mjOnly, "Fiche visible pour les joueurs")}
        </div>`;
      }).join("");
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
  $("#seance").classList.toggle("ouvert", v === "seance");
  $("#joueur").classList.toggle("ouvert", v === "joueur");
  $("#meca").classList.toggle("ouvert", v === "meca");
  $("#ong-carte").classList.toggle("actif", v === "carte");
  $("#ong-codex").classList.toggle("actif", v === "codex");
  $("#ong-seance").classList.toggle("actif", v === "seance");
  $("#ong-joueur").classList.toggle("actif", v === "joueur");
  $("#ong-meca").classList.toggle("actif", v === "meca");
  if (v !== "carte") { fermerPanneau(); toggleVoyage(false); }
  if (v === "seance") renderSeance();
  if (v === "joueur") renderJoueur();
  if (v === "meca") renderMeca();
}
/* ── Table de Séance ── */
function chargerSeanceHash() {
  const h = location.hash.match(/pj=([^&]*)/), l = location.hash.match(/lieu=([^&]*)/);
  if (h) S.seance.pnj = decodeURIComponent(h[1]).split(",").filter(id => pnj(id)).slice(0, 6);
  if (l) { const id = decodeURIComponent(l[1]); if (S.lieux[id]) S.seance.lieu = id; }
  if (h || l) montrerVue("seance");
}
function majHashSeance() {
  const parts = [];
  if (S.seance.pnj.length) parts.push("pj=" + S.seance.pnj.join(","));
  if (S.seance.lieu) parts.push("lieu=" + S.seance.lieu);
  history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname + location.search);
}
/* ── Dés ── */
function tirage(faces) {
  const u = new Uint32Array(1); crypto.getRandomValues(u);
  return 1 + (u[0] % faces);
}
function lancerDes(n, faces, mod) {
  n = Math.max(1, Math.min(20, n | 0)); mod = mod | 0;
  const rolls = Array.from({ length: n }, () => tirage(faces));
  const total = rolls.reduce((s, x) => s + x, 0) + mod;
  const txt = `${n}d${faces}${mod ? (mod > 0 ? "+" + mod : mod) : ""}`;
  let palier = "";
  if (faces === 100 && n === 1) {
    const v = rolls[0];
    palier = v === 1 ? "un" : (v <= 5 ? "reussite" : (v === 100 ? "cent" : (v >= 96 ? "echec" : "")));
  }
  S.des.historique.unshift({ txt, rolls, mod, total, palier });
  S.des.historique = S.des.historique.slice(0, 8);
  majDesUI();
}
function majDesUI() {
  const z = document.querySelector("#zone-des"); if (!z) return;
  const h = S.des.historique;
  const P = { un: ["crit-un", "✨ UN — Critique doré !"], reussite: ["crit-reussite", "⭐ Réussite critique !"],
              echec: ["crit-echec", "💀 Échec critique !"], cent: ["crit-cent", "☠️ CENT — Échec catastrophique !"] };
  const p0 = h.length ? P[h[0].palier] : null;
  z.innerHTML = h.length ? `
    <div class="de-resultat ${p0 ? p0[0] : ""}">${h[0].total}</div>
    <div class="de-detail">${esc(h[0].txt)} → [${h[0].rolls.join(" · ")}]${h[0].mod ? (h[0].mod > 0 ? " + " + h[0].mod : " − " + (-h[0].mod)) : ""}${p0 ? ` — <b class="${p0[0]}-t">${p0[1]}</b>` : ""}</div>
    <div class="de-histo">${h.slice(1).map(x => `<span>${esc(x.txt)}=${x.total}</span>`).join(" ")}</div>`
    : `<div class="de-detail fell">Les dés attendent votre main…</div>`;
}
/* ── Musique d'ambiance ── */
let AUDIO = null;
function initMusique() {
  AUDIO = new Audio(); AUDIO.loop = true; AUDIO.volume = .7;
  AUDIO.addEventListener("ended", majBarreMusique);
  AUDIO.addEventListener("play", majBarreMusique);
  AUDIO.addEventListener("pause", majBarreMusique);
}
function jouerPiste(i) {
  const p = S.musiques[i]; if (!p) return;
  if (S.pisteActive === i) { AUDIO.paused ? AUDIO.play() : AUDIO.pause(); majBarreMusique(); return; }
  S.pisteActive = i;
  AUDIO.src = p.fichier; AUDIO.loop = p.boucle !== false;
  AUDIO.play().catch(() => toast("Lecture impossible — vérifiez que le fichier " + p.fichier + " est bien déposé."));
  majBarreMusique();
  const z = document.querySelector("#zone-musique"); if (z) majPistesUI();
}
function stopPiste() { if (AUDIO) { AUDIO.pause(); AUDIO.src = ""; } S.pisteActive = null; majBarreMusique(); majPistesUI(); }
function majBarreMusique() {
  const b = $("#musique-bar");
  const p = S.pisteActive != null ? S.musiques[S.pisteActive] : null;
  if (!p) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<span class="mb-titre">🎵 ${esc(p.titre)}</span>
    <button class="btn" id="mb-play">${AUDIO.paused ? "▶" : "⏸"}</button>
    <button class="btn ${AUDIO.loop ? "actif" : ""}" id="mb-loop" title="Boucle">🔁</button>
    <input type="range" id="mb-vol" min="0" max="100" value="${Math.round(AUDIO.volume * 100)}" aria-label="Volume">
    <button class="btn" id="mb-stop" title="Arrêter">✕</button>`;
  b.querySelector("#mb-play").addEventListener("click", () => { AUDIO.paused ? AUDIO.play() : AUDIO.pause(); });
  b.querySelector("#mb-loop").addEventListener("click", () => { AUDIO.loop = !AUDIO.loop; majBarreMusique(); });
  b.querySelector("#mb-vol").addEventListener("input", e => { AUDIO.volume = e.target.value / 100; });
  b.querySelector("#mb-stop").addEventListener("click", stopPiste);
}
function majPistesUI() {
  const z = document.querySelector("#zone-musique"); if (!z) return;
  z.innerHTML = S.musiques.length
    ? `<div class="chips">` + S.musiques.map((p, i) =>
        `<button class="chip ${S.pisteActive === i ? "chip-active" : ""}" data-piste="${i}">${S.pisteActive === i && !AUDIO.paused ? "⏸ " : "▶ "}${esc(p.titre)}</button>`).join("") + `</div>`
    : `<p class="fell" style="font-size:13.5px">Aucune piste — déposez vos fichiers audio dans <code>musiques/</code> et listez-les dans <code>data/musiques.json</code> (ou dites-le à Claude).</p>`;
  z.querySelectorAll("[data-piste]").forEach(b => b.addEventListener("click", () => jouerPiste(+b.dataset.piste)));
}

function carteSeance(id) {
  const pn = pnj(id); if (!pn) return "";
  const vFiche = visib("pnj-" + pn.id, !pn.mjOnly);
  if (!vFiche && !S.mj) return `<div class="carte-seance"><div class="cs-infos"><h4>❔ Personnage inconnu</h4><p class="fell">Les joueurs ne connaissent pas encore cette personne.</p></div></div>`;
  const vDesc = visib("desc-pnj-" + pn.id, true);
  const meta = [["Origine", pn.origine], ["Race", pn.race], ["Statut", pn.statut]].filter(x => x[1]);
  const dets = (pn.details || []).map((d, i) => ({ d: typeof d === "string" ? { texte: d } : d, i }))
    .filter(x => S.mj || visib(`det-${pn.id}-${x.i}`, !x.d.mj));
  return `<div class="carte-seance ${vFiche ? "" : "bete-mj"}">
    <button class="cs-retirer" data-ret="${esc(pn.id)}" title="Retirer" aria-label="Retirer ${esc(pn.nom)}">✕</button>
    <div class="cs-portrait"><img src="${esc(pn.portrait)}" alt="" loading="lazy"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Portrait à venir',className:'cs-vide'}))"></div>
    <div class="cs-infos">
      <h4>${vFiche ? "" : "🔒 "}${esc(pn.nom)}</h4>
      <small class="fell">${esc(pn.titre || "")}</small>
      ${meta.length ? `<div class="cs-meta">${meta.map(m => `<span><b>${m[0]}</b> ${esc(m[1])}</span>`).join("")}</div>` : ""}
      ${(vDesc || S.mj) ? `<p class="${vDesc ? "" : "pt-cache"}">${esc(pn.description)}</p>` : ""}
      ${dets.length ? `<ul class="tensions">${dets.map(x => `<li class="${(S.masques.has(`det-${pn.id}-${x.i}`) ? false : (S.reveals.has(`det-${pn.id}-${x.i}`) ? true : !x.d.mj)) ? "" : "pt-cache"}">${esc(x.d.texte)}</li>`).join("")}</ul>` : ""}
      <button class="chip" data-fiche="${esc(pn.id)}">Fiche complète →</button>
    </div></div>`;
}
function renderSeance() {
  const c = $("#seance-contenu"), sel = S.seance;
  let html = `<h2>Table de Séance</h2><div class="filet"></div>
    <div class="seance-outils">
      <input id="aj-pnj" list="pnj-datalist" placeholder="+ Ajouter un personnage (max 6)…" autocomplete="off">
      <datalist id="pnj-datalist">${S.pays.codex.personnages.filter(p => S.mj || visib("pnj-" + p.id, !p.mjOnly)).map(p => `<option value="${esc(p.nom)}">`).join("")}</datalist>
      <input id="aj-lieu-s" list="lieux-datalist" placeholder="📍 Lieu de la scène…" autocomplete="off">
      <button class="btn" id="copier-scene">🔗 Copier le lien de la scène</button>
      <button class="btn" id="vider-scene">Vider</button>
    </div>`;
  html += `<div class="seance-outils2">
    <div class="carte-outil">
      <h4>🎲 Lancer de dés</h4>
      <div class="de-boutons"><button class="btn de principal" data-de="100">🎲 d100</button>${[4, 6, 8, 10, 12, 20].map(f => `<button class="btn de" data-de="${f}">d${f}</button>`).join("")}</div>
      <small class="de-regle">1 = doré · 2-5 réussite critique · 96-99 échec critique · 100 = catastrophe</small>
      <div class="de-options">
        <label>Nb <input type="number" id="de-nb" min="1" max="20" value="1"></label>
        <label>Mod <input type="number" id="de-mod" value="0"></label>
      </div>
      <div id="zone-des"></div>
    </div>
    <div class="carte-outil">
      <h4>🎵 Ambiance</h4>
      <div id="zone-musique"></div>
    </div>
  </div>`;
  if (sel.lieu && S.lieux[sel.lieu]) {
    const l = S.lieux[sel.lieu];
    const vD = visib("desc-lieu-" + l.id, true);
    html += `<div class="scene-lieu">
      ${imgHTML((l.images || [])[0] || `images/lieux/${l.id}/principale.jpg`, l.nom)}
      <div><span class="badge-type">${NOMS_TYPES[l.type] || l.type}</span>
      <h3 style="border:none;text-transform:none;font-size:22px;margin:4px 0">${esc(l.nom)}</h3>
      <div class="accroche">${esc(l.accroche)}</div>
      ${(vD || S.mj) ? `<p class="${vD ? "" : "pt-cache"}">${esc(l.description)}</p>` : ""}
      <button class="chip" data-lieu-s="${esc(l.id)}">Fiche du lieu →</button></div>
    </div>`;
  }
  html += `<div class="grille-seance">` + sel.pnj.map(carteSeance).join("") + `</div>`;
  if (!sel.pnj.length && !sel.lieu) html += `<p class="fell" style="max-width:640px">Composez votre scène : choisissez jusqu'à six personnages et un lieu, puis partagez le lien à vos joueurs — ils verront exactement ce que vous avez rendu visible.</p>`;
  c.innerHTML = html;
  c.querySelector("#aj-pnj").addEventListener("change", e => {
    const v = e.target.value.trim().toLowerCase();
    const p = S.pays.codex.personnages.find(x => x.nom.toLowerCase() === v) || S.pays.codex.personnages.find(x => x.nom.toLowerCase().includes(v));
    if (!p) return toast("Personnage introuvable.");
    if (S.seance.pnj.includes(p.id)) return toast("Déjà sur la table.");
    if (S.seance.pnj.length >= 6) return toast("Six personnages maximum — retirez-en un d'abord.");
    S.seance.pnj.push(p.id); majHashSeance(); renderSeance();
  });
  c.querySelector("#aj-lieu-s").addEventListener("change", e => {
    const v = e.target.value.trim().toLowerCase();
    const l = S.pays.lieux.find(x => x.nom.toLowerCase() === v) || S.pays.lieux.find(x => x.nom.toLowerCase().includes(v));
    if (!l) return toast("Lieu introuvable.");
    S.seance.lieu = l.id; majHashSeance(); renderSeance();
  });
  c.querySelector("#copier-scene").addEventListener("click", () => {
    majHashSeance();
    (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(
      () => toast("Lien de la scène copié — envoyez-le à vos joueurs."),
      () => prompt("Copiez ce lien :", location.href));
  });
  c.querySelector("#vider-scene").addEventListener("click", () => { S.seance = { pnj: [], lieu: null }; majHashSeance(); renderSeance(); });
  c.querySelectorAll("[data-ret]").forEach(b => b.addEventListener("click", () => {
    S.seance.pnj = S.seance.pnj.filter(x => x !== b.dataset.ret); majHashSeance(); renderSeance();
  }));
  c.querySelectorAll("[data-fiche]").forEach(b => b.addEventListener("click", () => ouvrirPnj(b.dataset.fiche)));
  c.querySelectorAll("[data-lieu-s]").forEach(b => b.addEventListener("click", () => ouvrirLieu(b.dataset["lieuS"])));
  c.querySelectorAll(".de-boutons [data-de]").forEach(b => b.addEventListener("click", () => {
    lancerDes(+c.querySelector("#de-nb").value, +b.dataset.de, +c.querySelector("#de-mod").value);
  }));
  majDesUI(); majPistesUI();
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
if (IS_BROWSER) document.addEventListener("change", e => {
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
    const cible = t.closest("[data-bloc]") || t.closest("li"); if (cible) cible.classList.toggle("pt-cache", !t.checked);
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
  $("#lieux-datalist").innerHTML = S.pays.lieux.filter(l => S.mj || visib("lieu-" + l.id, true)).map(l => `<option value="${esc(l.nom)}">`).join("");
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
  $("#ong-seance").addEventListener("click", () => montrerVue("seance"));
  $("#ong-joueur").addEventListener("click", () => montrerVue("joueur"));
  $("#ong-meca").addEventListener("click", () => montrerVue("meca"));
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
  svg.addEventListener("pointerup", () => { S._dragBouge = drag && drag.bouge; drag = null; svg.classList.remove("drag"); });
  svg.addEventListener("click", e => {
    if (!S.voyage.actif || S._dragBouge) return;
    clicLibre(coordsSouris(e));
  });
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
if (typeof module !== "undefined") module.exports = { construireGraphe, dijkstra, fmtJours, arrondiVoyageur, penalite, calcSegment, raisonSegment, analyseLigne, S };
