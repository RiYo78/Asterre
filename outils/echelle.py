#!/usr/bin/env python3
"""Recale un pays sur ses distances canon (Notion) — « plan de placement ».

Principe :
  1. Positions des lieux : on cherche, en km, des positions dont les distances à vol
     d'oiseau respectent les distances canon des routes (Notion compte le vol sur les
     mêmes km que la route), tout en restant proches de la géographie actuelle.
       - route / piste / montagne : distance droite ≈ km canon
       - maritime : distance droite ≈ 97 % du km canon (la mer est presque droite)
       - côtier : distance droite ≤ km canon (on longe la côte, plus long)
  2. Tout le reste (côtes, zones, fleuves, tracés, étiquettes) suit par une déformation
     douce (spline « plaque mince ») ancrée sur les lieux et les bords de la carte.

Usage :
  python3 outils/echelle.py <source.json> <sortie.json> [--png comparaison.png]
Ne modifie jamais la source : on relit la sortie, puis on la copie à la main si elle convient.
"""
import json, sys
import numpy as np

COEF = {"route": 1.0, "piste": 1.0, "montagne": 1.0, "maritime": 0.97}


def km_par_unite(d):
    m = [r for r in d["routes"] if r["type"] == "maritime"]
    L = lambda p: sum(np.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) for i in range(len(p) - 1))
    return float(np.mean([r["km"] / L(r["points"]) for r in m]))


def placer(d, k, iters=40000):
    ids = [l["id"] for l in d["lieux"]]
    ix = {i: n for n, i in enumerate(ids)}
    X0 = np.array([l["pos"] for l in d["lieux"]], float) * k      # en km
    X = X0.copy()
    egal, maxi = [], []
    for r in d["routes"]:
        a, b = ix[r["de"]], ix[r["a"]]
        if r["type"] == "cotier":
            maxi.append((a, b, r["km"]))
        else:
            egal.append((a, b, r["km"] * COEF[r["type"]]))
    # si deux routes relient la même paire (ex. route + côtier), la terrestre fixe la distance
    paires = {(min(a, b), max(a, b)) for a, b, _ in egal}
    maxi = [(a, b, m) for a, b, m in maxi if (min(a, b), max(a, b)) not in paires]
    # Formes des îles : deux lieux d'une même île non reliés par une route gardent leur
    # distance d'origine, mise à l'échelle de l'île (poids faible) — évite qu'une île se replie.
    forme = []
    ile_de = {ix[l["id"]]: l.get("ile") for l in d["lieux"]}
    for ile in {v for v in ile_de.values() if v}:
        membres = [i for i, v in ile_de.items() if v == ile]
        rr = [(a, b, t) for a, b, t in egal if a in membres and b in membres]
        s_ile = float(np.mean([t / (np.linalg.norm(X0[a] - X0[b]) + 1e-9) for a, b, t in rr])) if rr else 1.0
        for i in membres:
            for j in membres:
                if i < j and (i, j) not in paires:
                    # petites îles (≤ 3 lieux) : forme tenue fermement ; grandes îles : les routes priment
                    forme.append((i, j, np.linalg.norm(X0[i] - X0[j]) * s_ile, 0.3 if len(membres) <= 3 else 0.02))
    lam, pas = 0.0005, 0.02
    for _ in range(iters):
        G = lam * (X - X0)
        for a, b, t in egal:
            v = X[a] - X[b]; n = np.linalg.norm(v) + 1e-9
            g = (n - t) / t * v / n
            G[a] += g; G[b] -= g
        for a, b, t, wt in forme:
            v = X[a] - X[b]; n = np.linalg.norm(v) + 1e-9
            g = wt * (n - t) / t * v / n
            G[a] += g; G[b] -= g
        for a, b, m in maxi:
            v = X[a] - X[b]; n = np.linalg.norm(v) + 1e-9
            if n > m:
                g = (n - m) / m * v / n
                G[a] += g; G[b] -= g
        X -= pas * G * 50
    rapport = []
    for r in d["routes"]:
        a, b = ix[r["de"]], ix[r["a"]]
        avant = np.linalg.norm(X0[a] - X0[b]); apres = np.linalg.norm(X[a] - X[b])
        rapport.append((r["de"], r["a"], r["type"], r["km"], round(avant), round(apres)))
    return ids, X0 / k, X / k, rapport


def tps(src, dst):
    """Spline plaque mince 2D : renvoie f(points) qui envoie src → dst exactement."""
    n = len(src)
    U = lambda r2: np.where(r2 == 0, 0, r2 * np.log(r2 + 1e-12))
    D2 = ((src[:, None, :] - src[None, :, :]) ** 2).sum(-1)
    K = U(D2); P = np.hstack([np.ones((n, 1)), src])
    A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = P; A[n:, :n] = P.T
    B = np.zeros((n + 3, 2)); B[:n] = dst
    W = np.linalg.solve(A + np.eye(n + 3) * 1e-6, B)
    def f(pts):
        pts = np.asarray(pts, float).reshape(-1, 2)
        Q = U(((pts[:, None, :] - src[None, :, :]) ** 2).sum(-1))
        return Q @ W[:n] + np.hstack([np.ones((len(pts), 1)), pts]) @ W[n:]
    return f


def similitude(a, b):
    """Rotation + échelle uniforme + translation envoyant au mieux les points a sur b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) == 1:
        return lambda p: np.asarray(p, float).reshape(-1, 2) + (b[0] - a[0])
    ca, cb = a.mean(0), b.mean(0)
    za = (a - ca) @ np.array([1, 1j]); zb = (b - cb) @ np.array([1, 1j])
    m = (np.conj(za) @ zb) / (np.conj(za) @ za)
    def f(p):
        z = (np.asarray(p, float).reshape(-1, 2) - ca) @ np.array([1, 1j]) * m
        return np.stack([z.real, z.imag], 1) + cb
    return f


def deformer(d, ids, avant, apres, vb):
    x0, y0, w, h = vb
    ix = {i: n for n, i in enumerate(ids)}
    rnd = lambda arr: [[round(float(x)), round(float(y))] for x, y in arr]
    pos = {i: [round(float(p[0])), round(float(p[1]))] for i, p in zip(ids, apres)}
    for ile in d.get("iles", []):
        membres = [ix[l["id"]] for l in d["lieux"] if l.get("ile") == ile["id"]]
        if not membres:
            continue  # îlot sans lieu : ne bouge pas
        S = similitude(avant[membres], apres[membres])
        contour = np.asarray(ile["forme"], float)
        # contrôle : les lieux exactement à leur place, le contour suit la similitude
        f = tps(np.vstack([avant[membres], contour]), np.vstack([apres[membres], S(contour)])) if len(membres) >= 3 else S
        ile["forme"] = rnd(f(contour))
        if ile.get("labelPos"): ile["labelPos"] = rnd(f([ile["labelPos"]]))[0]
        for z in ile.get("zones", []): z["poly"] = rnd(f(z["poly"]))
        for fl in ile.get("fleuves", []): fl["points"] = rnd(f(fl["points"]))
    for l in d["lieux"]: l["pos"] = pos[l["id"]]
    # tracés : déformation globale douce, extrémités collées aux lieux
    coins = np.array([[x0 - 400, y0 - 400], [x0 + w + 400, y0 - 400], [x0 - 400, y0 + h + 400], [x0 + w + 400, y0 + h + 400]], float)
    g = tps(np.vstack([avant, coins]), np.vstack([apres, coins]))
    for r in d["routes"]:
        pts = rnd(g(r["points"])); pts[0] = pos[r["de"]]; pts[-1] = pos[r["a"]]; r["points"] = pts
    for lb in d.get("labels", []): lb["pos"] = rnd(g([lb["pos"]]))[0]
    for rg in d.get("regions_carte", []):
        if rg.get("poly"): rg["poly"] = rnd(g(rg["poly"]))
        if rg.get("polys"): rg["polys"] = [rnd(g(p)) for p in rg["polys"]]
        if rg.get("label"): rg["label"] = rnd(g([rg["label"]]))[0]


def dessiner(d_av, d_ap, chemin, vb):
    from PIL import Image, ImageDraw, ImageFont
    x0, y0, w, h = vb; S = 0.6
    try:
        police = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 15)
        titre_p = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 22)
    except OSError:
        police = titre_p = ImageFont.load_default()
    img = Image.new("RGB", (int(w * S * 2) + 30, int(h * S) + 60), (243, 236, 220))
    dr = ImageDraw.Draw(img)
    for col, (d, titre) in enumerate([(d_av, "AVANT"), (d_ap, "APRÈS (distances canon)")]):
        ox = col * (w * S + 30)
        T = lambda p: (ox + (p[0] - x0) * S, 40 + (p[1] - y0) * S)
        dr.text((ox + 10, 8), titre, fill=(60, 45, 25), font=titre_p)
        dr.rectangle([ox, 40, ox + w * S, 40 + h * S], fill=(70, 120, 132))
        for ile in d["iles"]:
            dr.polygon([T(p) for p in ile["forme"]], fill=(214, 201, 155), outline=(63, 51, 31))
            for z in ile.get("zones", []):
                c = {"foret": (125, 149, 94), "montagne-neige": (231, 233, 228), "foret-neige": (200, 210, 200), "prairie": (163, 186, 116), "marais": (143, 156, 109)}.get(z["type"], (190, 180, 140))
                dr.polygon([T(p) for p in z["poly"]], fill=c)
        for r in d["routes"]:
            c = (220, 235, 238) if r["type"] in ("maritime", "cotier") else (90, 67, 38)
            dr.line([T(p) for p in r["points"]], fill=c, width=2)
        for l in d["lieux"]:
            x, y = T(l["pos"]); dr.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(240, 230, 198), outline=(40, 30, 15))
            dr.text((x + 8, y - 9), l["nom"], fill=(30, 22, 10), font=police)
    img.save(chemin)


def dans(p, poly):
    c = False; j = len(poly) - 1
    for i in range(len(poly)):
        (xi, yi), (xj, yj) = poly[i], poly[j]
        if (yi > p[1]) != (yj > p[1]) and p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi: c = not c
        j = i
    return c


def main():
    src, out = sys.argv[1], sys.argv[2]
    d = json.load(open(src, encoding="utf-8")); avant_d = json.loads(json.dumps(d))
    k = km_par_unite(d)
    ids, avant, apres, rapport = placer(d, k)
    print(f"échelle : {k:.4f} km par unité de carte")
    print(f"{'trajet':42} {'type':9} {'canon':>6} {'avant':>6} {'après':>6}  (km à vol d'oiseau)")
    for de, a, t, km, av, ap in rapport:
        print(f"{de + ' → ' + a:42} {t:9} {km:6} {av:6} {ap:6}")
    deplac = np.linalg.norm((apres - avant) * k, axis=1)
    print("déplacement moyen des lieux :", round(float(deplac.mean())), "km · max :", round(float(deplac.max())), "km")
    vb = (0, 0, 2000, 1500)
    deformer(d, ids, avant, apres, vb)
    # Un lieu tombé sur la côte est ramené vers l'intérieur de son île (pas de 2 unités, marge de 10)
    rentres = []
    for l in d["lieux"]:
        ile = next((i for i in d["iles"] if i["id"] == l.get("ile")), None)
        if not ile or dans(l["pos"], ile["forme"]):
            continue
        c = np.mean(np.asarray(ile["forme"], float), 0); p0 = np.asarray(l["pos"], float); p = p0.copy()
        u = (c - p) / (np.linalg.norm(c - p) + 1e-9)
        while not dans(p.tolist(), ile["forme"]): p += 2 * u
        p += 10 * u
        l["pos"] = [round(float(p[0])), round(float(p[1]))]
        rentres.append(f"{l['nom']} ({np.linalg.norm(p - p0) * k:.1f} km)")
    for r in d["routes"]:
        P = {l["id"]: l["pos"] for l in d["lieux"]}; r["points"][0] = P[r["de"]]; r["points"][-1] = P[r["a"]]
    print("lieux ramenés dans les terres :", ", ".join(rentres) or "aucun")
    hors = [l["nom"] for l in d["lieux"] for ile in d["iles"] if ile["id"] == l.get("ile") and not dans(l["pos"], ile["forme"])]
    print("lieux hors de leur île :", hors or "aucun")
    open(out, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1))
    if "--png" in sys.argv:
        dessiner(avant_d, d, sys.argv[sys.argv.index("--png") + 1], vb)


if __name__ == "__main__":
    main()
