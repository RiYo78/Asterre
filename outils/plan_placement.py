#!/usr/bin/env python3
"""Plan de placement à importer dans Inkarnate comme calque de référence.

Image haute résolution, même cadrage que la carte du site (viewBox 0 0 2000 1500) :
contours des îles en pointillés, lieux et leurs noms, routes canon, quadrillage tous
les 50 km, règle de 100 km. On peint par-dessus dans Inkarnate, puis on retire le calque ;
l'image peinte exportée au même format (4:3) se superpose alors exactement au site.

Usage : python3 outils/plan_placement.py <pays.json> <sortie.png> [largeur_px=6144]
"""
import json, math, sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 6144
d = json.load(open(src, encoding="utf-8"))
VB = (0, 0, 2000, 1500)
S = W / VB[2]; H = round(VB[3] * S)
mar = [r for r in d["routes"] if r["type"] == "maritime"]
L = lambda p: sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))
k = sum(r["km"] / L(r["points"]) for r in mar) / len(mar) if mar else 0.22   # km par unité
px_km = S / k

F = "/System/Library/Fonts/Supplemental/Georgia.ttf"
def police(t):
    try: return ImageFont.truetype(F, t)
    except OSError: return ImageFont.load_default()
f_lieu, f_ile, f_titre, f_petit = police(round(W / 230)), police(round(W / 120)), police(round(W / 90)), police(round(W / 320))

img = Image.new("RGB", (W, H), (236, 241, 240))
dr = ImageDraw.Draw(img)
T = lambda p: ((p[0] - VB[0]) * S, (p[1] - VB[1]) * S)

# quadrillage 50 km
pas = 50 * px_km
x = 0.0
while x < W:
    dr.line([(x, 0), (x, H)], fill=(205, 214, 214), width=max(1, W // 3000)); x += pas
y = 0.0
while y < H:
    dr.line([(0, y), (W, y)], fill=(205, 214, 214), width=max(1, W // 3000)); y += pas

def pointilles(pts, couleur, ep, tiret=18, vide=12):
    pts = pts + [pts[0]]
    for a, b in zip(pts, pts[1:]):
        lg = math.dist(a, b); n = max(1, int(lg / (tiret + vide)))
        for i in range(n):
            t0, t1 = i / n, min(1, (i + tiret / (tiret + vide)) / n)
            dr.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=couleur, width=ep)

ep = max(2, W // 1500)
for ile in d.get("iles", []):
    pts = [T(p) for p in ile["forme"]]
    dr.polygon(pts, fill=(226, 219, 196))
    pointilles(pts, (120, 100, 70), ep)
    for z in ile.get("zones", []):
        if z["type"].startswith("montagne"):
            pointilles([T(p) for p in z["poly"]], (150, 150, 160), max(1, ep // 2), 8, 10)
        elif z["type"].startswith("foret"):
            pointilles([T(p) for p in z["poly"]], (110, 140, 90), max(1, ep // 2), 8, 10)
    if ile.get("nom") and ile.get("labelPos"):
        x, y = T(ile["labelPos"]); dr.text((x, y), ile["nom"].upper(), fill=(110, 90, 60), font=f_ile, anchor="mm")

for r in d.get("routes", []):
    pts = [T(p) for p in r["points"]]
    c = (150, 180, 190) if r["type"] in ("maritime", "cotier") else (130, 95, 55)
    dr.line(pts, fill=c, width=max(1, ep // 2))
    m = pts[len(pts) // 2]
    dr.text((m[0] + 6, m[1] + 6), f"{r['km']} km", fill=c, font=f_petit)

R = W / 500
for l in d.get("lieux", []):
    x, y = T(l["pos"])
    dr.ellipse([x - R, y - R, x + R, y + R], fill=(170, 40, 40), outline=(60, 20, 20), width=max(1, ep // 2))
    dr.line([(x - 2.2 * R, y), (x + 2.2 * R, y)], fill=(170, 40, 40), width=max(1, ep // 3))
    dr.line([(x, y - 2.2 * R), (x, y + 2.2 * R)], fill=(170, 40, 40), width=max(1, ep // 3))
    dr.text((x + 2.6 * R, y - 1.3 * R), l["nom"], fill=(40, 25, 15), font=f_lieu)

# règle 100 km + titre + nord
x0, y0 = W * 0.04, H * 0.95
dr.rectangle([x0, y0, x0 + 100 * px_km, y0 + H / 150], fill=(60, 45, 30))
dr.rectangle([x0 + 50 * px_km, y0, x0 + 100 * px_km, y0 + H / 150], fill=(236, 241, 240), outline=(60, 45, 30), width=ep)
dr.text((x0, y0 - H / 40), "0", fill=(60, 45, 30), font=f_lieu)
dr.text((x0 + 100 * px_km, y0 - H / 40), "100 km", fill=(60, 45, 30), font=f_lieu, anchor="ma")
dr.text((W * 0.04, H * 0.03), f"{d.get('nom', '')} — plan de placement (distances canon Notion)", fill=(60, 45, 30), font=f_titre)
dr.text((W * 0.04, H * 0.03 + W / 70), f"Quadrillage : 50 km · format {W}×{H} px (4:3) · calque de référence à retirer après la peinture", fill=(90, 75, 55), font=f_lieu)
nx, ny = W * 0.94, H * 0.07
dr.polygon([(nx, ny - H / 30), (nx - W / 200, ny + H / 60), (nx + W / 200, ny + H / 60)], fill=(60, 45, 30))
dr.text((nx, ny + H / 40), "N", fill=(60, 45, 30), font=f_ile, anchor="mm")
img.save(out, optimize=True)
print(f"{out} : {W}×{H} px · 1 km = {px_km:.1f} px · 100 km = {100 * px_km:.0f} px")
