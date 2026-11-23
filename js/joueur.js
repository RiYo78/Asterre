/* ASTERRE — joueur.js · Espace Joueur : fiche, inventaire, quêtes, entraînement, journal, export/import. */
import { S } from "./etat.js?v=16";
import { pnj } from "./panneaux.js?v=16";
import { $, esc, toast } from "./utils.js?v=16";
import { visib } from "./visibilite.js?v=16";

export const STATS_DEF = [
  { id: "vitalite", nom: "Vitalité", max: 100, color: "#7e2a2a" },
  { id: "mana", nom: "Mana", max: 100, color: "#396a75" },
  { id: "combat", nom: "Combat", max: 100, color: "#b8892c" },
  { id: "defense", nom: "Défense", max: 100, color: "#5f7d49" },
  { id: "agilite", nom: "Agilité", max: 100, color: "#58929c" },
  { id: "esprit", nom: "Esprit", max: 100, color: "#8a5aa0" }
];
export function ficheJ(pid) {
  if (!S.fichesJoueur[pid]) {
    S.fichesJoueur[pid] = { stats: {}, ame: null, bourse: { or: 0, argent: 0, bronze: 0 },
      inventaire: [], quetes: [], competences: [], etats: [], journal: [], niveau: 1, xp: 0 };
  }
  return S.fichesJoueur[pid];
}
export function chargeFiches() { try { S.fichesJoueur = JSON.parse(localStorage.getItem("asterre-fiches") || "{}"); } catch (e) { S.fichesJoueur = {}; } }
export function sauveFiches() { try { localStorage.setItem("asterre-fiches", JSON.stringify(S.fichesJoueur)); } catch (e) {} }
/* ═══════════════ PARTIE JOUEUR ═══════════════ */
export function renderJoueur() {
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
export function renderSousJoueur() {
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
export function exporterFiche(pid) {
  const paquet = { perso: pid, fiche: ficheJ(pid) };
  const txt = "ASTERRE-FICHE::" + btoa(unescape(encodeURIComponent(JSON.stringify(paquet))));
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
    () => toast("Fiche copiée — envoyez-la à votre MJ."), () => prompt("Copiez votre fiche :", txt));
}
export function importerFiche(pid) {
  const v = prompt("Collez une fiche exportée (ASTERRE-FICHE::…) :");
  if (!v) return;
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(v.replace("ASTERRE-FICHE::", "").trim()))));
    S.fichesJoueur[p.perso] = p.fiche; sauveFiches();
    S.joueur.perso = p.perso; renderJoueur(); toast("Fiche importée.");
  } catch (e) { toast("Fiche illisible."); }
}
