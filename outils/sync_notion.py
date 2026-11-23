#!/usr/bin/env python3
"""Synchronise le site avec le Codex Notion (source de vérité).

Entrée : un dossier d'export (hors dépôt, il contient des infos MJ) avec
  personnages.json et chronologie.json — produits par Claude depuis les bases
  Notion « 👥 Personnages d'Asterre » et « 🕰️ Chronologie maître ».

Effet sur ../Asterre-prive/data/iles-saintes.json (source complète, codex fusionné) :
  - Personnages : complète les dates de naissance vides, ajoute les fiches
    Notion absentes (cachées aux joueurs par défaut), et SIGNALE sans rien
    trancher les écarts (date ou statut différents).
  - Chronologie : remplacée entièrement par la Chronologie maître
    (Visibilité « MJ » → cachée aux joueurs ; statut non canon → signalé).

Usage :  python3 outils/sync_notion.py <dossier_export> [--ecrire]
Sans --ecrire, le script n'affiche que le rapport.
"""
import json, os, re, sys, unicodedata

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# On modifie la SOURCE COMPLÈTE privée ; outils/publier.py produit ensuite les versions publiques.
PRIVE = os.environ.get("ASTERRE_PRIVE", os.path.join(os.path.dirname(RACINE), "Asterre-prive", "data"))
FICHIER = os.path.join(PRIVE, "iles-saintes.json")
AUTRES = [os.path.join(PRIVE, f) for f in ("dremora.json",)]

# Noms Notion → id du site quand la correspondance n'est pas évidente
ALIAS = {"sam l'ancien": "sam-aine", "ildris / veralion": "ildris", "katlyn nei": "katlyn",
         "miwa nei": "miwa", "ysengrin pale": "ysengrin"}
VIDE = {"", "à définir", "a definir", None}
NON_CANON = {"Possible": "possible", "Décidé en jeu": "décidé en jeu", "À arbitrer": "à arbitrer"}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def nombres(s):
    """Années citées dans un texte de date — « ~410 » et « Estimée vers l'an 410 » sont équivalents."""
    return re.findall(r"\d+", s or "")[:1]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")


def charge(dossier, nom):
    d = json.load(open(os.path.join(dossier, nom), encoding="utf-8"))
    return [dict(zip(d["champs"], l)) for l in d["lignes"]]


def sync_personnages(cx, lignes, rapport):
    site = cx["personnages"]
    par_nom = {norm(p["nom"]): p for p in site}
    par_id = {p["id"]: p for p in site}
    vus = set()
    for n in lignes:
        p = par_id.get(ALIAS.get(norm(n["nom"]))) or par_nom.get(norm(n["nom"]))
        nais = None if (norm(n["naissance"]) in VIDE or norm(n["naissance"]).startswith("a definir")) else n["naissance"]
        if p:
            vus.add(p["id"])
            if nais and not (p.get("naissance") or "").strip():
                p["naissance"] = nais
                rapport["naissances"].append(f"{p['nom']} : {nais}")
            elif nais and nombres(nais) != nombres(p.get("naissance")):
                rapport["ecarts"].append(f"{p['nom']} — naissance : site « {p.get('naissance')} » / Notion « {nais} »")
            st_site, st_n = norm(p.get("statut")), norm(n["statut"])
            if st_n == "mort" and not re.search(r"mort|tue|†", st_site):
                rapport["ecarts"].append(f"{p['nom']} — statut : site « {p.get('statut')} » / Notion « Mort »")
            if st_n == "vivant" and re.search(r"^mort", st_site):
                rapport["ecarts"].append(f"{p['nom']} — statut : site « {p.get('statut')} » / Notion « Vivant »")
            continue
        pid = slug(n["nom"])
        nouveau = {
            "id": pid, "nom": n["nom"], "titre": "", "origine": n["patrie"] or "",
            "race": " · ".join(n["race"] or []), "statut": n["statut"] or "", "naissance": nais or "",
            "religion": n["religion"] or "", "lieux": [], "portrait": f"images/pnj/{pid}.jpg",
            "description": re.sub(r"^\[MJ\]\s*", "", n["description"] or ""),
            "details": [], "galerie": [], "secrets": [], "mjOnly": True, "affiliations": [],
            "source": "notion"}
        site.append(nouveau)
        rapport["ajouts"].append(n["nom"])
    rapport["hors_notion"] = sorted(p["nom"] for p in site if p["id"] not in vus and p.get("source") != "notion")


def cles_lieux(tous):
    cles = []
    for lid, l in tous.items():
        nom = re.sub(r"^(l'|le |la |les )", "", l["nom"], flags=re.I)
        if norm(nom) in {"dremora"}:  # nom de pays : trop ambigu
            continue
        cles.append((norm(nom), lid))
    # « l'Académie » seule = celle des Îles Saintes (pas « l'Académie d'Avelorn »)
    cles += [("academie des iles saintes", "academie"), ("l'academie(?! d')", "academie"), ("vanhill", "vanhille")]
    return sorted(cles, key=lambda c: -len(c[0]))


def fmt_date(a, dp):
    if a is None:
        return dp or "?"
    an = f"An {a}" if a == 0 else (f"−{-a}" if a < 0 else str(a))
    if not dp:
        return an
    return dp if str(abs(a)) in dp else f"{an} · {dp}"


def sync_chronologie(cx, lignes, tous, rapport):
    cles = cles_lieux(tous)
    is_ids = {lid for lid, l in tous.items() if l.get("_pays") == "iles-saintes"}
    out, ids = [], set()
    for n in lignes:
        region = re.sub(r"\(sauf [^)]*\)", "", n["region"] or "")  # « (sauf Vanhill) » ne lie pas Vanhill
        texte = norm(f"{n['evenement']} {region}")
        lieux = []
        for k, lid in cles:
            if re.search(r"(?<![a-z])" + (k if "(?" in k else re.escape(k)) + r"(?![a-z])", texte) and lid not in lieux:
                lieux.append(lid)
        reg = norm(n["region"])
        if reg.startswith("dremora") or "lituania" in reg:
            pays = "dremora"
        elif "iles saintes" in reg or "colmores" in reg or "vanhill" in reg or any(l in is_ids for l in lieux):
            pays = "iles-saintes"
        else:
            pays = ""
        ev = n["evenement"]
        if n["statut"] in NON_CANON:
            ev += f" — ({NON_CANON[n['statut']]})"
        base = "chr-" + slug(f"{n['annee'] if n['annee'] is not None else 'x'} {' '.join(n['evenement'].split()[:4])}")
        cid, k = base, 2
        while cid in ids:
            cid, k = f"{base}-{k}", k + 1
        ids.add(cid)
        e = {"id": cid, "date": fmt_date(n["annee"], n["date_precise"]), "annee": n["annee"],
             "evenement": ev, "lieux": lieux, "pays": pays}
        if n["visibilite"] == "MJ":
            e["mj"] = True
        if n["epoque"]:
            e["epoque"] = n["epoque"]
        out.append(e)
    out.sort(key=lambda e: (e["annee"] is None, e["annee"] or 0))  # dates inconnues en fin de liste
    rapport["chrono"] = (len(cx.get("chronologie", [])), len(out), sum(1 for e in out if e.get("mj")))
    cx["chronologie"] = out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dossier = sys.argv[1]
    raw = open(FICHIER, encoding="utf-8").read()
    d = json.loads(raw)
    tous = {}
    for f, pays in [(FICHIER, "iles-saintes")] + [(a, os.path.basename(a)[:-5]) for a in AUTRES]:
        for l in json.load(open(f, encoding="utf-8")).get("lieux", []):
            tous[l["id"]] = {**l, "_pays": pays}
    rapport = {"naissances": [], "ecarts": [], "ajouts": [], "hors_notion": [], "chrono": None}
    sync_personnages(d["codex"], charge(dossier, "personnages.json"), rapport)
    sync_chronologie(d["codex"], charge(dossier, "chronologie.json"), tous, rapport)

    print(f"Naissances complétées ({len(rapport['naissances'])}) :", *rapport["naissances"], sep="\n  ")
    print(f"Fiches ajoutées depuis Notion, cachées aux joueurs ({len(rapport['ajouts'])}) :", ", ".join(rapport["ajouts"]))
    print(f"Écarts signalés, non modifiés ({len(rapport['ecarts'])}) :", *rapport["ecarts"], sep="\n  ")
    print(f"PNJ du site sans fiche Notion ({len(rapport['hors_notion'])}) :", ", ".join(rapport["hors_notion"]))
    a, b, m = rapport["chrono"]
    print(f"Chronologie : {a} → {b} événements ({m} réservés au MJ)")
    if "--ecrire" in sys.argv:
        open(FICHIER, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1))
        print("→ source privée mise à jour — lancez ensuite outils/publier.py --ecrire")


if __name__ == "__main__":
    main()
