/* ASTERRE — voyage/moteur.js · Moteur de voyage : graphe des routes, plus court chemin, vitesses, arrondi du voyageur, trajets en ligne directe. */
import { pointInPoly } from "../carte/geometrie.js?v=15";
import { S } from "../etat.js?v=15";

/* ─────────────── Graphe & voyage ─────────────── */
export function construireGraphe(routes) {
  const g = {};
  const ajoute = (de, a, r, pts) => { (g[de] = g[de] || []).push({ vers: a, km: r.km, type: r.type, terrain: r.terrain, danger: r.danger, points: pts }); };
  for (const r of routes) {
    ajoute(r.de, r.a, r, r.points);
    ajoute(r.a, r.de, r, [...r.points].reverse());
  }
  return g;
}
export function penalite(transportId, edge) {
  if (edge.type === "montagne") { if (transportId === "pied") return .7; if (transportId === "cheval") return .6; }
  if (edge.terrain === "difficile") { if (transportId === "pied") return .7; if (transportId === "cheval") return .7; }
  return 1;
}
export function vitesseGlobale(t, modifs, defsModifs) {
  let m = 1;
  for (const id of modifs) {
    const d = defsModifs.find(x => x.id === id);
    if (d && !d.bloqueMer) m += d.effet;
  }
  return Math.max(4, t.kmJour * m);
}
export function dijkstra(graphe, de, a, transport, opts) {
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
export function raisonImpossible(transport, de, a, modifs, defsModifs) {
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
   à pied on compte en journées pleines ; le cheval arrondit à la journée en montagne ;
   mer et calèche à la demi-journée ; le vol au quart de journée.
   Le repos n'est PAS compté ici : voir joursRepos(), appliqué sur l'ensemble du trajet. */
export function arrondiVoyageur(t, r) {
  const mont = r.edges.some(e => e.type === "montagne");
  const j = r.jours;
  if (t.id === "pied" || (t.id === "cheval" && mont)) return Math.max(1, Math.ceil(j));
  if (t.id === "vol") return Math.max(.25, Math.ceil(j * 4) / 4);
  return Math.max(.5, Math.ceil(j * 2) / 2);
}
/* Repos (règle du MJ, 2026-11) : 1 jour de repos tous les 3 jours de voyage, compté sur
   l'ensemble du trajet, pour les moyens qui fatiguent le voyageur ou sa monture.
   Les embarcations (bateau côtier, navire) ne comptent pas : on dort à bord. */
export const MOYENS_AVEC_REPOS = new Set(["pied", "cheval", "caleche", "vol", "nage"]);
export function joursRepos(joursDeVoyage) {
  // 3 jours de route puis 1 jour de repos : 3 j → 0 repos, 3,5 j → 1, 6 j → 1, 6,5 j → 2
  return joursDeVoyage > 3 ? Math.ceil(joursDeVoyage / 3) - 1 : 0;
}
export function fmtJours(j) {
  const q = Math.max(.25, Math.round(j * 4) / 4);
  const ent = Math.floor(q), frac = q - ent;
  const F = { 0: "", .25: "¼", .5: "½", .75: "¾" }[frac];
  if (ent === 0) return F + " j";
  return F ? `${ent} ${F} j`.replace(" ¼", "¼").replace(" ½", "½").replace(" ¾", "¾") : `${ent} j`;
}

/* ── Voyage libre : géométrie ── */
export function eucKm(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) * S.kmParUnite; }
export function posEtape(et) { return et.type === "lieu" ? S.lieux[et.id].pos : et.pos; }
export function nomEtape(et, i) { return et.type === "lieu" ? S.lieux[et.id].nom : `Point libre ${et.no || i + 1}`; }
export function surIle(p) { for (const ile of (S.pays.iles || [])) { if (pointInPoly(p, ile.forme)) return ile.id; } return null; }
export function analyseLigne(a, b) {
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
  return { kmTotal: L * S.kmParUnite, traverseMer: eau > 0, eauMaxKm: eauMax, eauKm: Math.min(L * S.kmParUnite, eau * pasKm),
           fracMont: mont / (n + 1), fracMarais: marais / (n + 1) };
}
export function capVol() { return (S.pays.reglages && S.pays.reglages.volMaxTraiteKm) || 300; }
/* Paramètres de nage fixés par le MJ (aucune valeur dans le lore pour l'instant) */
export function reglagesNage() { return S.voyage.nage || { vitesse: 0, apnee: 0, respire: false }; }

/* Calcule le meilleur trajet A→B pour un transport. Renvoie null si impossible.
   - Pied, cheval : par les routes (si deux lieux) ou en ligne directe, la meilleure des deux.
   - Calèche, bateaux : uniquement par les routes / lignes maritimes.
   - Vol : toujours en ligne droite — un oiseau ne suit pas les routes.
   - Nage : en ligne droite ; l'eau à la vitesse de nage, la terre à pied. */
export function calcSegment(A, B, t, opts) {
  let meilleur = null;
  if (A.type === "lieu" && B.type === "lieu" && t.id !== "vol" && t.id !== "nage") {
    const r = dijkstra(S.graphe, A.id, B.id, t, opts);
    if (r) meilleur = { ...r, mode: "routes" };
  }
  if (["pied", "cheval", "vol", "nage"].includes(t.id) && !(opts.routesSeules && t.id !== "vol" && meilleur)) {
    const a = posEtape(A), b = posEtape(B), an = analyseLigne(a, b);
    if (an.kmTotal <= 0.5) return meilleur;
    const base = vitesseGlobale(t, opts.modifs, opts.defsModifs);
    if (t.id === "nage") {
      const N = reglagesNage();
      if (!(N.vitesse > 0) || !an.traverseMer) return meilleur;
      if (!N.respire && an.eauMaxKm > (N.apnee || 0)) return meilleur;
      const vNage = vitesseGlobale({ kmJour: N.vitesse }, opts.modifs, opts.defsModifs);
      const vPied = vitesseGlobale({ kmJour: 25 }, opts.modifs, opts.defsModifs);
      const jours = an.eauKm / vNage + (an.kmTotal - an.eauKm) / vPied;
      return { jours, km: Math.round(an.kmTotal), noeuds: [], mode: "direct",
        edges: [{ type: "nage", km: Math.round(an.kmTotal), points: [a, b], direct: true }] };
    }
    let ok = true;
    if (t.id !== "vol" && an.traverseMer) ok = false;
    if (t.id === "vol" && an.eauMaxKm > capVol()) ok = false;
    if (ok) {
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
export function raisonSegment(t, A, B, modifs, defs) {
  const an = analyseLigne(posEtape(A), posEtape(B));
  if (t.id === "vol" && an.eauMaxKm > capVol())
    return `Trop loin pour voler d'une traite au-dessus de la mer (max ${capVol()} km) — prévoyez une halte.`;
  if (t.id === "nage") {
    const N = reglagesNage();
    if (!(N.vitesse > 0)) return "Vitesse de nage à définir (⚙ Modificateurs).";
    if (!an.traverseMer) return "Aucune étendue d'eau à traverser — allez-y à pied.";
    if (!N.respire && an.eauMaxKm > (N.apnee || 0))
      return `Impossible sans respirer sous l'eau — ${Math.round(an.eauMaxKm)} km d'eau d'un seul tenant (max ${N.apnee || 0} km).`;
  }
  if (A.type === "lieu" && B.type === "lieu" && t.id !== "vol" && t.id !== "nage") return raisonImpossible(t, A.id, B.id, modifs, defs);
  if (modifs.has("tempete") && (t.id === "navire" || t.id === "cotier")) return "Tempête — navigation impossible.";
  if ((t.id === "pied" || t.id === "cheval") && an.traverseMer) return "Impossible — la mer vous barre la route.";
  if (t.id === "caleche") return "Routes uniquement — la calèche ne quitte pas les routes tracées.";
  if (t.id === "cotier" || t.id === "navire") return "Les embarcations suivent les lignes portuaires — choisissez deux lieux reliés par la mer.";
  return "Impossible avec ce moyen de transport.";
}

/* Durée totale d'un trajet (liste d'étapes) avec un seul moyen de transport.
   Renvoie { ok, km, jours, repos, direct } ou { ok:false, raison }. Utilisé par l'interface et les tests. */
export function dureeTotale(etapes, t, opts, avecRepos = true) {
  let km = 0, jours = 0, direct = false;
  for (let i = 0; i < etapes.length - 1; i++) {
    const r = calcSegment(etapes[i], etapes[i + 1], t, opts);
    if (!r) return { ok: false, raison: raisonSegment(t, etapes[i], etapes[i + 1], opts.modifs, opts.defsModifs) };
    km += r.km; jours += arrondiVoyageur(t, r); if (r.mode === "direct") direct = true;
  }
  const repos = avecRepos && MOYENS_AVEC_REPOS.has(t.id) ? joursRepos(jours) : 0;
  return { ok: true, km, jours: jours + repos, repos, direct };
}
