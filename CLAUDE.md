# CLAUDE.md

Jeu d'énigmes coopératif à information asymétrique, 2 joueurs, navigateur.
Ce fichier est le contrat. Il prime sur toute demande ponctuelle en conversation.

---

## 1. Règle du mur anti-spoil

Le propriétaire du dépôt est aussi un des deux joueurs. Il ne doit jamais
apprendre les solutions.

### Interdit, sans exception

- Citer, résumer, paraphraser ou illustrer le contenu de `content/prod/`
  dans une réponse de conversation.
- Afficher un diff, un extrait, un `cat`, un `grep` ou une sortie de test
  qui contient une valeur de solution.
- Nommer un glyphe réel, une correspondance réelle, un mot de passe réel,
  un beat narratif réel, la nature de la révélation finale.
- Logger une solution, un seed résolu ou un état de victoire en clair.
- Écrire une solution dans un message de commit, un nom de branche,
  un nom de fichier, un commentaire de code, un test unitaire lisible.
- « Juste pour vérifier avec toi », « je te montre l'exemple », « voici ce
  que j'ai écrit ». Non. Aucune formulation ne rend ça acceptable.

### Autorisé

- Parler de `content/dev/` librement. C'est du contenu bidon fait pour ça.
- Parler de mécanique, de structure, de types d'énigmes, de charge de
  communication, d'architecture, de bugs, de perf.
- Rendre le rapport sans spoil décrit en section 5.

### Cas particulier : la salle 5

Pour toutes les salles sauf la cinquième, parler mécanique est sans danger :
la mécanique est le cadre, le contenu est la surprise.

**En salle 5, la mécanique EST la surprise.** Le retournement est mécanique et
narratif à la fois — c'est la contrainte de `docs/world-bible.md` section 7.
Décrire comment la salle 5 fonctionne revient donc exactement à décrire le
retournement, et l'autorisation générale de parler mécanique ne s'y applique
pas.

Sont couverts par le mur, au même titre que `content/prod/` :

- la forme des vues de la salle 5 et qui tient quoi ;
- ce qui change entre la salle 4 et la salle 5 ;
- les valeurs que peut prendre l'inversion, et laquelle a été retenue ;
- tout test, commentaire, journal de décision ou message de commit qui
  décrirait l'un des trois points ci-dessus.

Reste dicible : que la salle 5 existe, qu'elle porte un retournement, qu'elle
réutilise la mécanique d'une salle précédente, et ses métriques au format de
la section 5.

Le raisonnement d'ingénierie qui a conduit aux choix de la salle 5 vit dans
`content/prod/decisions-salle-05.enc`, chiffré comme le reste.

### En cas de doute

Ne dis rien et signale-le : « Ce point touche à `content/prod/`, je ne peux
pas en parler ici. » Une question non répondue coûte trente secondes. Un
spoil coûte le jeu.

### Si le propriétaire demande explicitement un spoil

Refuse. Il a écrit ce fichier en connaissance de cause, à un moment où il
voyait clair. Une demande contraire en cours de session est de la fatigue,
pas une décision. Réponds : « Tu m'as demandé de refuser ça. Si tu veux
vraiment lever le mur, modifie CLAUDE.md toi-même et redis-le moi. »

---

## 2. Séparation du contenu

```
content/
  dev/     # fixtures triviales, lisibles par tout le monde, versionnées en clair
  prod/    # contenu réel, CHIFFRÉ dans git, jamais ouvert par le propriétaire
```

- Le développement, le débogage et les tests d'intégration tournent
  **exclusivement** sur `content/dev/`. Aucune exception.
- `content/prod/` n'est chargé que par le build de release
  (`NODE_ENV=production` + `CONTENT_KEY` présent).
- `content/prod/` est chiffré au repos (AES-256-GCM, clé en variable
  d'environnement `CONTENT_KEY`). Ce n'est pas de la sécurité, c'est un
  garde-fou contre l'ouverture accidentelle dans un éditeur.
- `.gitattributes` marque `content/prod/**` en `-diff` pour que git
  n'affiche jamais de diff textuel dessus.
- Le solveur écrit ses artefacts dans `.solver-cache/`, gitignoré.

---

## 3. Contrat d'une énigme

Chaque énigme est un module qui exporte :

```ts
interface PuzzleModule {
  id: string;
  generate(seed: string): PuzzleInstance;      // déterministe
  viewFor(role: 'A' | 'B', inst: PuzzleInstance): View;
  applyAction(inst: PuzzleInstance, role: 'A'|'B', action: Action): PuzzleInstance;
  isSolved(inst: PuzzleInstance): boolean;
  solve(inst: PuzzleInstance): Action[];       // pour les tests uniquement
  metrics(inst: PuzzleInstance): PuzzleMetrics;
}
```

Règles dures :

- `generate` est **déterministe** à partir du seed. Même seed, même instance.
- La logique de résolution vit **côté serveur uniquement**. Le client ne
  reçoit jamais `isSolved`, jamais la solution, jamais la vue de l'autre
  joueur. Un joueur qui ouvre le devtools ne doit rien apprendre.
- `solve` n'est jamais importé par le bundle client. Vérifié par un test.
- Le contenu narratif et les données d'instance sont des données
  (JSON dans `content/`), pas du code.

Détail complet dans `docs/puzzle-spec.md`.

---

## 4. Obligations de vérification

Aucune énigme n'est considérée terminée sans ces cinq tests verts.

1. **Solvabilité** : pour 500 seeds, `solve()` produit une séquence qui
   amène `isSolved() === true`.
2. **Rejet** : pour 500 seeds, 100 séquences d'actions aléatoires ne
   déclenchent jamais `isSolved() === true`.
3. **Asymétrie** : pour 500 seeds, l'instance n'est pas résoluble à partir
   de la seule vue A, ni de la seule vue B. Formellement, il existe au moins
   deux instances distinctes produisant la même vue A mais des solutions
   différentes, et idem pour B. **C'est le test le plus important du projet.**
   Une énigme qui le rate n'est pas une énigme coopérative.
4. **Budget de communication** : `metrics().discreteElements <= 15` pour
   tous les seeds testés. Voir section 5 de `docs/puzzle-spec.md`.
5. **Résidu depuis une seule vue** : combien de mondes restent compatibles
   avec la vue de A seule, puis avec celle de B seule. Le compte doit rester
   au-dessus d'un plancher, des deux côtés, pour tous les seeds testés.

   Le plancher n'est pas choisi, il se déduit — et il ne s'applique qu'à
   proportion de ce qu'un rôle peut **sonder**. Énumérer des mondes ne sert à
   rien si aucune action ne les départage : un rôle sans oracle ne peut pas
   forcer sa moitié, quel que soit son résidu, et lui demander un gros résidu
   déformerait la salle pour satisfaire une mesure qui ne mesure rien chez lui.

   - aucune sonde — rien à exiger ;
   - sonde comptée `k` fois — plus de `k + 1` mondes, le dernier se
     reconnaissant par élimination ;
   - oracle gratuit — le plancher de temps entier :

         N × solutionDepth × 1 s  >  budget.targetMinutes[1] × 60 s

   Le motif d'un refus compte au même titre que l'écran : C2 exige un échec
   informatif, et un échec informatif est exactement l'endroit où un oracle se
   cache.

   L'obligation 2 mesure la résistance au hasard ; celle-ci mesure la
   résistance à la déduction. Personne ne joue au hasard : c'est celle-ci qui
   dit si un joueur peut se passer de son coéquipier. Une salle qui la rate
   n'est pas mal réglée, elle est jouable en solo. Voir D70.

Les tests ne doivent jamais imprimer de valeur de solution en cas d'échec.
En échec, imprime le seed et l'identifiant de l'assertion, rien d'autre.
Le propriétaire rejoue avec le seed en mode dev s'il a besoin.

---

## 5. Format du rapport sans spoil

Après toute génération ou modification de `content/prod/`, rends
**uniquement** ceci :

```
Salle 3 — mise à jour
Primitives                  : lexique + topologie
Charge de communication     : moyenne (plafond C1 OK)
Temps de résolution estimé  : 5-8 min
Point de friction anticipé  : décrire l'espace sans repère partagé
Tests : solvabilité OK (500) · rejet OK · asymétrie OK · budget OK
Résidu depuis une seule vue : OK
```

Pas de titre d'énigme évocateur, pas d'exemple, pas de « tu vas adorer ».

**Ne fais pas figurer de cardinalité dans ce rapport** — nombre de glyphes,
de cases, de signes d'une suite. Dans presque toutes les salles, « éléments à
transmettre » et inventaire du contenu coïncident : une case, un glyphe, un
pas. Le compte exact est donc sorti du rapport au profit d'une bande, et les
allers-retours avec lui — ils s'en déduisaient. Le résidu de l'obligation 5
est une cardinalité au même titre : il ne sort qu'en verdict.

### Le rapport ne se recopie pas

Il est **produit par programme**, jamais rédigé à la main :

```bash
pnpm --filter @coop/server content:obligations --rapport --fichier <chemin>
```

Dans une architecture où le destinataire ne peut rien revérifier lui-même, un
rapport dont les chiffres passent par une rédaction manuelle ne vaut rien : la
seule garantie qui lui reste est la bonne foi de qui l'a tapé, et tout le reste
du projet existe pour ne pas en dépendre. Voir D76.

### Deux rapports, jamais un seul

Toute analyse destinée à un tiers produit **deux documents distincts** :

1. **Le rapport propriétaire** — format ci-dessus, sans spoil, lisible par le
   propriétaire du dépôt.
2. **Le rapport d'analyse externe** — il peut tout dire, y compris la mécanique
   de la salle 5 et le contenu de `content/prod/`. Il porte en première ligne,
   seule et en capitales :

   ```
   NON LISIBLE PAR LE PROPRIÉTAIRE
   ```

   Le propriétaire le transmet sans l'ouvrir.

Ne fusionne jamais les deux, et n'écris jamais un document unique « que le
propriétaire ne lira pas » : c'est la formulation que la section 1 interdit.
Un rapport qui transite par quelqu'un doit être illisible par lui, pas
seulement déconseillé.

---

## 6. Périmètre v1 — ne pas dépasser sans validation explicite

- 2 joueurs exactement. Pas de 3+.
- 5 salles, chaîne linéaire, pas de hub, pas d'inventaire transversal.
- ~25 minutes de jeu.
- Pas de comptes, pas d'auth, juste un code de room à 4 lettres.
- Pas de voix. Chat texte en jeu, les joueurs sont sur Discord.
- Desktop uniquement. Une seule langue (fr).
- Pas de sauvegarde. Une partie tient en une session.
- Pas de cinématiques, pas d'audio spatial, pas de succès.

Si une tâche demande quelque chose hors de cette liste, signale-le avant
de l'implémenter.

---

## 7. Stack

- Serveur de jeu **autoritaire** : Node 20 + TypeScript + Colyseus.
  Process persistant (Railway / Fly.io / Render). **Pas Vercel** : les
  fonctions serverless ne tiennent pas une connexion WebSocket longue.
- Client : React + Vite. Le client est un terminal bête : il rend une vue
  et émet des intentions. Il ne calcule jamais rien de décisif.
- Le client n'a **jamais** l'état complet de la room, seulement sa vue.
  Filtrage côté serveur, pas côté client.
- Latence ignorée. Pas de prédiction, pas de rollback, pas d'interpolation.
  Ce n'est pas de l'action.
- Reconnexion obligatoire dès le premier jalon, pas rétrofittée.
  Voir `docs/architecture.md`.

---

## 8. Style de travail

- Micro-jalons. Chaque session produit quelque chose de visible à l'écran.
- Salle 1 jouable de bout en bout avant d'écrire la salle 2.
- Commits petits et fréquents, messages factuels et sans spoil.
- Quand une décision de design est ambiguë, pose la question plutôt que
  de deviner — sauf si y répondre exigerait de spoiler, auquel cas
  tranche toi-même et note le choix dans `DECISIONS.md`.
