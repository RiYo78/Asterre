/* ASTERRE — etat.js · État global partagé (S) et constantes d'environnement. */

export const IS_BROWSER = typeof window !== "undefined";
export const SVGNS = "http://www.w3.org/2000/svg";

export const S = {
  monde: null, pays: null, lieux: {}, sousLieux: {}, graphe: {},
  mj: false, vue: "carte", reveals: new Set(), masques: new Set(),
  voyage: { actif: false, etapes: [], modifs: new Set(), choix: {} },
  seance: { pnj: [], lieu: null, images: {} },
  des: { historique: [] }, musiques: [], pisteActive: null,
  joueur: { perso: null, sousOnglet: "fiche" }, fichesJoueur: {},
  meca: { fiche: "alchimie", tab: "bases", sel: {} }, mecaData: {},
  lignees: { mode: "arbres", ouvert: null },
  vb: { x: 0, y: 0, w: 2000, h: 1500 }, vb0: null,
  kmParUnite: 0.22
};
