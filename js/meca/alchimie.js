/* ASTERRE — meca/alchimie.js · Onglet Mécaniques : fiche Alchimie (table des jets, sigils, rites, simulateur). */
import { S } from "../etat.js?v=16";
import { $, esc } from "../utils.js?v=16";

/* ═══════════════ MÉCANIQUES ═══════════════ */
export const CAT_SIGIL = { Cosmique: "#7d5fbf", "Élément": "#d9601f", "État": "#3f7bbf", "Matériau": "#806040", Race: "#3f9d5f" };
export function getJet(A, niveauNom, nbSigils) {
  const row = A.jetTable[niveauNom]; if (!row) return null;
  if (nbSigils <= 0) return row[0];
  if (nbSigils > 6) { const base = row[5]; if (base === null) return null; return Math.max(5, base - (nbSigils - 6) * 10); }
  return row[nbSigils - 1];
}
export function renderMeca() {
  const c = $("#meca-contenu"), fiches = [["alchimie", "⚗️ Alchimie"]];
  let html = `<div class="meca-choix">` + fiches.map(([id, l]) =>
    `<button class="meca-fiche ${S.meca.fiche === id ? "actif" : ""}" data-fiche="${id}">${l}</button>`).join("") +
    `<span class="fell" style="font-size:12.5px;margin-left:8px">D'autres fiches (Herboristerie, Magie du Sang…) s'ajouteront ici.</span></div>`;
  html += `<div id="meca-corps"></div>`;
  c.innerHTML = html;
  c.querySelectorAll("[data-fiche]").forEach(b => b.addEventListener("click", () => { S.meca.fiche = b.dataset.fiche; S.meca.tab = "bases"; renderMeca(); }));
  if (S.meca.fiche === "alchimie") renderAlchimie();
}
export function renderAlchimie() {
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
export function contenuAlch(A, tab, s) {
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
export function calcAlch(A, s) {
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
export function brancherAlch(A, s) {
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
