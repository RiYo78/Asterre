/* ASTERRE — seance.js · Table de Séance : scène partageable, cartes personnage, dés. */
import { S } from "./etat.js?v=15";
import { majPistesUI } from "./musique.js?v=15";
import { NOMS_TYPES, ouvrirLieu, ouvrirPnj, pnj } from "./panneaux.js?v=15";
import { montrerVue } from "./ui.js?v=15";
import { $, esc, imgHTML, toast } from "./utils.js?v=15";
import { visib } from "./visibilite.js?v=15";

/* ── Table de Séance ── */
export function chargerSeanceHash() {
  const h = location.hash.match(/pj=([^&]*)/), l = location.hash.match(/lieu=([^&]*)/);
  if (h) S.seance.pnj = decodeURIComponent(h[1]).split(",").filter(id => pnj(id)).slice(0, 6);
  if (l) { const id = decodeURIComponent(l[1]); if (S.lieux[id]) S.seance.lieu = id; }
  if (h || l) montrerVue("seance");
}
export function majHashSeance() {
  const parts = [];
  if (S.seance.pnj.length) parts.push("pj=" + S.seance.pnj.join(","));
  if (S.seance.lieu) parts.push("lieu=" + S.seance.lieu);
  history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname + location.search);
}
/* ── Dés ── */
export function tirage(faces) {
  const u = new Uint32Array(1); crypto.getRandomValues(u);
  return 1 + (u[0] % faces);
}
export function lancerDes(n, faces, mod) {
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
export function majDesUI() {
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
export function imagesDe(pn) {
  const base = [pn.portrait || `images/pnj/${pn.id}.jpg`, ...(pn.galerie || [])];
  return base.filter((v, i) => base.indexOf(v) === i);
}
export function carteSeance(id) {
  const pn = pnj(id); if (!pn) return "";
  const vFiche = visib("pnj-" + pn.id, !pn.mjOnly);
  if (!vFiche && !S.mj) return `<div class="carte-seance"><div class="cs-infos"><h4>❔ Personnage inconnu</h4><p class="fell">Les joueurs ne connaissent pas encore cette personne.</p></div></div>`;
  const vDesc = visib("desc-pnj-" + pn.id, true);
  const meta = [["Origine", pn.origine], ["Race", pn.race], ["Statut", pn.statut]].filter(x => x[1]);
  const dets = (pn.details || []).map((d, i) => ({ d: typeof d === "string" ? { texte: d } : d, i }))
    .filter(x => S.mj || visib(`det-${pn.id}-${x.i}`, !x.d.mj));
  const imgs = imagesDe(pn).filter((src, i) => S.mj || visib(`img-${pn.id}-${i}`, true));
  const imgSel = S.seance.images[pn.id] && imgs.includes(S.seance.images[pn.id]) ? S.seance.images[pn.id] : imgs[0];
  return `<div class="carte-seance ${vFiche ? "" : "bete-mj"}">
    <button class="cs-retirer" data-ret="${esc(pn.id)}" title="Retirer" aria-label="Retirer ${esc(pn.nom)}">✕</button>
    <div class="cs-portrait-zone">
      <div class="cs-portrait"><img src="${esc(imgSel)}" alt="" loading="lazy"
        onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Portrait à venir',className:'cs-vide'}))"></div>
      ${imgs.length > 1 ? `<div class="cs-vignettes">${imgs.map((src, i) => `<button class="cs-vig ${src === imgSel ? "actif" : ""}" data-img="${esc(pn.id)}|${i}" title="Image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </div>
    <div class="cs-infos">
      <h4>${vFiche ? "" : "🔒 "}${esc(pn.nom)}</h4>
      <small class="fell">${esc(pn.titre || "")}</small>
      ${meta.length ? `<div class="cs-meta">${meta.map(m => `<span><b>${m[0]}</b> ${esc(m[1])}</span>`).join("")}</div>` : ""}
      ${(vDesc || S.mj) ? `<p class="${vDesc ? "" : "pt-cache"}">${esc(pn.description)}</p>` : ""}
      ${dets.length ? `<ul class="tensions">${dets.map(x => `<li class="${(S.masques.has(`det-${pn.id}-${x.i}`) ? false : (S.reveals.has(`det-${pn.id}-${x.i}`) ? true : !x.d.mj)) ? "" : "pt-cache"}">${esc(x.d.texte)}</li>`).join("")}</ul>` : ""}
      <button class="chip" data-fiche="${esc(pn.id)}">Fiche complète →</button>
    </div></div>`;
}
export function renderSeance() {
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
    const l = (S.pays.lieux || []).find(x => x.nom.toLowerCase() === v) || (S.pays.lieux || []).find(x => x.nom.toLowerCase().includes(v));
    if (!l) return toast("Lieu introuvable.");
    S.seance.lieu = l.id; majHashSeance(); renderSeance();
  });
  c.querySelector("#copier-scene").addEventListener("click", () => {
    majHashSeance();
    (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(
      () => toast("Lien de la scène copié — envoyez-le à vos joueurs."),
      () => prompt("Copiez ce lien :", location.href));
  });
  c.querySelector("#vider-scene").addEventListener("click", () => { S.seance = { pnj: [], lieu: null, images: {} }; majHashSeance(); renderSeance(); });
  c.querySelectorAll("[data-ret]").forEach(b => b.addEventListener("click", () => {
    S.seance.pnj = S.seance.pnj.filter(x => x !== b.dataset.ret); majHashSeance(); renderSeance();
  }));
  c.querySelectorAll("[data-fiche]").forEach(b => b.addEventListener("click", () => ouvrirPnj(b.dataset.fiche)));
  c.querySelectorAll("[data-img]").forEach(b => b.addEventListener("click", () => {
    const [pid, i] = b.dataset.img.split("|"); const pn2 = pnj(pid);
    S.seance.images[pid] = imagesDe(pn2)[+i]; renderSeance();
  }));
  c.querySelectorAll("[data-lieu-s]").forEach(b => b.addEventListener("click", () => ouvrirLieu(b.dataset["lieuS"])));
  c.querySelectorAll(".de-boutons [data-de]").forEach(b => b.addEventListener("click", () => {
    lancerDes(+c.querySelector("#de-nb").value, +b.dataset.de, +c.querySelector("#de-mod").value);
  }));
  majDesUI(); majPistesUI();
}
