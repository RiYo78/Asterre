# 🗺️ ASTERRE — Carte Interactive du Monde

Carte médiévale-fantasy interactive des **Îles Saintes**, construite pour évoluer vers le monde entier d'Asterre (Continent, Drémora, Désert Magistral, Babel…).

---

## 🚀 Mettre en ligne (GitHub Pages — gratuit, lien permanent)

1. Créer un compte sur github.com si besoin, puis un **nouveau dépôt** (ex. `asterre-carte`), public.
2. Cliquer **« uploading an existing file »** et glisser-déposer **tout le contenu** de ce dossier (index.html, les dossiers css/, js/, data/, images/).
3. Dans le dépôt : **Settings → Pages → Branch : main → Save**.
4. Après ~1 minute, la carte est en ligne à `https://VOTRE-PSEUDO.github.io/asterre-carte/` — c'est ce lien que vous partagez à vos joueurs.

**Tester en local** (le double-clic sur index.html ne suffit pas, il faut un mini-serveur) :
```
cd asterre-carte
python -m http.server 8000
```
puis ouvrir http://localhost:8000

---

## 🖼️ Déposer vos images

Placez vos fichiers **avec exactement ces noms** — la carte les affichera automatiquement (tant qu'ils sont absents, un cadre « Illustration à venir » indique le chemin attendu) :

| Type | Emplacement |
|---|---|
| Illustration d'une ville | `images/lieux/<id-du-lieu>/principale.jpg` (ex. `images/lieux/roche-sainte/principale.jpg`) |
| Illustration d'un lieu notable | `images/lieux/<id-de-la-ville>/<id-du-lieu-notable>.jpg` (ex. `images/lieux/roche-sainte/cathedrale.jpg`) |
| Blason | `images/blasons/<id>.png` (royaume, eglise, van-emris, goldland, merlyn, sauvage, aurelion, caldrin, velarys, wines) |
| Portrait de PNJ | `images/pnj/<id>.jpg` (ex. `images/pnj/arthur-sauvage.jpg`) |

Les identifiants exacts sont visibles dans `data/iles-saintes.json`. Formats acceptés : .jpg ou .png (respecter l'extension indiquée dans le cadre vide).

---

## 🔒 Mode MJ & secrets

- **Phrase de passe** : `lumiere7` — changez-la dans `data/monde.json` (champ `mj.phrase`).
- Bouton ✠ en haut à droite → phrase de passe → les secrets s'affichent avec le sceau 🔒.
- **Révéler un secret aux joueurs** : dans `data/iles-saintes.json`, passez son champ `"revele": false` à `"revele": true` (une seule modification), ou dites simplement à Claude : *« révèle le secret [titre] »*. Un secret révélé apparaît à tous avec le sceau 🔓.

## 🔄 Mettre à jour depuis Notion

Dites à Claude : **« lis les fiches Notion et mets-toi à jour »**. Claude relit les pages et régénère uniquement `data/iles-saintes.json` — remplacez ce fichier dans le dépôt, rien d'autre ne bouge.

## 🌍 Ajouter un pays plus tard

Chaque pays est un module : créer `data/<pays>.json` sur le même schéma, l'ajouter à la liste `pays` de `data/monde.json` avec `"actif": true`. Le Continent est déjà réservé à l'est de la carte (360 km — 3 j de navire).

---

## 🧭 En séance

- **Voyage** : bouton 🧭 → cliquer le départ, puis l'arrivée, puis d'éventuelles étapes. Durées par moyen, itinéraire suggéré, trajet dessiné, avertissements (mer, montagne, ☠️). Le **trajet mixte** permet de choisir un moyen différent par segment. Les **modificateurs** (météo, tempête, hiver, groupe lent…) sont des interrupteurs à activer par le MJ.
- **Codex** : lois, religions, familles & blasons, économie, politique, armées, chronologie filtrable par lieu, personnages.
- Les durées reproduisent fidèlement les tables du Royaume (« arrondi du voyageur » : journées pleines à pied, repos du cheval tous les 3 jours…).
