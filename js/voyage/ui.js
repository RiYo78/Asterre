/* ASTERRE — voyage/ui.js · Interface du calcul de voyage : étapes, tableau des résultats, trajet mixte, avertissements, tracé. */
import { catmullPath } from "../carte/geometrie.js?v=14";
import { zoomVers } from "../carte/vue.js?v=14";
import { S } from "../etat.js?v=14";
import { fermerPanneau, ouvrirLieu } from "../panneaux.js?v=14";
import { $, el, esc, toast } from "../utils.js?v=14";
import { arrondiVoyageur, calcSegment, capVol, fmtJours, nomEtape, raisonSegment } from "./moteur.js?v=14";

/* ── Interface voyage ── */
export function toggleVoyage(on) {
  S.voyage.actif = on == null ? !S.voyage.actif : on;
  $("#btn-voyage").classList.toggle("actif", S.voyage.actif);
  $("#carte").classList.toggle("voyage", S.voyage.actif);
  $("#voyage-box").classList.toggle("ouvert", S.voyage.actif);
  if (S.voyage.actif) { fermerPanneau(); majVoyage(); }
  else viderTrajet();
}
export function clicLieu(id) {
  if (S.voyage.actif) ajouterEtape({ type: "lieu", id });
  else { ouvrirLieu(id); zoomVers(S.lieux[id].pos, 620); }
}
export function clicLibre(pos) {
  if (!S.voyage.actif) return;
  S._noLibre = (S._noLibre || 0) + 1;
  ajouterEtape({ type: "libre", pos: [Math.round(pos[0]), Math.round(pos[1])], no: S._noLibre });
}
export function ajouterEtape(et) {
  const list = S.voyage.etapes, dern = list[list.length - 1];
  if (dern && dern.type === "lieu" && et.type === "lieu" && dern.id === et.id)
    return toast("Ce lieu est déjà la dernière étape.");
  list.push(et); S.voyage.choix = {};
  majVoyage();
}
export function retirerEtape(i) { S.voyage.etapes.splice(i, 1); S.voyage.choix = {}; majVoyage(); }
export function majVoyage() {
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
export function htmlResultats() {
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
export function htmlAvertissements() {
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
export function edgesDuTrajet() {
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
export function marquerEtapes() {
  document.querySelectorAll(".marqueur").forEach(m => m.classList.remove("depart", "arrivee", "etape-i"));
  const et = S.voyage.etapes;
  et.forEach((e, i) => {
    if (e.type !== "lieu") return;
    const m = document.querySelector(`.marqueur[data-id="${e.id}"]`);
    if (m) m.classList.add(i === 0 ? "depart" : (i === et.length - 1 ? "arrivee" : "etape-i"));
  });
}
export function viderTrajet() { $("#g-trajet").innerHTML = ""; document.querySelectorAll(".marqueur").forEach(m => m.classList.remove("depart", "arrivee", "etape-i")); }
export function dessinerTrajet() {
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
