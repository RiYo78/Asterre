/* ASTERRE — musique.js · Lecteur de musique d'ambiance. */
import { S } from "./etat.js?v=16";
import { $, esc, toast } from "./utils.js?v=16";

/* ── Musique d'ambiance ── */
export let AUDIO = null;
export function initMusique() {
  AUDIO = new Audio(); AUDIO.loop = true; AUDIO.volume = .7;
  AUDIO.addEventListener("ended", majBarreMusique);
  AUDIO.addEventListener("play", majBarreMusique);
  AUDIO.addEventListener("pause", majBarreMusique);
}
export function jouerPiste(i) {
  const p = S.musiques[i]; if (!p) return;
  if (S.pisteActive === i) { AUDIO.paused ? AUDIO.play() : AUDIO.pause(); majBarreMusique(); return; }
  S.pisteActive = i;
  AUDIO.src = p.fichier; AUDIO.loop = p.boucle !== false;
  AUDIO.play().catch(() => toast("Lecture impossible — vérifiez que le fichier " + p.fichier + " est bien déposé."));
  majBarreMusique();
  const z = document.querySelector("#zone-musique"); if (z) majPistesUI();
}
export function stopPiste() { if (AUDIO) { AUDIO.pause(); AUDIO.src = ""; } S.pisteActive = null; majBarreMusique(); majPistesUI(); }
export function majBarreMusique() {
  const b = $("#musique-bar");
  const p = S.pisteActive != null ? S.musiques[S.pisteActive] : null;
  if (!p) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<span class="mb-titre">🎵 ${esc(p.titre)}</span>
    <button class="btn" id="mb-play">${AUDIO.paused ? "▶" : "⏸"}</button>
    <button class="btn ${AUDIO.loop ? "actif" : ""}" id="mb-loop" title="Boucle">🔁</button>
    <input type="range" id="mb-vol" min="0" max="100" value="${Math.round(AUDIO.volume * 100)}" aria-label="Volume">
    <button class="btn" id="mb-stop" title="Arrêter">✕</button>`;
  b.querySelector("#mb-play").addEventListener("click", () => { AUDIO.paused ? AUDIO.play() : AUDIO.pause(); });
  b.querySelector("#mb-loop").addEventListener("click", () => { AUDIO.loop = !AUDIO.loop; majBarreMusique(); });
  b.querySelector("#mb-vol").addEventListener("input", e => { AUDIO.volume = e.target.value / 100; });
  b.querySelector("#mb-stop").addEventListener("click", stopPiste);
}
export function majPistesUI() {
  const z = document.querySelector("#zone-musique"); if (!z) return;
  z.innerHTML = S.musiques.length
    ? `<div class="chips">` + S.musiques.map((p, i) =>
        `<button class="chip ${S.pisteActive === i ? "chip-active" : ""}" data-piste="${i}">${S.pisteActive === i && !AUDIO.paused ? "⏸ " : "▶ "}${esc(p.titre)}</button>`).join("") + `</div>`
    : `<p class="fell" style="font-size:13.5px">Aucune piste — déposez vos fichiers audio dans <code>musiques/</code> et listez-les dans <code>data/musiques.json</code> (ou dites-le à Claude).</p>`;
  z.querySelectorAll("[data-piste]").forEach(b => b.addEventListener("click", () => jouerPiste(+b.dataset.piste)));
}
