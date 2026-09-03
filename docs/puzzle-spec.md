# Spécification des énigmes

Document de design. Lisible par tout le monde, y compris le propriétaire.
Il décrit la **grammaire**, jamais les instances.

---

## 1. Principe fondateur

La difficulté d'une énigme coopérative asymétrique ne vient **pas** de la
complexité logique. Elle vient de la **charge de communication** : la
difficulté à décrire à l'oral ce qu'on a sous les yeux.

Corollaires, à appliquer littéralement :

- Une énigme plus dure n'a pas plus d'étapes. Elle a des éléments plus
  difficiles à nommer.
- Ajouter du volume à transmettre ne rend pas une énigme plus intéressante,
  ça la transforme en dictée. C'est la mort du genre.
- La vraie progression du duo, c'est le **lexique privé** qu'il invente en
  jouant. Au bout de vingt minutes, ils ne disent plus « le symbole avec la
  boucle et les trois barres », ils disent « l'araignée ». Toute l'échelle
  de difficulté est construite autour de ce phénomène.

---

## 2. Les quatre primitives

Toute énigme du jeu est une combinaison de ces quatre briques. Ne pas en
inventer une cinquième sans validation.

### LEXIQUE
A voit des symboles sans signification. B possède leur sens.
Force la création de noms partagés.
Levier de difficulté : similarité visuelle entre glyphes, taille du jeu,
ambiguïté des descriptions possibles.

### TOPOLOGIE
A voit une structure (plan, graphe, circuit). B s'y déplace ou agit dedans
à l'aveugle.
Force un vocabulaire spatial et un repère commun.
Levier : absence de points de repère évidents, symétries trompeuses,
orientation non partagée entre les deux vues.

### SIMULTANÉITÉ
Les deux joueurs doivent agir dans la même fenêtre de temps. Pendant
l'exécution, la communication est inutilisable.
Force la planification complète avant l'action.
Levier : longueur de la séquence à mémoriser, étroitesse de la fenêtre.
**Jamais** de dextérité ou de temps de réaction. La contrainte est
cognitive, pas motrice.

### ÉTAT CROISÉ
L'action de A modifie ce que voit B, et réciproquement. Aucun des deux
n'a de vue stable.
Force un modèle mental du système plutôt qu'une lecture.
Levier : profondeur du couplage, délai entre cause et effet.
Primitive la plus coûteuse en charge mentale. À utiliser avec parcimonie.

---

## 3. L'échelle sur cinq salles

| Salle | Primitives | Rôle pédagogique |
|---|---|---|
| 1 | LEXIQUE seul | Apprendre à nommer. Correspondance 1:1, aucune pression temporelle, 6 à 7 glyphes maximum. |
| 2 | TOPOLOGIE seule | Apprendre à décrire l'espace. Aucun glyphe, on ne mélange pas encore. |
| 3 | LEXIQUE + TOPOLOGIE | Réutilise **les glyphes exacts de la salle 1**. Le duo doit sentir qu'il applique au lieu de redécouvrir. Pic de plaisir attendu. |
| 4 | SIMULTANÉITÉ sur acquis | Zéro vocabulaire neuf. Toute la difficulté est dans l'obligation de tout planifier d'avance. |
| 5 | INVERSION | Les rôles s'échangent, ou le lexique appris change de sens. Teste si l'automatisme est devenu compréhension ou par cœur. Capstone. |

Règle de continuité : **tout élément de lexique introduit en salle 1 doit
réapparaître au moins une fois plus tard.** Un glyphe utilisé une seule fois
est du bruit.

Règle d'inversion (salle 5) : le retournement doit être *déductible*, pas
arbitraire. Le duo doit pouvoir comprendre la nouvelle règle en deux ou
trois essais à partir de ce qu'il sait déjà. Un retournement qui exige de
tout réapprendre est une punition, pas un climax.

---

## 4. Contraintes dures

Non négociables. Une énigme qui en viole une est rejetée, quelle que soit
son élégance.

**C1 — Budget de communication.** Au plus **15 éléments discrets** à
transmettre pour résoudre une énigme. Un élément discret = une unité
d'information qui doit passer d'une bouche à une oreille (un glyphe, une
coordonnée, une couleur, une direction). Au-delà, c'est de la dictée.

**C2 — Coût d'échec ≤ 5 secondes.** Pas de reset de salle, pas de séquence
à rejouer depuis le début, pas de timer punitif. Une énigme exigeante n'est
supportable que si elle autorise beaucoup de tentatives. L'erreur doit être
informative : rate un essai et tu apprends quelque chose.

**C3 — Asymétrie stricte.** Aucune des deux vues ne permet seule de
résoudre. Test formel en section 4 de `CLAUDE.md`.

**C4 — Zéro dextérité.** Aucune contrainte de précision de souris, de
vitesse de clic ou de temps de réaction. Y compris dans SIMULTANÉITÉ, où
la fenêtre est large (≥ 3 secondes) et où c'est la planification qui est
difficile.

**C5 — Zéro culture générale.** Pas de connaissance externe requise :
langues, mythologie, dates, références. Tout ce qui est nécessaire est
dans les deux vues.

**C6 — Pas de pixel hunting.** Aucune information cachée qui demande
d'inspecter l'écran à la recherche d'un détail. L'information est visible ;
c'est son *interprétation* qui est le problème.

**C7 — Une énigme = une idée.** Si tu ne peux pas décrire le cœur d'une
énigme en une phrase, elle est trop chargée. Découpe-la.

---

## 5. Métriques à produire

Chaque module implémente `metrics(instance)` :

```ts
interface PuzzleMetrics {
  discreteElements: number;   // unités d'info à transmettre (contrainte C1)
  exchanges: number;          // allers-retours de communication estimés
  solutionDepth: number;      // longueur de la solution optimale
  branchingFactor: number;    // actions possibles par étape en moyenne
  estimatedMinutes: [number, number];
}
```

Cibles indicatives par salle :

| Salle | discreteElements | exchanges | minutes |
|---|---|---|---|
| 1 | 5-7 | 5-8 | 2-4 |
| 2 | 6-9 | 8-12 | 3-5 |
| 3 | 9-13 | 10-15 | 5-8 |
| 4 | 8-12 | 12-18 | 4-7 |
| 5 | 10-15 | 12-20 | 5-9 |

Total visé : ~25 min. Si la somme dérive au-delà de 32 min, coupe dans la
salle 4 avant de toucher aux autres.

---

## 6. Anti-patterns

À rejeter systématiquement.

- **La liste.** « A lit 20 symboles, B les note. » Volume déguisé en
  difficulté. Viole C1.
- **Le mur de patience.** Une seule erreur remet tout à zéro. Viole C2.
- **Le devinage.** La règle n'est pas déductible, il faut tomber dessus.
  Une bonne énigme se comprend rétrospectivement en une phrase.
- **La fausse asymétrie.** B pourrait résoudre seul si on lui montrait
  l'écran de A. Viole C3.
- **Le goulot.** Un seul joueur réfléchit, l'autre lit à voix haute. Les
  deux doivent avoir des décisions à prendre.
- **Le glyphe indescriptible.** Un symbole que personne ne peut nommer sans
  faire un dessin. Difficile n'est pas ambigu au point d'être aléatoire.

---

## 7. Habillage

Thème v1 : **fantasy horrifique**. Voir `docs/world-bible.md` pour le ton
et le vocabulaire autorisés.

Contrainte de séparation : **la mécanique est écrite avant l'habillage.**
Une énigme doit être fonctionnelle et testée en présentation neutre, puis
habillée. Si l'habillage est nécessaire pour comprendre la mécanique, la
mécanique n'est pas claire.

L'habillage ne doit jamais ajouter de charge de communication. Un nom
imprononçable pour une salle est un coût réel dans un jeu où l'on parle.
