/* ASTERRE — ui.js · Interface générale : navigation entre onglets, mode MJ, recherche, branchement des contrôles. */
import { renderCarte } from "./carte/rendu.js?v=15";
import { animerVB, appliquerVB, coordsSouris, zoomer } from "./carte/vue.js?v=15";
import { renderChapitre } from "./codex.js?v=15";
import { chargerPays, deverrouillerMJ } from "./donnees.js?v=15";
import { S } from "./etat.js?v=15";
import { renderJoueur } from "./joueur.js?v=15";
import { renderLignees } from "./lignees.js?v=15";
import { renderMeca } from "./meca/alchimie.js?v=15";
import { fermerPanneau } from "./panneaux.js?v=15";
import { renderSeance } from "./seance.js?v=15";
import { $, esc, toast } from "./utils.js?v=15";
import { majBoutonMJ, visib } from "./visibilite.js?v=15";
import { clicLibre, clicLieu, toggleVoyage } from "./voyage/ui.js?v=15";

/* ─────────────── UI générale ─────────────── */
export function montrerVue(v) {
  S.vue = v;
  $("#codex").classList.toggle("ouvert", v === "codex");
  $("#seance").classList.toggle("ouvert", v === "seance");
  $("#joueur").classList.toggle("ouvert", v === "joueur");
  $("#meca").classList.toggle("ouvert", v === "meca");
  $("#lignees").classList.toggle("ouvert", v === "lignees");
  $("#ong-carte").classList.toggle("actif", v === "carte");
  $("#ong-codex").classList.toggle("actif", v === "codex");
  $("#ong-seance").classList.toggle("actif", v === "seance");
  $("#ong-joueur").classList.toggle("actif", v === "joueur");
  $("#ong-meca").classList.toggle("actif", v === "meca");
  $("#ong-lignees").classList.toggle("actif", v === "lignees");
  if (v !== "carte") { fermerPanneau(); toggleVoyage(false); }
  if (v === "seance") renderSeance();
  if (v === "joueur") renderJoueur();
  if (v === "meca") renderMeca();
  if (v === "lignees") renderLignees();
}
export async function toggleMJ() {
  if (S.mj) {
    // Sortie : on recharge pour repartir des seules données publiques (les secrets quittent la mémoire)
    sessionStorage.removeItem("asterre-mj-phrase");
    location.reload();
    return;
  }
  const rep = prompt("Phrase de passe du Maître du Jeu :");
  if (rep == null) return;
  toast("✠ Déchiffrement des secrets…");
  if (!(await deverrouillerMJ(rep.trim()))) return toast("La Lumière ne vous reconnaît pas.");
  sessionStorage.setItem("asterre-mj-phrase", rep.trim()); // cet onglet seulement, effacé à sa fermeture
  toast("✠ Mode MJ actif — les secrets vous sont ouverts.");
  majBoutonMJ();
  if (S.vue === "meca") renderMeca();
  renderCarte(); remplirRecherche(); // lieux et portails réservés au MJ apparaissent / disparaissent
  if ($("#panneau").classList.contains("ouvert")) fermerPanneau();
  if (S.vue === "codex") renderChapitre(document.querySelector("#codex-nav a.actif").dataset.ch);
}
export function remplirRecherche() {
  $("#lieux-datalist").innerHTML = (S.pays.lieux || []).filter(l => S.mj || visib("lieu-" + l.id, true)).map(l => `<option value="${esc(l.nom)}">`).join("");
}
/* Branché une seule fois (dans brancherUI) : remplirRecherche est rappelée à chaque changement de pays. */
export function brancherRecherche() {
  $("#recherche").addEventListener("change", () => {
    const v = $("#recherche").value.trim().toLowerCase();
    const l = (S.pays.lieux || []).find(x => x.nom.toLowerCase() === v) || (S.pays.lieux || []).find(x => x.nom.toLowerCase().includes(v));
    if (!l) return toast("Aucun lieu de ce nom sur la carte.");
    montrerVue("carte"); clicLieu(l.id); $("#recherche").value = "";
  });
}
export function brancherUI() {
  $("#ong-carte").addEventListener("click", () => montrerVue("carte"));
  $("#ong-codex").addEventListener("click", () => montrerVue("codex"));
  $("#ong-seance").addEventListener("click", () => montrerVue("seance"));
  $("#ong-joueur").addEventListener("click", () => montrerVue("joueur"));
  $("#ong-meca").addEventListener("click", () => montrerVue("meca"));
  $("#ong-lignees").addEventListener("click", () => montrerVue("lignees"));
  $("#btn-voyage").addEventListener("click", () => { montrerVue("carte"); toggleVoyage(); });
  $("#btn-mj").addEventListener("click", toggleMJ);
  brancherRecherche();
  $("#z-plus").addEventListener("click", () => zoomer(.72));
  $("#z-moins").addEventListener("click", () => zoomer(1.38));
  $("#z-reset").addEventListener("click", () => animerVB({ ...S.vb0 }));

  const svg = $("#carte");
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    drag = { x: e.clientX, y: e.clientY, vb: { ...S.vb }, bouge: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / r.width * S.vb.w, dy = (e.clientY - drag.y) / r.height * S.vb.h;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { drag.bouge = true; svg.classList.add("drag"); }
    S.vb.x = drag.vb.x - dx; S.vb.y = drag.vb.y - dy;
    appliquerVB();
  });
  svg.addEventListener("pointerup", () => { S._dragBouge = drag && drag.bouge; drag = null; svg.classList.remove("drag"); });
  svg.addEventListener("click", e => {
    if (!S._dragBouge && !S.voyage.actif && e.target.closest) {
      const rc = e.target.closest(".region-cliq");
      if (rc) { chargerPays(rc.dataset.allerpays); return; }
      const rz = e.target.closest(".region");
      if (rz) {
        const liste = S.pays.regions_carte || S.pays.regions || [];
        const d = liste.find(x => x.id === rz.dataset.region);
        if (d) { toast(d.nom + (d.note ? " — " + d.note : "")); return; }
      }
    }
    if (!S.voyage.actif || S._dragBouge) return;
    clicLibre(coordsSouris(e));
  });
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const [cx, cy] = coordsSouris(e);
    zoomer(e.deltaY > 0 ? 1.16 : .86, cx, cy);
  }, { passive: false });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { fermerPanneau(); } });
}
