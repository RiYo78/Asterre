/* ASTERRE — carte/rendu.js · Dessin SVG de la carte : mer, îles, régions, voisins, routes, portails, marqueurs, rose des vents, échelle, légende. */
import { catmullPath, pointInPoly, scatterInPoly, wobble } from "./geometrie.js?v=16";
import { appliquerVB } from "./vue.js?v=16";
import { S } from "../etat.js?v=16";
import { $, el, rng } from "../utils.js?v=16";
import { visib } from "../visibilite.js?v=16";
import { clicLieu } from "../voyage/ui.js?v=16";

/* ─────────────── Rendu de la carte ─────────────── */
export const COULEURS = {
  ileFill: "#cfc190", ileTrait: "#3f331f",
  prairie: "#a3ba74", foret: "#7d955e", "foret-neige": "#dde5df",
  "montagne-neige": "#e7e9e4", marais: "#8f9c6d", colline: "#c4b684", ville: "#c9b78d"
};

export function renderCarte() {
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
    if ((S.pays.iles || []).some(il => pointInPoly([x, y], il.forme))) continue;
    el("path", { d: `M${x},${y} q6,-4 12,0 q6,4 12,0` }, gV);
  }

  const gCotes = el("g", {}, svg);
  const gIles = el("g", {}, svg);
  const gRegions = el("g", { id: "g-regions" }, svg);
  const gRegTextes = el("g", { id: "g-reg-textes" }, svg);
  const gZones = el("g", {}, svg);
  const gFleuves = el("g", {}, svg);
  const gVoies = el("g", {}, svg);
  const gTrajet = el("g", { id: "g-trajet" }, svg);
  const gMarqueurs = el("g", { id: "g-marqueurs" }, svg);
  const gTextes = el("g", {}, svg);

  // ── îles + anneaux côtiers
  for (const ile of (S.pays.iles || [])) {
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

  // ── voisins hors-cadre (le pays n'est pas une île perdue)
  for (const v of (S.pays.voisins || [])) {
    const g = el("g", { class: "voisin" }, gRegions);
    const d = catmullPath(wobble(v.poly, 41, 8, 2), true);
    el("path", { d, fill: v.couleur, opacity: .3, stroke: "none" }, g);
    el("path", { d, fill: "none", stroke: "#5c4b34", "stroke-width": 2.4, "stroke-dasharray": "3 9",
      "stroke-linecap": "round", opacity: .6 }, g);
    if (v.label) {
      const la = { x: v.label[0], y: v.label[1], "text-anchor": "middle", "font-size": v.taille || 16, class: "label-voisin" };
      if (v.angle) la.transform = `rotate(${v.angle} ${v.label[0]} ${v.label[1]})`;
      el("text", la, gRegTextes).textContent = v.nom;
      if (v.sous) {
        const sa = { x: v.label[0], y: v.label[1] + (v.taille || 16) * 0.85, "text-anchor": "middle",
          "font-size": Math.max(9, (v.taille || 16) * 0.5), class: "label-voisin-sous" };
        if (v.angle) sa.transform = `rotate(${v.angle} ${v.label[0]} ${v.label[1]})`;
        el("text", sa, gRegTextes).textContent = v.sous;
      }
    }
  }

  // ── régions (zones colorées lisibles)
  const REGS = S.pays.regions_carte || (S.pays.estMonde ? S.pays.regions : null);
  if (REGS) {
    for (const rg of REGS) {
      const cliq = rg.pays && S.paysData && S.paysData[rg.pays] && rg.pays !== S.paysActifId;
      const attrs = { class: "region" + (cliq ? " region-cliq" : ""), "data-region": rg.id };
      if (cliq) attrs["data-allerpays"] = rg.pays;
      const g = el("g", attrs, gRegions);
      const polys = rg.polys || (rg.poly ? [rg.poly] : []);
      for (const poly of polys) {
        const w = wobble(poly, (rg.id.length * 7) + 3, 7, 2);
        const d = catmullPath(w, true);
        el("path", { d, fill: rg.couleur, opacity: .5, stroke: "none" }, g);
        el("path", { d, fill: "none", stroke: rg.bord || "#5c4b34", "stroke-width": 3.2, opacity: .55, "stroke-linejoin": "round" }, g);
        el("path", { d, fill: "none", stroke: rg.bord || "#5c4b34", "stroke-width": 1.4, "stroke-dasharray": "10 6", opacity: .9, "stroke-linejoin": "round" }, g);
      }
      if (rg.label) {
        const la = { x: rg.label[0], y: rg.label[1], "text-anchor": "middle", "font-size": rg.taille || 22, class: "label-region" };
        if (rg.angle) la.transform = `rotate(${rg.angle} ${rg.label[0]} ${rg.label[1]})`;
        const t = el("text", la, gRegTextes);
        t.textContent = rg.nom;
        if (rg.note) el("title", {}, t).textContent = rg.note;
        if (rg.race) {
          const sa = { x: rg.label[0], y: rg.label[1] + (rg.taille || 22) * 0.78, "text-anchor": "middle",
            "font-size": Math.max(10, (rg.taille || 22) * 0.46), class: "label-region-sous" };
          if (rg.angle) sa.transform = `rotate(${rg.angle} ${rg.label[0]} ${rg.label[1]})`;
          el("text", sa, gRegTextes).textContent = rg.race;
        }
      }
    }
  }

  // ── routes & voies maritimes
  for (const r of (S.pays.routes || [])) {
    const d = catmullPath(r.points, false);
    let attrs;
    if (r.type === "route") attrs = { stroke: "#5a4326", "stroke-width": 3.2, "stroke-dasharray": "12 7" };
    else if (r.type === "piste") attrs = { stroke: "#6b5638", "stroke-width": 2.4, "stroke-dasharray": "3 7" };
    else if (r.type === "montagne") attrs = { stroke: "#4c3a22", "stroke-width": 2.4, "stroke-dasharray": "2 8" };
    else if (r.type === "cotier") attrs = { stroke: "#dceef0", "stroke-width": 2, "stroke-dasharray": "2 9", opacity: .8 };
    else attrs = { stroke: r.danger ? "#a9c4c8" : "#cfe4e6", "stroke-width": 2.2, "stroke-dasharray": "10 12", opacity: r.danger ? .5 : .75 };
    el("path", { d, fill: "none", "stroke-linecap": "round", ...attrs }, gVoies);
  }

  // ── vers le continent (uniquement sur la carte du pays d'où part la distance — les Îles Saintes)
  const cont = S.monde.pays.find(p => p.id === "continent");
  if (cont && cont.distanceDepuis && S.lieux[cont.distanceDepuis.lieu]) {
    const g = el("g", { opacity: .85 }, gTextes);
    el("path", { d: "M1880,640 h82 m-14,-11 l14,11 l-14,11", fill: "none", stroke: "#e8dcb8", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    const t1 = el("text", { x: 1918, y: 618, "text-anchor": "middle", "font-size": 20, class: "label-ile", fill: "#e8dcb8" }, g);
    t1.textContent = "Vers le Continent";
    const t2 = el("text", { x: 1918, y: 676, "text-anchor": "middle", "font-size": 14, class: "label-ile", fill: "#cfe0e2" }, g);
    t2.textContent = `${cont.distanceDepuis.km} km — 3 j de navire`;
  }

  // ── portails vers d'autres mondes (ex. Babel) — masqués aux joueurs si mjOnly
  for (const po of (S.pays.portails || [])) {
    if (po.mjOnly && !S.mj) continue;
    const [x, y] = po.pos;
    const g = el("g", { class: "portail" + (po.mjOnly ? " portail-mj" : ""), "data-portail": po.id }, gTextes);
    for (const [r, op] of [[34, .18], [24, .3], [14, .55]])
      el("ellipse", { cx: x, cy: y, rx: r, ry: r * .62, fill: "none", stroke: "#6b2f3a", "stroke-width": 2.2, opacity: op }, g);
    el("ellipse", { cx: x, cy: y, rx: 6, ry: 3.7, fill: "#3a1820", opacity: .8 }, g);
    el("text", { x, y: y + 44, "text-anchor": "middle", "font-size": 20, class: "label-region" }, g).textContent = (po.mjOnly ? "🔒 " : "") + po.nom;
    if (po.sous) el("text", { x, y: y + 60, "text-anchor": "middle", "font-size": 11, class: "label-region-sous" }, g).textContent = po.sous;
    if (po.note) el("title", {}, g).textContent = po.note;
  }

  for (const lb of (S.pays.labels || [])) {
    const t = el("text", { x: lb.pos[0], y: lb.pos[1], "text-anchor": "middle", "font-size": lb.taille || 15, class: "label-ile",
      transform: lb.angle ? `rotate(${lb.angle} ${lb.pos[0]} ${lb.pos[1]})` : "" }, gTextes);
    t.textContent = lb.texte;
  }
  dessinerRose(gTextes, 1000, 218, 62);
  dessinerEchelle(gTextes, 830, 1442);

  // ── marqueurs & noms de lieux
  for (const l of (S.pays.lieux || [])) {
    if (!S.mj && !visib("lieu-" + l.id, true)) continue;
    const g = el("g", { class: "marqueur", "data-id": l.id, tabindex: 0, role: "button", "aria-label": l.nom }, gMarqueurs);
    dessinerMarqueur(g, l);
    const ty = l.pos[1] + (l.type === "capitale" ? 40 : 32);
    el("text", { x: l.pos[0], y: ty, "text-anchor": "middle", "font-size": tailleLabel(l.type), class: "label-lieu" }, g).textContent = l.nom;
    g.addEventListener("click", ev => { ev.stopPropagation(); clicLieu(l.id); });
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clicLieu(l.id); } });
  }
}
export function tailleLabel(type) { return { capitale: 22, ville: 18, "ville-detruite": 18, academie: 17, village: 14, "lieu-dit": 13, danger: 15 }[type] || 14; }

export function dessinerZone(g, z, seed) {
  const c = COULEURS[z.type];
  const wp = wobble(z.poly, seed + 91, 12, 2);
  el("path", { d: catmullPath(wp, true), fill: c, opacity: z.type.includes("neige") ? .85 : .55, stroke: "none" }, g);
  const pts = scatterInPoly(z.poly, z.densite || 12, seed + 13);
  const R = rng(seed + 29);
  for (const p of pts) glyphe(g, z.type, p[0], p[1], R);
}
export function glyphe(g, type, x, y, R) {
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

export function dessinerMarqueur(g, l) {
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

export function dessinerRose(g, x, y, r) {
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
export function dessinerEchelle(g, x, y) {
  const u = 100 / S.kmParUnite; // 100 km en unités carte
  const gr = el("g", { opacity: .9 }, g);
  el("rect", { x, y, width: u, height: 8, fill: "#e8dcb8", stroke: "#2c545e", "stroke-width": 1.4 }, gr);
  el("rect", { x: x + u / 2, y, width: u / 2, height: 8, fill: "#2c545e" }, gr);
  const t = el("text", { x: x + u / 2, y: y - 8, "text-anchor": "middle", "font-size": 15, class: "label-ile", fill: "#e8dcb8" }, gr);
  t.textContent = "≈ 100 km";
}

export function renderLegende() {
  $("#legende").innerHTML = `
    <b>LÉGENDE</b>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#5a4326" stroke-width="3" stroke-dasharray="9 5"/></svg> Route</div>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#6b5638" stroke-width="2.4" stroke-dasharray="2.5 6"/></svg> Piste · col de montagne</div>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#7fa7ad" stroke-width="2" stroke-dasharray="2 7"/></svg> Voie côtière</div>
    <div class="l"><svg width="34" height="8"><path d="M2,4 h30" stroke="#8fb5ba" stroke-width="2.2" stroke-dasharray="8 9"/></svg> Voie maritime</div>`;
}
