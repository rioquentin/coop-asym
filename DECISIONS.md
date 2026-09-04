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

## Jalon 3 — moteur d'énigmes, loader, harnais de vérification

### D19. `solve()` étiquette chaque action du rôle qui la joue

`CLAUDE.md` section 3 déclare `solve(inst): Action[]` et
`applyAction(inst, role, action)`. Ces deux signatures sont incompatibles
entre elles : le harnais qui rejoue une solution n'a aucun moyen de savoir
quel rôle joue quelle action. `solve` rend donc des `{ role, action }`.

Ce n'est pas un désaccord avec l'intention du contrat, c'est la seule lecture
qui le rende exécutable.

### D20. `ambiguites(role, instance)` entre au contrat

L'obligation 3 demande de prouver qu'il existe deux instances distinctes
produisant la même vue avec des solutions différentes. Chercher cette paire
parmi des seeds tirés au hasard ne marche que tant que l'espace des instances
est minuscule — c'est le cas de la fixture, ce ne sera pas le cas des vraies
salles.

Le module fabrique donc le témoin lui-même : même plateau et cible décalée
pour A, même registre et plateau décalé pour B. La preuve ne dépend plus de
la chance, et le test reste exact quelle que soit la taille de l'énigme.

Le harnais vérifie les deux : le témoin construit **et**, indépendamment, le
regroupement de 500 instances par vue.

### D21. `actionsPossibles(instance)` entre au contrat

Sans elle, l'obligation 2 n'est pas testable par un harnais générique : il
n'aurait aucun moyen de tirer une action au sort dans un espace qu'il ne
connaît pas. Elle sert aussi à **mesurer** le facteur de branchement au lieu
de l'estimer.

Elle liste ce que l'interface propose, refus compris — pas des bons coups.
Ce n'est pas un oracle de solution.

### D22. L'énoncé littéral de l'obligation de rejet est intenable

`CLAUDE.md` section 4 : « pour 500 seeds, 100 séquences d'actions aléatoires
ne déclenchent jamais `isSolved() === true` ». Ça fait 50 000 marches. Sur une
énigme à n cases, une marche au hasard tombe sur la bonne disposition avec une
probabilité de l'ordre de 1/n!.

**Mesuré sur la fixture (4 glyphes) : 162 victoires fortuites sur 50 000.**
En transposant par le rapport des factorielles, la salle 1 telle que la spec
la décrit (6 à 7 glyphes) en produirait de l'ordre de l'unité par exécution —
c'est-à-dire un test qui passe ou casse au hasard.

Le harnais vérifie donc la propriété que cet énoncé protège, et qui est plus
forte : **il n'existe aucun état gagnant en dehors du bon.** Chaque marche qui
atteint `isSolved()` doit produire exactement l'état que `solve()` produit.
Un `isSolved` trop permissif tombe ; le hasard, non.

Le compteur de victoires fortuites est affiché à chaque exécution : il dit à
quel point l'énigme résiste au hasard, ce qui est une information de design.

### D23. Le schéma JSON devient exécutoire

`schema/puzzle.schema.json` encode des contraintes dures — plafond C1 à 15,
`canAct` toujours vrai, `resetsPuzzle` toujours faux, coût d'échec ≤ 5 s. Un
schéma que personne ne fait tourner est un piège : il donne l'impression que
la règle est tenue.

Le loader valide chaque définition contre lui (ajv, draft 2020-12). Quatre
tests vérifient qu'une définition fautive est bien refusée.

Les erreurs de validation ne rapportent que le chemin et le motif, **jamais la
valeur fautive** : sur `content/prod`, une erreur bavarde serait un spoil.

### D24. Le registre des modules est statique

La définition porte un champ `module` qui est un chemin. Le résoudre par
import dynamique reviendrait à charger un fichier arbitraire nommé par une
donnée de contenu. Le registre est une table en dur ; un chemin inconnu
échoue au chargement.

### D25. `NODE_ENV=production` sans `CONTENT_KEY` refuse de démarrer

Le repli silencieux sur le contenu de développement servirait la fixture bidon
à de vrais joueurs. Mieux vaut un serveur qui ne démarre pas.

### D26. Le client apprend l'identifiant d'énigme du serveur

Le message `view` porte `puzzleId` ; le client le renvoie dans ses intentions
et n'en connaît aucun d'avance. Aucune constante d'énigme ne vit côté client,
donc la liste des salles ne fuit pas par le bundle.

### D27. La fixture est lue comme des paramètres, pas comme une instance figée

`content/dev/room-01.json` donne le jeu de glyphes, la légende, le
nombre de cases et un ordre canonique. `generate(seed)` tire de ce matériel
l'ordre d'affichage **et** l'ordre attendu. Sans ça, `generate` serait
constant et l'asymétrie n'aurait rien à faire varier.

### D28. `metrics()` décrit l'énigme, pas l'avancement

Les métriques sont mesurées depuis un plateau vide quel que soit l'état reçu :
un budget de communication qui diminue à mesure qu'on joue ne veut rien dire.

### D29. Pas de rechargement à chaud du contenu de développement

`docs/architecture.md` section 6 mentionne un hot reload de `content/dev`.
Les définitions sont mises en cache pour la durée du process ; un changement
de contenu demande un redémarrage. À faire si l'itération sur le contenu
devient pénible.

---

## Session 4 — salle 1

### D30. Les glyphes sont composés, pas tirés au hasard

Un glyphe est un **socle** plus une ou deux **marques**, prises dans un petit
vocabulaire de formes. Des tracés aléatoires tomberaient droit dans
l'anti-pattern de `docs/puzzle-spec.md` §6 : « le glyphe indescriptible, un
symbole que personne ne peut nommer sans faire un dessin ». Composé, un glyphe
se dit en une phrase — et c'est précisément le geste que le jeu demande.

Le vocabulaire de formes est public (`puzzles/lexicon/glyphes.ts`) ; quels
socles et quelles marques composent une salle donnée ne l'est pas.

`tropProches()` interdit deux glyphes qui ne diffèrent que d'une marque sur
le même socle : le duo passerait son temps à lever l'ambiguïté au lieu de
jouer.

### D31. Le contenu de la salle 1 est **tiré par un programme**, jamais écrit à la main

C'est ce qui rend le mur anti-spoil tenable dans cette configuration de
travail. Tout ce que j'écris passe par un transcript que le propriétaire peut
relire ; du contenu écrit à la main y serait visible, quelle que soit ma bonne
volonté. `outils/generer-salle-01.ts` tire donc le contenu depuis
`crypto.randomBytes` au moment de l'exécution, le valide, le fait passer par
les quatre obligations, puis le chiffre.

**Le clair n'existe que dans la mémoire du process.** Il n'est jamais écrit sur
disque, jamais affiché. Personne ne le connaît — moi pas plus que toi.

Ce que le fichier générateur dit de la salle 1 est le cahier des charges, pas
le contenu : primitive LEXIQUE seule, 6 à 7 glyphes, 2 à 4 minutes. Le
vocabulaire de significations est copié de `docs/world-bible.md` §4, qui est
public ; quels mots sont retenus et à quel glyphe ils vont ne l'est pas.

### D32. Un seul nom logique par salle

`content/dev/room-01-fixture.json` devient `content/dev/room-01.json`, et
`CHAINE_DES_SALLES` porte `"room-01"`. Le loader choisit la fixture ou le
contenu chiffré selon le mode ; le reste du code ignore lequel il joue. Sans
ça, la chaîne des salles devrait exister en deux exemplaires.

### D33. Les obligations sont partagées entre les tests et l'outil

`puzzles/obligations.ts` est appelé par `verification.test.ts` **et** par
`content:verifier`. Le contenu réel doit passer exactement les mêmes
contrôles que la fixture, et un contrôle qui existe en deux exemplaires finit
par diverger — ici la divergence serait invisible, puisque personne ne peut
relire le contenu réel.

### D34. La `CONTENT_KEY` n'est jamais affichée

`content:cle` l'écrit dans `.env` (gitignoré) et n'en dit que l'emplacement.
Une clé qui passe par un terminal finit dans un historique. Le générateur
refuse d'écraser une salle existante sans `--remplacer` : sans la clé
d'origine, un contenu chiffré est définitivement perdu.

### D35. La salle 1 n'a pas d'habillage — et ce n'est pas un oubli

**C'est le point à trancher.** `dressing.ambientText` et `roomLabel` sont
absents de la salle 1, et la trame narrative des cinq salles n'est pas écrite.

La raison est structurelle, pas technique. Un tirage aléatoire peut produire
des glyphes et une correspondance ; il ne peut pas produire une trame
narrative et un retournement *déductible* (`docs/puzzle-spec.md` §3 :
« le retournement doit être déductible, pas arbitraire »). Cette prose doit
être écrite. Et tout ce que j'écris passe par un transcript que tu peux relire
— donc l'écrire ici la brûle.

`CLAUDE.md` §1 est explicite : « Aucune formulation ne rend ça acceptable ».
Je ne contourne pas la règle en écrivant quand même en te demandant de ne pas
regarder.

Ce qui est fait respecte d'ailleurs la doctrine du projet : `puzzle-spec.md`
§7 impose que « la mécanique soit écrite avant l'habillage ». La salle 1 est
mécaniquement complète et vérifiée. Il lui manque sa peau.

Options, par ordre de préférence :

1. **Un canal séparé.** Je génère la trame dans un process dont tu ne lis pas
   la sortie — un agent lancé en tâche de fond dont le rapport est chiffré
   directement dans `content/prod`, sans repasser par la conversation. C'est
   faisable, mais demande que tu t'engages à ne pas ouvrir ce transcript.
2. **Un tiers l'écrit.** `PROMPT-KICKOFF.md` prévoit déjà un duo externe pour
   le QA ; la même personne peut écrire la trame. C'est la seule option où le
   secret est réellement garanti.
3. **Habillage procédural.** Je définis l'espace des retournements
   structurellement valides, le programme en tire un. Personne ne connaît le
   résultat — mais un retournement tiré au sort risque l'anti-pattern du
   devinage.

---

## Session 4 (suite) — la trame

### D36. La trame est écrite par un canal séparé

Option 1 de D35, retenue le 3 septembre 2026. Un agent lancé en tâche de fond
a écrit la trame des cinq salles, le retournement de la salle 5 et l'habillage
de la salle 1, puis les a chiffrés dans `content/prod`. Son rapport final
était contraint à six lignes sans contenu.

**La garantie est procédurale, pas technique**, et il faut le dire clairement :
le transcript de travail de cet agent contient la trame et se trouve sur le
disque. Ce qui protège le secret, c'est l'engagement du propriétaire à ne pas
l'ouvrir. Aucun mécanisme ne l'en empêche.

Ce qui est technique, en revanche : `content:habiller` déchiffre la salle **en
mémoire** et n'y ajoute que la clé `dressing`. L'auteur de la prose n'a donc
jamais vu la mécanique — les glyphes et leur sens restent inconnus de tout le
monde, y compris de lui.

### D37. La trame est contrôlée par programme, pas relue

`content:controler-trame` déchiffre en mémoire et ne rend que des verdicts :
cinq salles numérotées, un libellé et une ambiance par salle, aucune ambiance
au-dessus de 40 mots, une inversion parmi les deux formes implémentables,
au moins deux indices, une fin unique — plus deux contrôles lexicaux, l'absence
de vocabulaire de fantasy générique et l'absence de religion réelle nommée
(world bible §3 et §4).

C'est la seule façon de vérifier un texte que personne ne relira jamais. Un
contrôle à l'œil aurait supposé de le lire.

Le champ `inversion.mecanique` ne prend que deux valeurs,
`ROLES_ECHANGES` ou `LEXIQUE_INVERSE` : une session future implémentera la
salle 5 en lisant ce champ par programme, sans avoir à afficher le reste.

### D38. `roomAdvance` porte l'habillage

Le message était déclaré dans `docs/architecture.md` §5 avec le seul numéro de
salle. Il porte maintenant aussi `label` et `ambient`, envoyés à l'entrée en
`PLAYING` et rendus au retour d'un joueur déconnecté. Sans ça, l'habillage
existait dans le contenu chiffré mais n'atteignait jamais l'écran.

Il est identique pour les deux rôles : c'est du décor, pas de l'information.

### D39. Les sources en clair sont effacées, pas seulement supprimées

`content:chiffrer` et `content:habiller` écrasent le fichier source par du
bruit avant de le délier, et refusent une source située dans le dépôt — un
clair posé dans `content/` le temps d'un commit serait un clair de trop.

Ce n'est pas de la sécurité : un journal de système de fichiers peut en garder
trace. C'est le même garde-fou que le chiffrement de `content/prod`, rendre
l'ouverture accidentelle impossible.

---

## Salle 2 — TOPOLOGIE

### D40. Le plan est tiré à chaque partie, pas figé dans le contenu

La salle 1 fige sa correspondance glyphe/sens dans `content/prod` ; la salle 2
ne fige que des paramètres — taille, nombre de boucles, distance visée — et
construit son labyrinthe depuis le seed de la partie.

C'est mieux ici, et pour deux raisons. Une partie rejouée donne un autre plan,
donc personne ne peut l'apprendre par cœur. Et il n'y a rien à protéger dans
le contenu : le secret n'existe plus, au lieu d'être gardé.

### D41. Le jalon donne à A une action, pas seulement la parole

`schema/puzzle.schema.json` impose `canAct: true` pour les deux rôles, contre
l'anti-pattern du goulot. En topologie, A tient le plan et parle — sans plus,
il ne serait qu'une voix. Il peut donc poser un **jalon** sur une case ; B le
sent sous ses pieds en y passant.

C'est l'outil de désambiguïsation du duo quand deux endroits se ressemblent,
et c'est ce qui fait de A un joueur plutôt qu'un lecteur à voix haute.

### D42. B sait quand il est arrivé — sinon `sceller` devient un oracle

Tentation naturelle : que B ne perçoive que les murs, et que A doive déduire
son arrivée. Ça rend le sceau d'A vraiment risqué… et ça ouvre une porte
dérobée. A pourrait faire errer B au hasard en scellant après chaque pas : le
refus lui dirait « pas encore », l'acceptation « c'est là ». Seize cases,
seize essais, l'énigme contournée. C'est l'anti-pattern du devinage.

B sait donc qu'il est sur le dépôt quand il y est. Le sceau d'A confirme ce
que B vient d'annoncer, il ne le découvre pas — donc il n'apprend rien.

### D43. Le critère de rejet se mesure sur les champs que la solution touche

**Trouvé en faisant tourner l'obligation 2 sur un deuxième module.** Mon
critère comparait l'état gagnant atteint à l'état canonique **en entier**. En
topologie, une marche au hasard peut poser un jalon en chemin : l'état diffère
alors du canonique par un champ qui ne conditionne pas la victoire, et
77 seeds sur 500 étaient signalés à tort.

Le critère porte maintenant sur les seuls champs que `solve()` modifie —
déduits en comparant l'instance de départ à l'instance résolue. Ce que la
solution ne touche pas est incident par construction.

Un module dont l'instance porterait un champ décisif que `solve()` ne modifie
jamais échapperait encore à ce contrôle. Le cas est théorique ; il est noté
ici pour qu'il ne soit pas une surprise.

### D44. Chaque salle tire son instance d'un seed dérivé

Une partie a un seed ; la salle *n* utilise `<seed>-<n>`. Même partie rejouée,
mêmes salles dans le même ordre — et un seed loggé reste loggable, il ne
révèle rien sans les générateurs, qui sont côté serveur.

### D45. `room` entre dans l'état public

`docs/architecture.md` §2 prévoyait « salle courante » dans l'état partagé ;
le champ existait dans le document et pas dans le code. Il y est maintenant,
et le garde-fou des champs publics l'inclut.

### D46. Chaque vue déclare les champs qu'elle a le droit de porter

Le harnais vérifie, pour les 500 seeds et les deux rôles, que les clés d'une
vue sont exactement celles attendues. Ajouter un champ à une vue oblige donc à
l'ajouter aussi dans le test — c'est-à-dire à se demander une deuxième fois si
ce champ ne donne pas à un rôle ce qui appartient à l'autre.

---

## Salle 3 — LEXIQUE + TOPOLOGIE

### D47. La salle 3 reprend les glyphes de la salle 1 **et leur sens**

C'était la question ouverte. Tranchée seul, sans lire la trame.

`docs/puzzle-spec.md` §3 dit que la salle 3 « réutilise les glyphes exacts de
la salle 1 » et que « le duo doit sentir qu'il applique au lieu de
redécouvrir ». Rendre un sens neuf aux mêmes formes, c'est très exactement
redécouvrir — la continuité serait visuelle et vide.

Le second argument est structurel : si le retournement de la salle 5 porte sur
le lexique, il lui faut un lexique **stable** à retourner. Le déplacer dès la
salle 3 dépenserait le tour à mi-chemin et rendrait le climax arbitraire, ce
que la règle d'inversion interdit explicitement.

Les deux lectures mènent au même endroit, donc je n'ai pas eu besoin de savoir
laquelle des deux inversions a été retenue.

### D48. Le pont n'est sur aucun des deux écrans

A voit **où** l'on a gravé et l'ordre des significations attendues. B voit la
**forme** sous ses pieds. Ni l'un ni l'autre n'a la correspondance : elle est
dans leur tête depuis la salle 1.

C'est ce qui fait de cette salle autre chose qu'une salle 2 décorée. Et ce
n'est jamais un cul-de-sac : un duo qui a oublié peut retomber sur ses pieds
en essayant, au prix de quelques allers-retours — le coût d'échec reste nul
(C2), seul le temps se paie.

### D49. Plus de gravures que de relevés

Le contenu impose `releves < marques`. Si toutes les gravures devaient être
relevées, l'ordre suffirait et le lexique ne servirait à rien : B irait de
gravure en gravure. Les gravures inutiles sont ce qui oblige à **identifier**
une forme plutôt qu'à les visiter toutes.

### D50. Les champs décisifs sont trouvés par perturbation

Raffinement de D43, imposé par la salle 3. Le critère « les champs que
`solve()` modifie » y produisait encore des faux positifs : la solution
déplace B, mais une fois le relevé complet, A peut sceller même si B a bougé
— la position n'est donc pas décisive.

Un champ est maintenant réputé décisif si, en le remettant à sa valeur de
départ dans l'état gagnant, la victoire tombe. C'est déterminé par l'exécution,
pas par une heuristique.

Limite résiduelle : deux champs qui ne comptent qu'ensemble échapperaient au
test. Le cas est théorique, il est noté pour ne pas surprendre.

### D51. Un témoin d'ambiguïté doit être lui-même résoluble

Le harnais exige désormais qu'un témoin rendu par `ambiguites()` atteigne la
victoire via son propre `solve()`. Sans ça, un module pourrait rendre
n'importe quel objet ayant la bonne vue et passer l'obligation la plus
importante du projet. Un témoin qui ne tient pas debout ne prouve rien.

### D52. L'angle par échantillon ne s'applique que s'il mord

Le deuxième angle du test d'asymétrie — regrouper 500 instances par vue et
chercher une vue que plusieurs solutions produisent — ne dit plus rien dès que
l'espace des instances est grand : aucune collision ne se produit. C'est la
limite annoncée en D20, et la salle 3 l'a atteinte.

Le contrôle ne s'exécute donc que si des collisions existent. C'est
exactement pour ce cas que le témoin fabriqué existe, et pourquoi il est la
preuve principale plutôt qu'un filet de sécurité.

### D53. Un outil qui touche `content/prod` déclare son mode lui-même

`content:salle-03` écrit du contenu de production mais résolvait le lexique
dans le mode courant — donc la fixture, en développement. La salle écrite
n'aurait correspondu à rien.

`content:habiller` avait le même défaut, remonté par l'auteur de l'habillage :
il a dû exporter `NODE_ENV=production` à la main pour que la salle 3 charge.
Un outil qui ne travaille que sur du contenu chiffré ne doit pas dépendre de
ce que l'opérateur pense à exporter — c'est une panne silencieuse en
puissance, et sur un contenu que personne ne relit, silencieuse veut dire
définitive.

Les deux forcent maintenant `NODE_ENV=production` et vident le cache du loader
avant de construire quoi que ce soit.

Le fait que le même nom logique résolve la fixture en dev et le contenu réel
en prod reste voulu (D32) ; c'est à l'outil de dire dans quel monde il
travaille, pas à celui qui le lance.

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
