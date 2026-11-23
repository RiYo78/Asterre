/* ASTERRE — panneaux.js · Panneau latéral : fiches de lieu, lieu notable, personnage, famille. */
import { zoomVers } from "./carte/vue.js?v=16";
import { S } from "./etat.js?v=16";
import { ouvrirGroupe, renderLignees } from "./lignees.js?v=16";
import { imagesDe } from "./seance.js?v=16";
import { montrerVue } from "./ui.js?v=16";
import { $, esc, imgHTML } from "./utils.js?v=16";
import { blocMJ, cocheMJ, detailsHTML, estRevele, secretsHTML, visib } from "./visibilite.js?v=16";

/* ─────────────── Fiches de lieux (panneau) ─────────────── */
export const NOMS_TYPES = { continent: "Continent", forteresse: "Forteresse", temple: "Lieu de prière", pouvoir: "Siège du pouvoir", residence: "Résidence", banque: "Banque", forge: "Forge", bibliotheque: "Bibliothèque", capitale: "Capitale", ville: "Ville", "ville-detruite": "Ville détruite", village: "Village", academie: "Académie", "lieu-dit": "Lieu-dit", danger: "Zone mortelle", "lieu-saint": "Lieu saint", prison: "Prison", palais: "Palais", port: "Port", caserne: "Caserne", auberge: "Auberge", taverne: "Taverne", commerce: "Commerce", illegal: "Activité illégale", mystere: "Mystère" };

export function ouvrirLieu(id) {
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
export function ouvrirSousLieu(sid) {
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
export function ouvrirPnj(id, retourVers) {
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
  const toutes = imagesDe(pn);
  if (toutes.length > 1) {
    const items = toutes.slice(1).map((src, k) => {
      const i = k + 1, v = visib(`img-${pn.id}-${i}`, true);
      if (!v && !S.mj) return "";
      return `<div class="${v ? "" : "pt-cache"}" data-bloc="img-${pn.id}-${i}">${imgHTML(src, pn.nom)}${cocheMJ(`img-${pn.id}-${i}`, true, "Image visible")}</div>`;
    }).join("");
    if (items) html += `<h3>Galerie</h3>` + items;
  }
  if (pn.affiliations && pn.affiliations.length) {
    const vis = pn.affiliations.filter(af => !af.mj || S.mj || estRevele("grp-" + af.gid));
    if (vis.length) html += `<h3>Affiliations</h3><div class="chips">` +
      vis.map(af => `<span class="chip chip-grp" data-grp="${esc(af.gid)}">${af.mj ? "🔒 " : ""}${esc(af.groupe)}${af.rang ? ` — <i>${esc(af.rang)}</i>` : ""}</span>`).join("") + `</div>`;
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
  p.querySelectorAll("[data-grp]").forEach(c => c.addEventListener("click", () => { montrerVue("lignees"); S.lignees.mode = "groupes"; renderLignees(); ouvrirGroupe(c.dataset.grp); }));
}
export function ouvrirFamille(fid, retourVers) {
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
export function brancherChips(p, retourVers) {
  p.querySelectorAll("[data-pnj]").forEach(c => c.addEventListener("click", () => ouvrirPnj(c.dataset.pnj, retourVers)));
  p.querySelectorAll("[data-fam]").forEach(c => c.addEventListener("click", () => ouvrirFamille(c.dataset.fam, retourVers)));
}
export function fermerPanneau() { $("#panneau").classList.remove("ouvert"); }
export function pnj(id) { return S.pays.codex.personnages.find(p => p.id === id); }
export function famille(id) { return S.pays.familles.find(f => f.id === id); }
