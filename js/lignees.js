/* ASTERRE — lignees.js · Onglet Lignées : arbres généalogiques et groupes (trombinoscopes). */
import { S } from "./etat.js?v=14";
import { fermerPanneau, ouvrirPnj, pnj } from "./panneaux.js?v=14";
import { imagesDe } from "./seance.js?v=14";
import { $, esc } from "./utils.js?v=14";
import { cocheMJ, detailsHTML, estRevele, visib } from "./visibilite.js?v=14";

/* ═══════════════ LIGNÉES & GROUPES ═══════════════ */
export function renderLignees() {
  const c = $("#lignees-contenu"), L = S.lignees, cx = S.pays.codex;
  let html = `<h2>Lignées & Groupes</h2><div class="filet"></div>
    <div class="lig-switch">
      <button class="${L.mode === "arbres" ? "actif" : ""}" data-mode="arbres">🌳 Arbres généalogiques</button>
      <button class="${L.mode === "groupes" ? "actif" : ""}" data-mode="groupes">⚔ Groupes & Organisations</button>
    </div>`;
  if (L.mode === "arbres") {
    html += (cx.lignees || []).map(a => `
      <div class="lig-arbre">
        <h3 class="titre-region">${a.icone || ""} ${esc(a.nom)}</h3>
        <p class="fell" style="max-width:680px;margin-bottom:10px">${esc(a.resume)}</p>
        <div class="arbre">${noeudArbre(a.racine, 0)}</div>
      </div>`).join("");
  } else {
    const groupes = (cx.groupes || []).filter(g => !g.mj || S.mj || estRevele("grp-" + g.id));
    html += `<div class="grille-groupes">` + groupes.map(g => `
      <div class="carte-groupe ${g.mj ? "grp-mj" : ""}" data-grp="${g.id}">
        <div class="grp-icone">${g.icone || "⚑"}</div>
        <div><b>${g.mj ? "🔒 " : ""}${esc(g.nom)}</b><small>${esc(g.type)} · ${g.membres.length} membres</small></div>
      </div>`).join("") + `</div>`;
  }
  c.innerHTML = html;
  c.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { L.mode = b.dataset.mode; renderLignees(); }));
  c.querySelectorAll(".arbre [data-ref]").forEach(n => n.addEventListener("click", () => ouvrirPnj(n.dataset.ref)));
  c.querySelectorAll("[data-grp]").forEach(b => b.addEventListener("click", () => ouvrirGroupe(b.dataset.grp)));
}
export function noeudArbre(n, prof) {
  if (!n) return "";
  const P = n.ref ? pnj(n.ref) : null;
  const visP = P ? visib("pnj-" + P.id, !P.mjOnly) : true;
  if (P && !visP && !S.mj) return "";
  const cliq = P ? ` arbre-cliq" data-ref="${esc(n.ref)}` : "";
  const vign = P ? `<span class="arbre-photo"><img src="${esc(imagesDe(P)[0])}" alt="" loading="lazy" onerror="this.style.display='none'"></span>` : "";
  const enfants = (n.enfants || []).map(e => noeudArbre(e, prof + 1)).join("");
  return `<div class="arbre-branche">
    <div class="arbre-noeud${cliq} ${P && !visP ? "pt-cache" : ""}">${vign}<span class="arbre-txt"><b>${P && !visP ? "🔒 " : ""}${esc(n.nom)}</b>${n.note ? `<small>${esc(n.note)}</small>` : ""}</span></div>
    ${enfants ? `<div class="arbre-enfants">${enfants}</div>` : ""}
  </div>`;
}
export function ouvrirGroupe(gid) {
  const g = (S.pays.codex.groupes || []).find(x => x.id === gid); if (!g) return;
  const p = $("#panneau");
  const membres = g.membres.filter(m => !m.mj || S.mj || (m.ref && estRevele("pnj-" + m.ref)));
  let html = `<button class="fermer">✕</button>
    <span class="badge-type ${g.mj ? "danger" : ""}">${esc(g.type)}</span>
    <h2>${g.icone || ""} ${esc(g.nom)}</h2>
    <p>${esc(g.resume)}</p>
    ${g.mj && S.mj ? `<div class="secret"><span class="sceau-secret">🔒 Groupe caché aux joueurs</span>${cocheMJ("grp-" + g.id, false, "Groupe visible pour les joueurs")}</div>` : ""}
    <h3>Membres & rangs</h3>
    <div class="trombino">${membres.map(m => {
      const P = m.ref ? pnj(m.ref) : null;
      const vis = P ? visib("pnj-" + P.id, !P.mjOnly) : true;
      const img = P && vis ? `<img src="${esc(imagesDe(P)[0])}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'—',className:'tromb-vide'}))">` : `<span class="tromb-vide">${vis ? "—" : "🔒"}</span>`;
      return `<div class="tromb ${P ? "tromb-cliq" : ""} ${vis ? "" : "pt-cache"}" ${P ? `data-ref="${esc(m.ref)}"` : ""}>
        <div class="tromb-img">${img}</div>
        <b>${vis ? "" : "🔒 "}${esc(m.nom)}</b><small>${esc(m.rang || "")}</small></div>`;
    }).join("")}</div>`;
  if (g.details && g.details.length) html += `<h3>À savoir</h3>` + detailsHTML(g.details, "grp-det-" + g.id);
  p.innerHTML = html; p.classList.add("ouvert"); p.scrollTop = 0;
  p.querySelector(".fermer").addEventListener("click", fermerPanneau);
  p.querySelectorAll("[data-ref]").forEach(n => n.addEventListener("click", () => ouvrirPnj(n.dataset.ref)));
}
