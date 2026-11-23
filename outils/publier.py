#!/usr/bin/env python3
"""Publie les données du site à partir de la source complète (privée).

Source complète (avec tous les secrets MJ) : ../Asterre-prive/data/*.json
  — hors du dépôt, jamais envoyée en clair sur GitHub.

Pour chaque fichier, le script écrit dans data/ :
  1. <fichier>.json     version PUBLIQUE : tout ce qui est réservé au MJ est retiré
                        (mjOnly, mj, secrets non révélés, arbres et groupes MJ…)
  2. <fichier>.json.mj  copie COMPLÈTE chiffrée (AES-256-CBC, PBKDF2-SHA256),
                        que le site déchiffre dans le navigateur avec la phrase MJ.

La phrase de passe est lue dans le Trousseau macOS (service « asterre-mj »),
jamais affichée ni écrite dans un fichier :
    security add-generic-password -a "$USER" -s asterre-mj -w
(la commande demande la phrase deux fois).

Usage :
    python3 outils/publier.py            # rapport seulement
    python3 outils/publier.py --ecrire   # écrit data/*.json et data/*.json.mj
    python3 outils/publier.py --ouvrir   # (re)crée la source privée en déchiffrant data/*.json.mj
"""
import base64, copy, json, os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVE = os.environ.get("ASTERRE_PRIVE", os.path.join(os.path.dirname(RACINE), "Asterre-prive", "data"))
PUBLIC = os.path.join(RACINE, "data")
FICHIERS = ["iles-saintes.json", "dremora.json", "asterre-monde.json", "alchimie.json"]
ITER = 200000


def phrase():
    if os.environ.get("ASTERRE_PHRASE_TEST"):          # tests uniquement
        return os.environ["ASTERRE_PHRASE_TEST"]
    r = subprocess.run(["security", "find-generic-password", "-s", "asterre-mj", "-w"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("Phrase MJ introuvable dans le Trousseau (service « asterre-mj »). Voir l'aide en tête du script.")
    return r.stdout.rstrip("\n")


def openssl(args, donnees, secret):
    env = dict(os.environ, ASTERRE_K=secret)
    r = subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", str(ITER), "-md", "sha256",
                        "-pass", "env:ASTERRE_K"] + args, input=donnees, capture_output=True, env=env)
    if r.returncode != 0:
        sys.exit("Échec openssl : " + r.stderr.decode(errors="replace").strip())
    return r.stdout


def chiffrer(texte, secret):
    return base64.b64encode(openssl(["-salt"], texte.encode("utf-8"), secret)).decode("ascii")


def dechiffrer(b64, secret):
    return openssl(["-d"], base64.b64decode(b64), secret).decode("utf-8")


# ─────────────── Retrait du contenu MJ ───────────────
def est_mj(o):
    return isinstance(o, dict) and (o.get("mjOnly") is True or o.get("mj") is True)


def nettoyer(o, cle=None, retires=None):
    """Retire récursivement tout élément MJ. `retires` collecte les ids de personnages retirés."""
    if isinstance(o, list):
        out = []
        for x in o:
            if est_mj(x):
                if retires is not None and cle == "personnages" and "id" in x:
                    retires.add(x["id"])
                continue
            if cle == "secrets" and isinstance(x, dict) and not x.get("revele"):
                continue
            out.append(nettoyer(x, cle, retires))
        return out
    if isinstance(o, dict):
        o = {k: v for k, v in o.items() if k != "noteMJ"}
        return {k: nettoyer(v, k, retires) for k, v in o.items()}
    return o


def elaguer_arbre(n, retires):
    """Un nœud d'arbre qui renvoie à un personnage MJ disparaît avec sa descendance
    (même comportement que le site actuel pour les joueurs)."""
    if not n or (n.get("ref") in retires):
        return None
    n = dict(n)
    n["enfants"] = [e for e in (elaguer_arbre(c, retires) for c in n.get("enfants", [])) if e]
    return n


def version_publique(d):
    retires = set()
    pub = nettoyer(copy.deepcopy(d), None, retires)
    cx = pub.get("codex") or {}
    for a in cx.get("lignees", []):
        a["racine"] = elaguer_arbre(a.get("racine"), retires)
    for g in cx.get("groupes", []):
        g["membres"] = [m for m in g.get("membres", []) if m.get("ref") not in retires]
    for p in cx.get("personnages", []):
        p["affiliations"] = [x for x in p.get("affiliations", []) if not x.get("mj")]
    return pub, retires


def taille(o):
    return len(json.dumps(o, ensure_ascii=False))


def main():
    if "--ouvrir" in sys.argv:
        s = phrase(); os.makedirs(PRIVE, exist_ok=True)
        for f in FICHIERS:
            c = os.path.join(PUBLIC, f + ".mj")
            if os.path.exists(c):
                open(os.path.join(PRIVE, f), "w", encoding="utf-8").write(dechiffrer(open(c).read(), s))
                print("ouvert :", f)
        return
    if not os.path.isdir(PRIVE):
        sys.exit(f"Source privée absente : {PRIVE}  (utilisez --ouvrir)")
    s = phrase() if "--ecrire" in sys.argv else None
    for f in FICHIERS:
        src = os.path.join(PRIVE, f)
        if not os.path.exists(src):
            print("absent, ignoré :", f); continue
        texte = open(src, encoding="utf-8").read()
        complet = json.loads(texte)
        pub, retires = version_publique(complet)
        print(f"{f}: {taille(complet)//1024} Ko → public {taille(pub)//1024} Ko · {len(retires)} fiche(s) MJ retirée(s)")
        if s:
            open(os.path.join(PUBLIC, f), "w", encoding="utf-8").write(json.dumps(pub, ensure_ascii=False, indent=1))
            enc = chiffrer(texte, s)
            assert dechiffrer(enc, s) == texte, "vérification du chiffrement échouée"
            open(os.path.join(PUBLIC, f + ".mj"), "w").write(enc)
    if s:
        print("→ data/ publié (versions publiques + copies chiffrées vérifiées)")


if __name__ == "__main__":
    main()
