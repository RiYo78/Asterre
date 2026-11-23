/* ASTERRE — visibilite.js · Règles de visibilité joueur / MJ : révélations et masquages locaux, blocs MJ, secrets, détails, bouton de publication. */
import { IS_BROWSER, S } from "./etat.js?v=16";
import { $, esc, toast } from "./utils.js?v=16";

export function estRevele(id) { return S.reveals.has(id); }
export function visib(id, def) { if (S.masques.has(id)) return false; if (S.reveals.has(id)) return true; return def; }
export function cocheMJ(id, def, label) {
  if (!S.mj) return "";
  const v = visib(id, def);
  return `<label class="coche-mj"><input type="checkbox" data-vis="${esc(id)}" data-def="${def ? 1 : 0}" ${v ? "checked" : ""}> ${label || "Visible pour les joueurs"} <small>(cet appareil — publiez via 🔓)</small></label>`;
}
export function blocMJ(id, def, contenu, label) {
  const v = visib(id, def);
  if (!v && !S.mj) return "";
  return `<div class="bloc-mj ${v ? "" : "pt-cache"}" data-bloc="${esc(id)}">${contenu}${cocheMJ(id, def, label)}</div>`;
}
export function sauveReveals() { try { localStorage.setItem("asterre-reveals", JSON.stringify([...S.reveals])); localStorage.setItem("asterre-masques", JSON.stringify([...S.masques])); } catch (e) {} }
export function chargeReveals() {
  try { S.reveals = new Set(JSON.parse(localStorage.getItem("asterre-reveals") || "[]")); } catch (e) { S.reveals = new Set(); }
  try { S.masques = new Set(JSON.parse(localStorage.getItem("asterre-masques") || "[]")); } catch (e) { S.masques = new Set(); }
}

export function secretsHTML(liste) {
  if (!liste || !liste.length) return "";
  const visibles = liste.filter(s => s.revele || estRevele(s.id) || S.mj);
  if (!visibles.length) return "";
  return `<h3>Secrets</h3>` + visibles.map(s => {
    const ouvert = s.revele || estRevele(s.id);
    const coche = S.mj && !s.revele ? `<label class="coche-mj"><input type="checkbox" data-rev="${esc(s.id)}" ${ouvert ? "checked" : ""}> Visible pour les joueurs <small>(cet appareil — publiez via le bouton 🔓)</small></label>` : "";
    return `
    <div class="secret ${ouvert ? "revele" : ""}">
      <span class="sceau-secret">${ouvert ? "🔓 Révélé" : "🔒 Secret MJ"}</span>
      <b class="t">${esc(s.titre)}</b><p>${esc(s.texte)}</p>${coche}
    </div>`;
  }).join("");
}
export function detailsHTML(liste, prefix) {
  if (!liste || !liste.length) return "";
  const items = [];
  liste.forEach((d, i) => {
    const obj = typeof d === "string" ? { texte: d } : d;
    const id = `${prefix}-${i}`;
    const defVisible = !obj.mj;
    const visible = S.masques.has(id) ? false : (S.reveals.has(id) ? true : defVisible);
    if (!visible && !S.mj) return;
    const coche = S.mj ? ` <label class="coche-mj coche-inline"><input type="checkbox" data-vis="${id}" data-def="${defVisible ? 1 : 0}" ${visible ? "checked" : ""}> joueurs</label>` : "";
    items.push(`<li class="${visible ? "" : "pt-cache"}">${esc(obj.texte)}${coche}</li>`);
  });
  if (!items.length) return "";
  return `<ul class="tensions">${items.join("")}</ul>`;
}
export function majBoutonMJ() {
  $("#btn-mj").classList.toggle("actif", S.mj);
  $("#btn-mj").title = S.mj ? "Mode MJ actif — cliquer pour quitter" : "Mode Maître du Jeu";
  let b = $("#btn-reveals");
  if (S.mj) {
    if (!b) {
      b = document.createElement("button");
      b.id = "btn-reveals"; b.className = "btn";
      b.title = "Copier la liste des révélations pour publication";
      $("#btn-mj").before(b);
      b.addEventListener("click", copierReveals);
    }
    b.textContent = `🔓 ${S.reveals.size + S.masques.size}`;
  } else if (b) b.remove();
}
export function copierReveals() {
  const rev = [...S.reveals], mas = [...S.masques];
  const texte = (rev.length || mas.length)
    ? `Modifications Asterre à publier :\nÀ RENDRE VISIBLES :\n${rev.join("\n") || "(aucun)"}\nÀ MASQUER :\n${mas.join("\n") || "(aucun)"}`
    : "Aucune modification cochée sur cet appareil.";
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject()).then(
    () => toast((rev.length || mas.length) ? "Liste copiée — collez-la à Claude pour publier aux joueurs." : "Aucune modification cochée."),
    () => { prompt("Copiez cette liste :", texte); }
  );
}
if (IS_BROWSER) document.addEventListener("change", e => {
  const t = e.target;
  if (t && t.dataset && t.dataset.rev) {
    t.checked ? S.reveals.add(t.dataset.rev) : S.reveals.delete(t.dataset.rev);
    sauveReveals(); majBoutonMJ();
    toast(t.checked ? "🔓 Visible sur cet appareil — pensez à publier (bouton 🔓)." : "🔒 De nouveau caché sur cet appareil.");
    return;
  }
  if (t && t.dataset && t.dataset.vis) {
    const id = t.dataset.vis, defVisible = t.dataset.def === "1";
    if (t.checked) { S.masques.delete(id); if (!defVisible) S.reveals.add(id); else S.reveals.delete(id); }
    else { S.reveals.delete(id); if (defVisible) S.masques.add(id); else S.masques.delete(id); }
    const cible = t.closest("[data-bloc]") || t.closest("li"); if (cible) cible.classList.toggle("pt-cache", !t.checked);
    sauveReveals(); majBoutonMJ();
    toast(t.checked ? "👁 Point visible (cet appareil) — publiez via 🔓." : "🙈 Point masqué (cet appareil) — publiez via 🔓.");
  }
});
