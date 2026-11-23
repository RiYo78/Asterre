import * as carte_geometrie from "./carte/geometrie.js?v=14";
import * as carte_rendu from "./carte/rendu.js?v=14";
import { renderCarte, renderLegende } from "./carte/rendu.js?v=14";
import * as carte_vue from "./carte/vue.js?v=14";
import * as codex from "./codex.js?v=14";
import { construireCodex } from "./codex.js?v=14";
import * as donnees from "./donnees.js?v=14";
import { VERSION, assembler, deverrouillerMJ, initPays, remplirChoixPays } from "./donnees.js?v=14";
import * as etat from "./etat.js?v=14";
import { IS_BROWSER, S } from "./etat.js?v=14";
import * as joueur from "./joueur.js?v=14";
import { chargeFiches } from "./joueur.js?v=14";
import * as lignees from "./lignees.js?v=14";
import * as meca_alchimie from "./meca/alchimie.js?v=14";
import * as musique from "./musique.js?v=14";
import { initMusique } from "./musique.js?v=14";
import * as panneaux from "./panneaux.js?v=14";
import * as seance from "./seance.js?v=14";
import { chargerSeanceHash } from "./seance.js?v=14";
import * as ui from "./ui.js?v=14";
import { brancherUI, remplirRecherche } from "./ui.js?v=14";
import * as utils from "./utils.js?v=14";
import { $, esc } from "./utils.js?v=14";
import * as visibilite from "./visibilite.js?v=14";
import { chargeReveals, majBoutonMJ } from "./visibilite.js?v=14";
import * as voyage_moteur from "./voyage/moteur.js?v=14";
import * as voyage_ui from "./voyage/ui.js?v=14";

/* ══════════════════════════════════════════════════════════
   ASTERRE — Carte Interactive du Monde
   Données : data/monde.json + un fichier par pays.
   La carte est stylisée ; les durées de voyage se calculent
   sur les distances canoniques du graphe des routes.
   ══════════════════════════════════════════════════════════ */

async function boot() {
  try {
    S.monde = await (await fetch("data/monde.json?v=" + VERSION)).json();
    const actifs = S.monde.pays.filter(p => p.actif && p.fichier);
    await Promise.all(actifs.map(async p => {
      try {
        const rep = await fetch(p.fichier + "?v=" + VERSION);
        if (!rep.ok) throw new Error(rep.status + " " + p.fichier);
        S.brut[p.id] = await rep.json();
      } catch (err) { console.warn("Pays ignoré :", p.id, err); }
    }));
    assembler();
    let choix = localStorage.getItem("asterre-pays");
    if (!choix || !S.paysData[choix]) choix = S.paysData["asterre"] ? "asterre" : Object.keys(S.paysData)[0];
    S.paysActifId = choix; S.pays = S.paysData[choix];
  } catch (e) {
    console.error("Boot Asterre :", e);
    $("#chargement").innerHTML = "Impossible de lire les données.<br><small style='font-size:14px'>Détail : " + esc(String(e && e.message || e)) + "<br>Essayez un rechargement forcé (Ctrl+F5).</small>";
    return;
  }
  initPays();
  chargeReveals();
  chargeFiches();
  const vb = S.monde.vueMonde.viewBox;
  S.vb = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  S.vb0 = { ...S.vb };
  $("#titre-monde").textContent = S.monde.monde.toUpperCase();
  try { S.mecaData.alchimie = await (await fetch("data/alchimie.json?v=" + VERSION)).json(); } catch (e) { S.mecaData.alchimie = null; }
  // Mode MJ conservé pendant la session de l'onglet : on redéchiffre avec la phrase mémorisée
  const phraseSession = sessionStorage.getItem("asterre-mj-phrase");
  if (phraseSession && !(await deverrouillerMJ(phraseSession))) sessionStorage.removeItem("asterre-mj-phrase");
  majBoutonMJ();
  renderCarte(); renderLegende(); construireCodex(); remplirRecherche(); brancherUI(); remplirChoixPays();
  try { S.musiques = (await (await fetch("data/musiques.json?v=" + VERSION)).json()).pistes || []; } catch (e) { S.musiques = []; }
  initMusique();
  chargerSeanceHash();
  $("#chargement").remove();
}

/* ─────────────── Lancement ─────────────── */
if (IS_BROWSER) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}

/* Accès console pour le débogage : window.ASTERRE.S, window.ASTERRE.chargerPays(…), etc. */
if (IS_BROWSER) window.ASTERRE = Object.assign({}, carte_geometrie, carte_rendu, carte_vue, codex, donnees, etat, joueur, lignees, meca_alchimie, musique, panneaux, seance, ui, utils, visibilite, voyage_moteur, voyage_ui);
