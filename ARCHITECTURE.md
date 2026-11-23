# Architecture du site ASTERRE

Site statique (GitHub Pages), en JavaScript natif, **sans outil de build** : les modules ES sont servis tels quels.
Tester en local : `python3 -m http.server 8000` à la racine, puis http://localhost:8000 (le double-clic sur `index.html` ne marche pas).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Squelette de la page, charge `js/main.js` |
| `css/style.css` | Tout le style |
| `js/main.js` | Démarrage : charge les données, déverrouille le mode MJ de la session, premier rendu. Expose `window.ASTERRE` pour la console |
| `js/etat.js` | L'objet d'état partagé `S` (pays actif, mode MJ, voyage, séance…) |
| `js/utils.js` | `$`, `esc` (échappement HTML), `el` (création SVG), `rng`, `toast`, `imgHTML` |
| `js/donnees.js` | Fusion des pays, changement de pays, **déchiffrement des copies MJ** (`VERSION` est ici) |
| `js/visibilite.js` | Tout ce qui décide « visible pour les joueurs ? » : révélations/masquages locaux, blocs MJ, secrets, détails |
| `js/carte/geometrie.js` | Géométrie pure (courbes, polygones) |
| `js/carte/rendu.js` | Dessin SVG de la carte |
| `js/carte/vue.js` | Zoom, déplacement, animation de la vue |
| `js/voyage/moteur.js` | **Moteur de voyage** : routes, plus court chemin, vitesses, arrondi, repos, vol libre, nage. Testé par `tests.html` |
| `js/voyage/ui.js` | Panneau de calcul de voyage (étapes, tableau, trajet mixte, réglages repos/nage) |
| `js/panneaux.js` | Fiches latérales : lieu, lieu notable, personnage, famille |
| `js/codex.js` | Onglet Codex |
| `js/lignees.js` | Onglet Lignées (arbres, groupes) |
| `js/joueur.js` | Espace Joueur (fiche, inventaire, quêtes…) |
| `js/seance.js` | Table de Séance et dés |
| `js/musique.js` | Musique d'ambiance |
| `js/meca/alchimie.js` | Onglet Mécaniques — Alchimie |
| `js/ui.js` | Navigation entre onglets, bouton MJ, recherche, branchement des contrôles |
| `tests.html` | Tests du moteur de voyage contre les tables Notion |
| `outils/sync_notion.py` | Synchronise personnages et chronologie depuis l'export Notion |
| `outils/publier.py` | Produit `data/*.json` (public, sans MJ) et `data/*.json.mj` (complet, chiffré) |
| `outils/version.py` | Incrémente la version anti-cache partout |

## Données

- **Source complète** (avec secrets) : `../Asterre-prive/data/` — hors dépôt. On n'édite que là.
- `outils/publier.py --ecrire` régénère `data/*.json` (public) et `data/*.json.mj` (chiffré, phrase dans le Trousseau macOS).
- Format d'un fichier pays : voir `SCHEMA.md`.

## Publier une modification

1. Modifier la source privée (ou le code).
2. `python3 outils/publier.py --ecrire` si des données ont changé.
3. `python3 outils/version.py`.
4. Ouvrir `tests.html` en local : 0 échec attendu.
5. Commit, push → GitHub Pages redéploie en ~1 minute.

## Règles de voyage (moteur)

- Pied, cheval : par les routes **ou** en ligne directe à travers la campagne (le plus rapide). Montagne −30 % / −40 %, terrain difficile −30 %.
- Calèche : routes uniquement, jamais en montagne. Bateau côtier / navire : lignes maritimes uniquement.
- Vol : toujours en ligne droite, 300 km max au-dessus de la mer sans se poser.
- Nage : en ligne droite ; l'eau à la vitesse fixée par le MJ, la terre à pied ; au-delà de la distance max sans respirer sous l'eau, impossible sauf « respire sous l'eau ».
- Repos (interrupteur) : 1 jour tous les 3 jours sur l'ensemble du trajet, pour pied, cheval, calèche, vol, nage (pas les embarcations).
