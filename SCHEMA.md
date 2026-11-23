# Format des données — un fichier par pays

Chaque pays est un fichier `data/<id>.json`, déclaré dans `data/monde.json` (`pays[]` : `id`, `nom`, `fichier`, `actif`).
Ajouter un pays = créer son fichier dans la source privée, l'ajouter à `monde.json`, publier. Aucun code à modifier.

Coordonnées : repère de la carte, `viewBox` 0 0 2000 1500 (x vers la droite, y vers le bas).
Champs marqués *MJ* : retirés de la version publique, présents seulement dans la copie chiffrée.

## Racine

| Champ | Type | Rôle |
|---|---|---|
| `id`, `nom` | texte | Identifiant et nom affiché |
| `estMonde` | booléen | Carte du monde (masque recherche et voyage) |
| `iles[]` | liste | Masses de terre (voir ci-dessous) — servent aussi à détecter la mer |
| `lieux[]` | liste | Villes, villages, lieux-dits cliquables |
| `routes[]` | liste | Graphe des déplacements (distances **canon**) |
| `transports[]`, `modificateurs[]` | liste | Optionnels : sinon hérités des Îles Saintes |
| `reglages` | objet | `volMaxTraiteKm` (défaut 300), `kmParUnite` (échelle si aucune route maritime) |
| `regions_carte[]` | liste | Zones colorées (`id`, `nom`, `couleur`, `bord`, `poly` ou `polys`, `label`, `taille`, `angle`, `race`, `note`, `pays` = id d'un pays cliquable) |
| `voisins[]` | liste | Territoires hors cadre (`nom`, `sous`, `couleur`, `poly`, `label`, `angle`) |
| `portails[]` | liste | Passages vers d'autres mondes (`id`, `nom`, `sous`, `pos`, `note`, `mjOnly`) |
| `labels[]` | liste | Textes libres sur la carte (`texte`, `pos`, `taille`, `angle`) |
| `codex` | objet | Seulement dans `iles-saintes.json` (codex fusionné) ; les autres pays ajoutent leurs chapitres nationaux via `codex.lois`, `codex.religions`… et `pays_codex_entry` |

## `iles[]`
`id`, `nom`, `type` (`ile` | `ilot`), `seed` (aléa du contour), `forme` (polygone `[[x,y],…]`), `labelPos`,
`zones[]` (`type` : `prairie`, `foret`, `foret-neige`, `montagne-neige`, `marais`, `colline`, `ville` · `poly` · `densite`), `fleuves[]` (`points`).

## `lieux[]`
`id`, `nom`, `type` (`capitale`, `ville`, `ville-detruite`, `village`, `academie`, `lieu-dit`, `danger`, `port`, `caserne`…),
`pos` `[x,y]`, `ile`, `region`, `accroche`, `population`, `climat`, `dirigeant`, `description`, `histoire`, `images[]`,
`familles[]` (ids), `personnages[]` (ids), `tensions[]` (texte ou `{texte, mj}`),
`lieuxNotables[]` (`id`, `nom`, `type`, `utilite`, `description`, `pnj[]`, `secrets[]`),
`secrets[]` (`id`, `titre`, `texte`, `revele` — *MJ* tant que `revele` est faux).

## `routes[]`
`de`, `a` (ids de lieux), `type` (`route`, `piste`, `montagne`, `cotier`, `maritime`), `km` (distance canon),
`points` (tracé dessiné), `terrain` (`difficile`), `danger`.

## Personnages (`codex.personnages[]`)
`id`, `nom`, `titre`, `origine`, `race`, `statut`, `naissance`, `religion`, `portrait`, `galerie[]`, `description`,
`details[]` (texte ou `{texte, mj}`), `secrets[]`, `affiliations[]` (`gid`, `groupe`, `rang`, `mj`), `lieux[]`,
`mjOnly` (*MJ* : fiche entière), `source: "notion"` (ajoutée par la synchro).

## Chronologie (`codex.chronologie[]`)
`id` (stable), `date`, `annee`, `evenement`, `lieux[]`, `pays`, `mj` (*MJ*), `epoque` (`305`, `525`, `~1100`). Régénérée depuis la Chronologie maître Notion.
