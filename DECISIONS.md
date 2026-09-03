# Décisions

Choix tranchés sans validation préalable, avec leur raison. Ordre chronologique.
CLAUDE.md section 8 : ce fichier existe pour que ces choix soient discutables
plus tard plutôt qu'archéologiques.

---

## Jalon 1 — infrastructure et lobby

### D1. `@colyseus/sdk` et non `colyseus.js`

`colyseus.js` est resté sur la ligne 0.16 (schéma v3, dernière publication
octobre 2025). Le serveur 0.18 encode avec `@colyseus/schema` v5. Le client qui
correspond à la ligne 0.18 est `@colyseus/sdk`. Prendre `colyseus.js` aurait
donné un couple client/serveur désaccordé sur le format de fil.

### D2. `@colyseus/core` + `@colyseus/ws-transport`, pas le paquet `colyseus`

Le paquet parapluie `colyseus` tire `@colyseus/uwebsockets-transport`, qui
dépend de `uWebSockets.js` par dépôt git — pnpm refuse cette dépendance exotique
en sous-dépendance, et elle demanderait une chaîne de compilation native. Les
deux paquets directs donnent exactement ce qu'il nous faut, sans `@colyseus/auth`,
`monitor`, `playground` ni les pilotes Redis.

`express` est une dépendance directe explicite : `@colyseus/ws-transport`
l'importe au chargement, elle ne peut pas rester implicite.

### D3. `schema()` plutôt que les décorateurs `@type`

`@colyseus/schema` v5 propose les deux styles pour un format de fil identique.
Les décorateurs exigent `experimentalDecorators` et `useDefineForClassFields: false`,
qui vont contre les réglages par défaut d'esbuild et de Vite — donc contre tsx
et contre le bundler du client. `schema()` ne demande aucune configuration de
compilateur.

### D4. `GameState` vit dans `@coop/shared`

L'état **public** est un contrat partagé : le serveur l'écrit, le client le
décode. Le mettre dans `shared` et le passer en `rootSchema` au SDK supprime
tout `any` côté client et rend la frontière vérifiable — un test échoue si un
champ non public apparaît dans l'état synchronisé.

Ça ne perce pas la règle d'or : `shared` ne contient que la **forme** de l'état
public, jamais une instance d'énigme, jamais une vue, jamais `solve`.

### D5. Le balayage des rooms mortes est porté par la room

`docs/architecture.md` section 3 demande un balayage périodique des rooms
orphelines dès le jalon 1. Plutôt qu'un balayeur global, chaque room arme son
propre minuteur de destruction à chaque changement de phase (`armTtl`). Le
minuteur naît et meurt avec la room, donc il ne peut pas exister de room
orpheline qu'un balayeur aurait oubliée — le mode de panne du balayage global
(la room que personne ne visite) n'existe pas ici.

`autoDispose` est désactivé : il détruirait une room `PAUSED` instantanément,
puisqu'elle n'a alors plus aucun client connecté.

### D6. `onDrop` / `onReconnect` / `onLeave`

Colyseus 0.18 sépare la déconnexion subie (`onDrop`) du départ définitif
(`onLeave`), avec `onReconnect` au retour. Ça correspond exactement au vocabulaire
de `docs/architecture.md` : `onDrop` fige la partie en `PAUSED` et ouvre la
fenêtre de reconnexion, `onLeave` acte la perte et détruit la room.

Une partie commencée ne se recompose pas : perdre un rôle détruit la room. En
`WAITING` au contraire, la place se libère simplement.

### D7. Reconnexion câblée dès le jalon 1

`CLAUDE.md` section 7 l'exige dès le premier jalon ; `docs/architecture.md`
section 7 la place au jalon 3. J'ai suivi CLAUDE.md, qui prime : le jeton, la
fenêtre de 300 s et la restauration du rôle sont en place et testés. Ce qui
reste au jalon 3, c'est la restauration de l'**état de jeu** (progression dans
l'énigme, historique du chat) — il n'existe pas encore.

### D8. Pas de message `partner`

`docs/architecture.md` section 5 prévoit un message serveur
`{ t: 'partner', status }`. L'état public porte déjà `connected` par joueur, et
le client en dérive le statut du partenaire. Envoyer les deux, ce serait deux
sources de vérité pour la même information. Le variant reste déclaré dans le
protocole ; il sera câblé s'il devient utile.

### D9. Pas de `<StrictMode>` côté client

En développement, StrictMode monte les effets deux fois. Avec une room à deux
places, un même joueur consommerait les deux sièges au premier rendu. Le
compromis est assumé : on perd le détecteur d'effets non idempotents de React.

### D10. Attribution des rôles à l'entrée en `PLAYING`, dans l'ordre d'arrivée

`docs/architecture.md` section 3 fige les rôles à l'entrée en `PLAYING` sans
dire comment les attribuer. Premier arrivé = A. C'est déterministe et
inspectable ; si le jeu demande un jour un tirage au sort, c'est une ligne.

### D11. Les rooms sont privées

`setPrivate(true)` : on ne rejoint que par code dicté, jamais par listing. Le
périmètre v1 n'a pas de lobby public.

### D12. `@coop/shared` est consommé en source

Pas d'étape de build : `main` pointe sur `src/index.ts`. tsx et Vite compilent
le TypeScript du paquet lié comme le reste des sources. Un build intermédiaire
n'apporterait qu'une étape de plus à garder synchronisée.

---

## Jalon 2 — boucle réseau

### D13. L'énigme bidon n'est pas un `PuzzleModule`

`packages/server/src/puzzles/demo.ts` expose `generate` / `viewFor` /
`applyAction` / `isSolved`, mais ni `solve`, ni `metrics`, ni génération par
seed. Le jalon 2 doit prouver la plomberie, pas préfigurer le moteur : écrire
un `solve()` pour une énigme à deux boutons produirait un contrat validé
contre un cas qui n'exerce rien. Le moteur et ses quatre obligations de
vérification arrivent au jalon 3.

### D14. `applyAction` renvoie un retour d'action, pas seulement une instance

**Point à trancher pour le jalon 3.** Le contrat de `CLAUDE.md` section 3 dit :

```ts
applyAction(inst: PuzzleInstance, role: 'A'|'B', action: Action): PuzzleInstance;
```

Cette signature ne peut pas porter la contrainte C2 de `docs/puzzle-spec.md`
(« l'erreur doit être informative : rate un essai et tu apprends quelque
chose »). Avec elle, un refus est indiscernable d'une action sans effet, et le
motif du refus n'a nulle part où passer — or c'est le module qui le connaît,
pas la room.

Le module démo renvoie donc `{ instance, feedback }`. Si le jalon 3 garde la
signature de CLAUDE.md, le feedback informatif devra venir d'ailleurs, et je ne
vois pas d'où. À arbitrer avant d'écrire le moteur.

### D15. La vue de A est constante et vide

A ne reçoit que `{ kind: "button" }`. Pas de compteur de pressions : sa parité
donnerait l'état de la lampe. C'est la démonstration en miniature de ce que
`viewFor` doit garantir — une vue ne fuit pas seulement par ce qu'elle dit,
mais par ce qu'on peut en déduire.

Conséquence assumée : la vue de A ne change jamais, donc A n'a pour retour que
le `feedback` de ses propres gestes.

### D16. Un seul type de message Colyseus par sens

Tout ce qui va du client au serveur passe par le type `"c"`, tout ce qui en
revient par `"s"`, chacun portant l'union déclarée dans
`docs/architecture.md` section 5. L'alternative — un type Colyseus natif par
variante — éparpillerait le protocole documenté dans les chaînes de caractères
du code. Un seul point de sortie vers un client (`sendTo`) rend aussi le
garde-fou anti-fuite vérifiable d'un coup d'œil.

### D17. Le garde-fou anti-fuite a été vérifié par injection

Le test « ne laisse jamais fuir l'état de la lampe vers A » enregistre **tout**
ce que le serveur envoie à A, via le joker `onMessage("*")` — que le SDK
n'appelle que faute de gestionnaire spécifique, donc rien ne lui échappe.

Un test de non-fuite qui ne peut pas échouer est un décor. J'ai ajouté `lit` à
la vue de A pour vérifier qu'il passait bien au rouge, puis remis en état.

### D18. La frontière est vérifiée sur le graphe d'imports, pas sur le bundle

`frontiere.test.ts` lit les sources du client et de `shared` et échoue si l'une
importe `@coop/server`, `content/prod` ou un module d'énigme. Inspecter le
bundle après `vite build` détecterait la même faute plus tard, plus lentement,
et seulement si le build tourne. Le graphe d'imports la détecte à l'écriture.

Le bundle a tout de même été vérifié à la main une fois : ni `isSolved`, ni
`applyAction`, ni `confirmed`, ni `content/prod`.

---

## Environnement

- **pnpm** n'était pas installé et `corepack enable` demande l'élévation sous
  Windows. Installé en portée utilisateur (`npm i -g pnpm`), réversible par
  `npm rm -g pnpm`.
- **`allowBuilds`** dans `pnpm-workspace.yaml` autorise les scripts de build
  d'`esbuild` (binaire requis par tsx et Vite) et de `msgpackr-extract`
  (accélérateur natif de Colyseus). pnpm bloque tout le reste par défaut.
- **Node** : la machine tourne en v24, `CLAUDE.md` section 7 dit Node 20. Le
  champ `engines` accepte `>=20`. À aligner si le déploiement impose 20.
