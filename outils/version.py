#!/usr/bin/env python3
"""Incrémente la version anti-cache partout à la fois (index.html, imports des modules, VERSION).

Les navigateurs gardent les fichiers en cache : chaque publication doit changer le
« ?v=N » de TOUS les fichiers, sinon un joueur peut recevoir un mélange d'ancien et
de nouveau code. Un même module importé avec deux « ?v= » différents serait chargé
deux fois — d'où ce script plutôt qu'une modification à la main.

Usage :  python3 outils/version.py          (N → N+1)
"""
import glob, os, re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(RACINE, "js", "donnees.js"), encoding="utf-8").read()
v = int(re.search(r'export const VERSION = "(\d+)"', src).group(1))
n = v + 1
fichiers = [os.path.join(RACINE, "index.html"), os.path.join(RACINE, "tests.html")] + glob.glob(os.path.join(RACINE, "js", "**", "*.js"), recursive=True)
for f in fichiers:
    t = open(f, encoding="utf-8").read()
    t2 = t.replace(f"?v={v}\"", f"?v={n}\"").replace(f'VERSION = "{v}"', f'VERSION = "{n}"')
    if t2 != t:
        open(f, "w", encoding="utf-8").write(t2)
print(f"version {v} → {n}")
