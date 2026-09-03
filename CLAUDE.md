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

Aucune énigme n'est considérée terminée sans ces quatre tests verts.

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

Les tests ne doivent jamais imprimer de valeur de solution en cas d'échec.
En échec, imprime le seed et l'identifiant de l'assertion, rien d'autre.
Le propriétaire rejoue avec le seed en mode dev s'il a besoin.

---

## 5. Format du rapport sans spoil

Après toute génération ou modification de `content/prod/`, rends
**uniquement** ceci :

```
Salle 3 — mise à jour
Primitives      : lexique + topologie
Éléments à transmettre (médiane / p95) : 9 / 13
Temps de résolution estimé             : 5-8 min
Allers-retours de communication        : ~11
Point de friction anticipé             : description spatiale sous contrainte de temps
Tests : solvabilité OK (500) · rejet OK · asymétrie OK · budget OK
```

Pas de titre d'énigme évocateur, pas d'exemple, pas de « tu vas adorer ».

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
