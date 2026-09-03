# coop-asym

Jeu d'énigmes coopératif à information asymétrique. Deux joueurs, navigateur,
~25 minutes. Chacun voit une moitié du problème ; aucune des deux moitiés ne
suffit seule.

## Démarrer

Prérequis : Node ≥ 20 et pnpm.

```bash
pnpm install
pnpm dev
```

- Serveur de jeu : `ws://localhost:2567`
- Client : `http://localhost:5173`

Ouvrez deux onglets : le premier ouvre un dossier et lit son code à 4 lettres,
le second rejoint avec ce code.

## Scripts

| Commande | Effet |
|---|---|
| `pnpm dev` | serveur + client en parallèle |
| `pnpm dev:server` / `pnpm dev:client` | l'un ou l'autre |
| `pnpm typecheck` | TypeScript sur les trois paquets |
| `pnpm test` | tests d'intégration du serveur |
| `pnpm build` | build de production du client |

## Structure

```
packages/
  shared/   types du protocole, code de room, état public synchronisé
  server/   serveur autoritaire Colyseus — toute la logique de jeu
  client/   React + Vite — rend une vue, émet des intentions
content/
  dev/      fixtures triviales, lisibles
docs/       architecture, spécification des énigmes, bible de ton
schema/     JSON Schema d'une définition d'énigme
```

## À lire avant de contribuer

- [`CLAUDE.md`](CLAUDE.md) — le contrat. Règle du mur anti-spoil, contrat
  d'énigme, obligations de vérification, périmètre v1.
- [`docs/architecture.md`](docs/architecture.md) — serveur autoritaire, cycle de
  vie des rooms, reconnexion, protocole, jalons.
- [`docs/puzzle-spec.md`](docs/puzzle-spec.md) — les quatre primitives, les
  contraintes dures, les anti-patterns.
- [`DECISIONS.md`](DECISIONS.md) — choix d'implémentation tranchés en cours de
  route, avec leur raison.

## État

Jalon 1 fait : lobby, code de room à 4 lettres, 2/2 connectés, attribution des
rôles, reconnexion. Pas encore d'énigme — voir les jalons dans
`docs/architecture.md` section 7.
