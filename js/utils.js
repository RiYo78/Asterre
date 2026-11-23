/* ASTERRE — utils.js · Petits utilitaires DOM/SVG : sélecteur, échappement HTML, création SVG, aléatoire déterministe, toast, cadre d'image. */
import { SVGNS } from "./etat.js?v=14";

/* ─────────────── Utilitaires ─────────────── */
export const $ = s => document.querySelector(s);
export function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in (attrs || {})) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("visible");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("visible"), 2600);
}

export function imgHTML(src, label) {
  return `<div class="cadre-img"><img src="${esc(src)}" alt="${esc(label)}" loading="lazy"
    onerror="this.parentNode.innerHTML='<div class=&quot;vide&quot;>Illustration à venir<code>${esc(src)}</code></div>'"></div>`;
}
