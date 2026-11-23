/* ASTERRE — codex.js · Onglet Codex : chapitres (géographie, lois, religions, chronologie, personnages, races, bestiaire…). */
import { chargerPays } from "./donnees.js?v=16";
import { S } from "./etat.js?v=16";
import { ouvrirGroupe, renderLignees } from "./lignees.js?v=16";
import { famille, ouvrirPnj, pnj } from "./panneaux.js?v=16";
import { montrerVue } from "./ui.js?v=16";
import { $, esc } from "./utils.js?v=16";
import { blocMJ, cocheMJ, detailsHTML, secretsHTML, visib } from "./visibilite.js?v=16";

/* ─────────────── Codex ─────────────── */
export const CHAPITRES = [
  ["geographie", "🌍 Géographie"], ["lois", "📜 Lois & Interdits"], ["religions", "⛪ Religions"], ["familles", "🛡 Familles & Blasons"],
  ["economie", "💰 Économie"], ["politique", "👑 Politique"], ["armees", "⚔ Armées"],
  ["chronologie", "📅 Chronologie"], ["personnages", "👤 Personnages"], ["races", "🧬 Races"], ["bestiaire", "🩸 Bestiaire"]
];
export function construireCodex() {
  const nav = $("#codex-nav");
  nav.innerHTML = CHAPITRES.map(([id, nom], i) => `<a data-ch="${id}" class="${id === "lois" ? "actif" : ""}" tabindex="0">${nom}</a>`).join("");
  nav.querySelectorAll("a").forEach(a => {
    const go = () => { nav.querySelectorAll("a").forEach(x => x.classList.remove("actif")); a.classList.add("actif"); renderChapitre(a.dataset.ch); };
    a.addEventListener("click", go);
    a.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
  renderChapitre("lois");
}
export function articleHTML(sec, prefix) {
  const contenu = `<h4>${esc(sec.titre)}</h4><p>${esc(sec.contenu)}</p>${secretsHTML(sec.secrets)}`;
  return `<div class="article">${prefix ? blocMJ(prefix, true, contenu, "Section visible pour les joueurs") : contenu}</div>`;
}
export function renderChapitre(ch) {
  const c = $("#codex-contenu"), cx = S.pays.codex;
  let html = "";
  const CHAP_NAT = { lois: "Lois & Interdits", religions: "Religions", politique: "Politique", economie: "Économie", armees: "Armées", familles: "Familles & Blasons" };
  if (CHAP_NAT[ch]) {
    const pays = cx.pays_codex || [];
    const pid = S._paysCodex && pays.find(p => p.id === S._paysCodex) ? S._paysCodex : (pays[0] ? pays[0].id : null);
    S._paysCodex = pid;
    const boutonsPays = pays.length ? `<div class="pays-onglets">` + pays.map(p =>
      `<button class="pays-onglet ${p.id === pid ? "actif" : ""}" data-pays="${p.id}">
        <img src="${esc(ch === "familles" ? p.blasonRoyaume : p.embleme)}" alt="" onerror="this.style.display='none'"><span>${esc(p.nom)}</span></button>`).join("") + `</div>` : "";
    html = `<h2>${esc(CHAP_NAT[ch])}</h2><div class="filet"></div>${boutonsPays}<div id="chap-pays">${rendreChapPays(ch, pid)}</div>`;
  } else if (ch === "geographie") {
    const G = cx.geographie || { intro: "", territoires: [], eglises: [] };
    html = `<h2>Géographie d'Asterre</h2><div class="filet"></div>
      <p class="chap-intro">${esc(G.intro)}</p>
      <div class="grille-terr">` + G.territoires.map((t, i) => {
        const dispo = t.pays && S.paysData && S.paysData[t.pays];
        return blocMJ(`geo-${i}`, true, `<div class="carte-terr ${dispo ? "terr-dispo" : ""}" ${dispo ? `data-allerpays="${esc(t.pays)}"` : ""}>
          <div class="terr-t"><span class="terr-ico">${t.icone || "🗺"}</span><div><b>${esc(t.nom)}</b><small>${esc(t.ou)}</small></div></div>
          ${t.note ? `<p>${esc(t.note)}</p>` : ""}${dispo ? `<span class="terr-lien">Voir la carte →</span>` : ""}
        </div>`, "Territoire visible");
      }).join("") + `</div>
      <h4 class="chap-h4">Les Églises d'Asterre</h4>
      <p class="fell" style="max-width:760px;margin-bottom:8px">Aucune hiérarchie entre elles : chacune est totalement indépendante.</p>
      <table class="meta-large"><tr><td class="td-cle">Église</td><td>Divinité principale</td><td>Territoire</td></tr>` +
      G.eglises.map(e => `<tr><td class="td-cle">${esc(e[0])}</td><td>${esc(e[1])}</td><td>${esc(e[2])}</td></tr>`).join("") + `</table>` +
      secretsHTML((G.secrets || []).map(x => ({ ...x, revele: false })));
  } else if (ch === "chronologie") {
    const paysList = cx.pays_codex || [];
    const fPays = S._filtreChronoPays || "";
    const tousLieux = {}; for (const pd of Object.values(S.paysData || { x: S.pays })) for (const l of pd.lieux) tousLieux[l.id] = l;
    const lieuxCites = [...new Set(cx.chronologie.flatMap(e => e.lieux))].filter(id => tousLieux[id]);
    const filtreV = S._filtreChrono || "";
    html = `<h2>Chronologie</h2><div class="filet"></div>
      <div class="chrono-filtres">
        ${paysList.length > 1 ? `<select class="filtre" id="filtre-pays"><option value="">Tout Asterre</option>${paysList.map(p => `<option value="${p.id}" ${fPays === p.id ? "selected" : ""}>${esc(p.nom)}</option>`).join("")}</select>` : ""}
        <select class="filtre" id="filtre-chrono" aria-label="Filtrer par ville"><option value="">Toutes les villes</option>${lieuxCites.map(id => `<option value="${id}" ${filtreV === id ? "selected" : ""}>${esc(tousLieux[id].nom)}</option>`).join("")}</select>
      </div>
      <ul class="chrono">` +
      // id stable (chr-…) fourni par la synchro Notion ; visible par défaut sauf si l'événement est « MJ » dans Notion
      cx.chronologie.map((e, i) => ({ e, k: e.id || `chr-${i}`, def: !e.mj }))
        .filter(x => (!fPays || x.e.pays === fPays) && (!filtreV || x.e.lieux.includes(filtreV)) && (S.mj || visib(x.k, x.def)))
        .map(({ e, k, def }) => `
        <li class="${visib(k, def) ? "" : "pt-cache"}" data-bloc="${esc(k)}"><span class="date">${esc(e.date)}</span>${e.epoque ? ` <small class="epoque">· époque ${esc(e.epoque)}</small>` : ""}<br>${esc(e.evenement)}
        ${e.lieux.length ? `<div class="liens-lieux">📍 ${e.lieux.filter(id => tousLieux[id]).map(id => esc(tousLieux[id].nom)).join(" · ")}</div>` : ""}${cocheMJ(k, def, "Visible")}</li>`).join("") + `</ul>`;
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
    const sous = S._sousBest || "sang";
    const toutes = (cx.bestiaire || []).filter(b => S.mj || visib("bete-" + b.id, !b.mjOnly));
    const estSang = b => (b.origine || "").toLowerCase().includes("sang") || (b.categorie || "").toLowerCase().includes("sang") || (b.origine || "").toLowerCase().includes("magie du sang");
    const groupe = sous === "sang" ? toutes.filter(estSang) : toutes.filter(b => !estSang(b));
    html = `<h2>Bestiaire</h2><div class="filet"></div>
      <div class="best-sous"><button class="${sous === "sang" ? "actif" : ""}" data-best="sang">🩸 Bestiaire de Sang</button><button class="${sous === "autres" ? "actif" : ""}" data-best="autres">🐾 Autres créatures</button></div>
      <p class="fell" style="max-width:720px;margin:6px 0 18px">${sous === "sang" ? "Ce que la Magie du Sang laisse derrière elle. Nées du rituel, de la souillure ou de la Lune de Sang." : "Les bêtes et monstres d'Asterre qui ne doivent rien au sang."}</p>` +
      (groupe.length ? "" : `<p class="fell">Aucune créature dans cette catégorie.</p>`) +
      `<div class="grille-betes">` + groupe.map(b => {
        const vB = visib("bete-" + b.id, !b.mjOnly);
        const dcl = (b.danger || "").split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
        return `<div class="carte-bete-v ${vB ? "" : "bete-mj"}">
          <div class="bete-bandeau bd-${dcl}"><span class="bete-nom">${vB ? "" : "🔒 "}${esc(b.nom)}</span><span class="badge-danger">${esc(b.danger)}</span></div>
          <div class="bete-corps">
            <small class="ligne-bete">${esc(b.categorie)} · ${esc(b.origine)}</small>
            ${blocMJ("desc-bete-" + b.id, true, `<p>${esc(b.description)}</p>`, "Description visible")}
            ${detailsHTML(b.details, "bet-" + b.id)}${cocheMJ("bete-" + b.id, !b.mjOnly, "Fiche visible pour les joueurs")}
          </div>
        </div>`;
      }).join("") + `</div>`;
  }
  c.innerHTML = html; c.scrollTop = 0;
  const f = c.querySelector("#filtre-chrono");
  if (f) f.addEventListener("change", () => { S._filtreChrono = f.value; renderChapitre("chronologie"); });
  const fp = c.querySelector("#filtre-pays");
  if (fp) fp.addEventListener("change", () => { S._filtreChronoPays = fp.value; renderChapitre("chronologie"); });
  c.querySelectorAll("[data-pays]").forEach(b => b.addEventListener("click", () => { S._paysCodex = b.dataset.pays; renderChapitre(ch); }));
  c.querySelectorAll("[data-allerpays]").forEach(b => b.addEventListener("click", () => chargerPays(b.dataset.allerpays)));
  c.querySelectorAll("[data-best]").forEach(b => b.addEventListener("click", () => { S._sousBest = b.dataset.best; renderChapitre("bestiaire"); }));
  c.querySelectorAll("[data-grp]").forEach(b => b.addEventListener("click", () => { montrerVue("lignees"); S.lignees.mode = "groupes"; renderLignees(); ouvrirGroupe(b.dataset.grp); }));
  c.querySelectorAll("[data-pnj]").forEach(k => {
    const go = () => ouvrirPnj(k.dataset.pnj);
    k.addEventListener("click", go);
    k.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
}
export function tableHTML(lignes) {
  return `<table class="meta-large">` + lignes.map(l => `<tr>${l.map((c, i) => `<td${i === 0 ? " class='td-cle'" : ""}>${esc(c)}</td>`).join("")}</tr>`).join("") + `</table>`;
}
export function rendreChapPays(ch, pid) {
  const cx = S.pays.codex;
  const D = (cx[ch] || {})[pid];
  if (ch === "familles") {
    const P = (S.paysData || {})[pid] || S.pays;
    if (!P.familles || !P.familles.length) return `<p class="fell">${esc((D && D.note) || "Les blasons de ce pays restent à dessiner.")}</p>`;
    return `<p class="fell" style="max-width:720px;margin-bottom:18px">Dix blasons. Un royaume, une Église, huit lignées. Les sept familles fondatrices furent choisies par Valène pour superviser les piliers de la société.</p>
      <div class="grille-familles">` + (P.blasonsInstitutions || []).map(b => carteBlason(b, true)).join("") + P.familles.map(f => carteBlason(f, false)).join("") + `</div>`;
  }
  if (!D) return `<p class="fell">Ce chapitre n'est pas encore renseigné pour ce pays.</p>`;

  if (ch === "lois") {
    let h = `<p class="chap-intro">${esc(D.intro)}</p>`;
    D.sections.forEach((s, i) => {
      let inner = `<h4>${esc(s.titre)}</h4>`;
      if (s.type === "table") inner += tableHTML(s.lignes);
      else inner += `<p>${esc(s.contenu)}</p>`;
      h += `<div class="chap-carte">${blocMJ(`lois-${pid}-${i}`, true, inner, "Section visible")}</div>`;
    });
    h += secretsHTML((D.secrets || []).map(x => ({ ...x, revele: false })));
    return h;
  }
  if (ch === "religions") {
    const e = D.eglise;
    let h = `<p class="chap-cite">« ${esc(D.cite)} »</p>
      <div class="eglise-tete">
        <img class="eglise-embleme" src="${esc(e.embleme)}" alt="" onerror="this.style.display='none'">
        <div><h3 class="chap-h3">${esc(e.nom)}</h3>
          <div class="cs-meta"><span><b>Divinité</b> ${esc(e.divinite)}</span><span><b>Siège</b> ${esc(e.siege)}</span></div></div>
      </div>
      <p class="chap-intro">${esc(e.intro)}</p>`;
    h += `<h4 class="chap-h4">Dogmes</h4>` + tableHTML(e.dogmes);
    // DIAGRAMME de hiérarchie
    h += `<h4 class="chap-h4">${esc(e.hierarchie.titre)}</h4><div class="diagramme">`;
    e.hierarchie.branches.forEach(br => {
      h += `<div class="diag-branche"><div class="diag-branche-nom">${esc(br.nom)}</div><div class="diag-noeuds">`;
      br.noeuds.forEach((n, i) => {
        h += `${i > 0 ? '<div class="diag-lien">↓</div>' : ''}<div class="diag-noeud${n.ref ? " diag-cliq" : ""}" ${n.ref ? `data-pnj="${esc(n.ref)}"` : ""}>
          <div class="diag-rang">${esc(n.rang)}</div>${n.qui ? `<div class="diag-qui">${esc(n.qui)}</div>` : ""}${n.note ? `<div class="diag-note">${esc(n.note)}</div>` : ""}</div>`;
      });
      h += `</div></div>`;
    });
    h += `</div>`;
    h += `<div class="chap-carte">${blocMJ(`rel-evol-${pid}`, true, `<h4>Évolution récente (525)</h4><p>${esc(e.evolution)}</p>`, "Section visible")}</div>`;
    h += secretsHTML((e.secrets || []).map(x => ({ ...x, revele: false })));
    // autres églises
    h += `<h4 class="chap-h4">Les autres Églises élémentaires</h4><div class="grille-eglises">`;
    D.autres.forEach(a => { h += `<div class="carte-eglise"><span class="eg-icone">${a.icone}</span><b>${esc(a.nom)}</b><small>${esc(a.divinite)}</small><p>${esc(a.note)}</p></div>`; });
    h += `</div>`;
    // union blanche
    h += `<div class="chap-carte"><h4>${esc(D.union.titre)}</h4><p>${esc(D.union.intro)}</p>${tableHTML(D.union.hors)}</div>`;
    return h;
  }
  if (ch === "politique") {
    let h = `<p class="chap-intro">${esc(D.intro)}</p>`;
    h += `<h4 class="chap-h4">Le pouvoir partagé</h4>` + `<table class="meta-large"><tr><td class="td-cle">Pouvoir</td><td>Détenteur</td><td>Domaines</td></tr>` +
      D.pouvoirs.map(p => `<tr><td class="td-cle">${esc(p[0])}</td><td>${esc(p[1])}</td><td>${esc(p[2])}</td></tr>`).join("") + `</table>`;
    h += `<div class="chap-carte">${blocMJ(`pol-dyn-${pid}`, true, `<h4>${esc(D.dynastie.titre)}</h4><p>${esc(D.dynastie.texte)}</p>`, "Section visible")}</div>`;
    // Cercles (déplacé depuis la chrono)
    let cer = `<h4>${esc(D.cercles.titre)}</h4><p>${esc(D.cercles.texte)}</p>` + secretsHTML((D.cercles.secrets || []).map(x => ({ ...x, revele: false })));
    h += `<div class="chap-carte cercles">${cer}</div>`;
    // conflit 520-525
    const cf = D.conflit;
    h += `<h4 class="chap-h4">${esc(cf.titre)}</h4><div class="conflit">`;
    cf.camps.forEach(c => { h += `<div class="camp ${c[3] ? "camp-cliq" : ""}" ${c[3] ? `data-pnj="${esc(c[3])}"` : ""}><div class="camp-nom">${esc(c[0])}</div><div class="camp-chef">${esc(c[1])}</div><p>${esc(c[2])}</p></div>`; });
    h += `</div><div class="chap-carte menace">${esc(cf.menace)}</div>`;
    h += `<ul class="chrono mini-chrono">` + cf.evenements.map(e => `<li><span class="date">${esc(e[0])}</span><br>${esc(e[1])}</li>`).join("") + `</ul>`;
    return h;
  }
  if (ch === "economie") {
    let h = `<p class="chap-intro">${esc(D.intro)}</p>`;
    h += tableHTML(D.piliers);
    h += `<div class="chap-carte">${blocMJ(`eco-guilde-${pid}`, true, `<h4>${esc(D.guilde.titre)}</h4><p>${esc(D.guilde.texte)}</p>`, "Section visible")}</div>`;
    h += `<h4 class="chap-h4">Monnaie</h4><div class="monnaie">` + D.monnaie.map(m => {
      const cls = m[0].includes("or") ? "or" : m[0].includes("argent") ? "argent" : "bronze";
      return `<div class="piece-eco piece-${cls}"><div class="piece-rond"></div><b>${esc(m[0])}</b><small>${esc(m[1])}</small></div>`;
    }).join("") + `</div>`;
    return h;
  }
  if (ch === "armees") {
    let h = `<p class="chap-intro">${esc(D.intro)}</p><div class="grille-corps">`;
    D.corps.forEach((co, i) => {
      h += `<div class="carte-corps"><div class="corps-tete"><span class="corps-ico">${co.icone}</span><div><b>${esc(co.nom)}</b><small>${esc(co.sous)}</small></div></div>
        <p>${esc(co.texte)}</p>${co.chefs.length ? tableHTML(co.chefs) : ""}</div>`;
    });
    h += `</div><div class="chap-carte note-armee">${esc(D.note)}</div>`;
    return h;
  }
  return "";
}
export function carteBlason(f, institution) {
  return `<div class="carte-famille">
    <div class="blason"><img src="${esc(f.blason)}" alt="Blason ${esc(f.nom)}"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Blason à déposer : ${esc(f.blason)}'}))"></div>
    <div><h4>${esc(f.nom)}${f.pilier ? ` <small style="font-weight:400;font-size:12px;color:var(--encre-2)">· ${esc(f.pilier)}</small>` : ""}</h4>
    <div class="devise">« ${esc(f.devise)} »</div>
    <small><b>${esc(f.couleurs)}</b> — ${esc(f.symbole)}${f.demeure ? `<br>Demeure : ${esc(f.demeure)}` : ""}</small>
    ${f.description ? `<p>${esc(f.description)}</p>` : ""}
    ${f.membres ? `<small><b>Membres :</b> ${esc(f.membres)}</small>` : ""}</div></div>`;
}
