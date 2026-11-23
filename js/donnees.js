/* ASTERRE — donnees.js · Chargement et fusion des pays, changement de pays, déchiffrement des copies MJ. */
import { polyLength } from "./carte/geometrie.js?v=14";
import { renderCarte, renderLegende } from "./carte/rendu.js?v=14";
import { IS_BROWSER, S } from "./etat.js?v=14";
import { fermerPanneau } from "./panneaux.js?v=14";
import { montrerVue, remplirRecherche } from "./ui.js?v=14";
import { $, esc, toast } from "./utils.js?v=14";
import { construireGraphe } from "./voyage/moteur.js?v=14";
import { toggleVoyage } from "./voyage/ui.js?v=14";

/* ─────────────── Chargement ─────────────── */
export function initPays() {
  S.lieux = {}; S.sousLieux = {};
  if (IS_BROWSER) document.body.classList.toggle("vue-monde", !!S.pays.estMonde);
  for (const l of (S.pays.lieux || [])) {
    S.lieux[l.id] = l;
    for (const sl of (l.lieuxNotables || [])) S.sousLieux[sl.id] = { ...sl, parent: l.id };
  }
  S.graphe = construireGraphe(S.pays.routes || []);
  const refs = (S.pays.routes || []).filter(r => r.type === "maritime");
  if (refs.length) S.kmParUnite = refs.reduce((s, r) => s + r.km / polyLength(r.points), 0) / refs.length;
  $("#sous-titre").textContent = S.pays.nom;
}
export function remplirChoixPays() {
  const sel = $("#choix-pays"); if (!sel) return;
  const ids = Object.keys(S.paysData || {});
  if (ids.length < 2) { sel.hidden = true; return; }
  sel.hidden = false;
  sel.innerHTML = ids.map(id => `<option value="${id}" ${id === S.paysActifId ? "selected" : ""}>${esc(S.paysData[id].nom)}</option>`).join("");
  sel.onchange = () => chargerPays(sel.value);
}
export function chargerPays(id) {
  if (!S.paysData[id] || id === S.paysActifId) return;
  fermerPanneau(); toggleVoyage(false);
  S.paysActifId = id; S.pays = S.paysData[id];
  try { localStorage.setItem("asterre-pays", id); } catch (e) {}
  initPays();
  S.vb = { ...S.vb0 };
  renderCarte(); renderLegende(); remplirRecherche();
  montrerVue("carte");
  toast("🗺 " + S.pays.nom);
}
export const VERSION = "14"; // à incrémenter à chaque publication (anti-cache)
/* Données brutes telles que publiées : version publique, ou complète une fois le mode MJ déverrouillé. */
S.brut = {};
export function assembler() {
  const actifs = S.monde.pays.filter(p => p.actif && p.fichier && S.brut[p.id]);
  S.paysData = {};
  for (const p of actifs) S.paysData[p.id] = JSON.parse(JSON.stringify(S.brut[p.id])); // copie : la fusion modifie
  const base = S.paysData["iles-saintes"] || Object.values(S.paysData).find(d => d && d.codex);
  if (!base) throw new Error("aucun pays lisible");
  const cx = base.codex || (base.codex = {});
  cx.pays_codex = cx.pays_codex || [];
  for (const p of actifs) {
    const d = S.paysData[p.id]; if (d === base) continue;
    d.transports = d.transports || base.transports;
    d.modificateurs = d.modificateurs || base.modificateurs;
    for (const ch of ["lois", "religions", "politique", "economie", "armees", "familles"]) {
      if (d.codex && d.codex[ch]) { cx[ch] = cx[ch] || {}; Object.assign(cx[ch], d.codex[ch]); }
    }
    if (d.pays_codex_entry && !cx.pays_codex.find(x => x.id === d.pays_codex_entry.id)) cx.pays_codex.push(d.pays_codex_entry);
    d.codex = cx; // le codex reste toujours celui des Îles Saintes (fusionné)
    d.familles = d.familles || base.familles; d.blasonsInstitutions = d.blasonsInstitutions || base.blasonsInstitutions;
  }
}
/* ─────────────── Secrets MJ chiffrés ───────────────
   Chaque fichier de données a une copie complète chiffrée « <fichier>.mj »
   (openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256, en base64),
   produite par outils/publier.py. La phrase MJ n'est stockée nulle part dans le site. */
export const MJ_ITER = 200000;
export async function dechiffrerMJ(b64, phrase) {
  const brut = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
  if (new TextDecoder().decode(brut.slice(0, 8)) !== "Salted__") throw new Error("format inconnu");
  const sel = brut.slice(8, 16), corps = brut.slice(16);
  const cle0 = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations: MJ_ITER }, cle0, 384));
  const cle = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-CBC", false, ["decrypt"]);
  const clair = await crypto.subtle.decrypt({ name: "AES-CBC", iv: bits.slice(32, 48) }, cle, corps); // échoue si la phrase est fausse
  return JSON.parse(new TextDecoder().decode(clair));
}
export async function deverrouillerMJ(phrase) {
  const actifs = S.monde.pays.filter(p => p.actif && p.fichier && S.brut[p.id]);
  try {
    const complets = await Promise.all(actifs.map(async p => {
      const rep = await fetch(p.fichier + ".mj?v=" + VERSION);
      if (!rep.ok) throw new Error("copie MJ absente : " + p.fichier);
      return [p.id, await dechiffrerMJ(await rep.text(), phrase)];
    }));
    let alch = null;
    try { const r = await fetch("data/alchimie.json.mj?v=" + VERSION); if (r.ok) alch = await dechiffrerMJ(await r.text(), phrase); } catch (e) {}
    for (const [id, d] of complets) S.brut[id] = d;
    if (alch) S.mecaData.alchimie = alch;
  } catch (e) { console.warn("Déverrouillage MJ :", e.message); return false; }
  assembler();
  S.pays = S.paysData[S.paysActifId] || S.pays;
  initPays();
  S.mj = true;
  return true;
}
