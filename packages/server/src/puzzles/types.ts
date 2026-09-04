import type { Action, PuzzleMetrics, Role, View } from "@coop/shared";

/**
 * Contrat d'un module d'enigme. CLAUDE.md section 3.
 *
 * Ce fichier vit cote serveur et doit y rester : il declare `solve`, et
 * `solve` dans le bundle client, c'est le jeu perdu. La frontiere est
 * verifiee par src/test/frontiere.test.ts.
 *
 * Deux ecarts par rapport a la signature litterale de CLAUDE.md section 3,
 * tous deux documentes dans DECISIONS.md (D14 et D19) :
 * `applyAction` renvoie un retour d'action, et `solve` etiquette chaque
 * action du role qui la joue.
 */

/** Ce que le serveur repond a l'auteur d'une intention. */
export interface Feedback {
  kind: "accepted" | "rejected";
  /**
   * Contrainte C2 de docs/puzzle-spec.md : un echec doit apprendre quelque
   * chose. Le motif du refus, jamais la reponse.
   */
  hint?: string;
}

export interface ActionOutcome<I> {
  instance: I;
  feedback: Feedback;
}

/** Une action et le role qui la joue. */
export interface PlannedAction {
  role: Role;
  action: Action;
}

export interface PuzzleModule<I> {
  id: string;

  /** Deterministe : meme seed, meme instance. */
  generate(seed: string): I;

  /**
   * Le filtre. Tout ce qui n'apparait pas ici ne quitte jamais le serveur —
   * y compris ce qu'un joueur pourrait en DEDUIRE.
   */
  viewFor(role: Role, instance: I): View;

  applyAction(instance: I, role: Role, action: Action): ActionOutcome<I>;

  isSolved(instance: I): boolean;

  /** Tests uniquement. */
  solve(instance: I): PlannedAction[];

  /**
   * Toutes les intentions que l'interface propose depuis cet etat, refus
   * compris. Ce n'est PAS une liste de bons coups : c'est l'espace dans lequel
   * un joueur peut taper au hasard.
   *
   * Sans elle, l'obligation de rejet (CLAUDE.md section 4, obligation 2) ne
   * peut pas etre verifiee par un harnais generique — il n'aurait aucun moyen
   * de tirer une action au sort. Elle sert aussi a mesurer le facteur de
   * branchement plutot qu'a l'estimer.
   */
  actionsPossibles(instance: I): PlannedAction[];

  metrics(instance: I): PuzzleMetrics;

  /**
   * Instances distinctes produisant EXACTEMENT la meme vue pour `role`.
   *
   * C'est la preuve constructive du test d'asymetrie (CLAUDE.md section 4,
   * obligation 3). Chercher deux instances ambigues parmi des seeds tires au
   * hasard ne marche que tant que l'espace des instances est minuscule ; ici
   * le module fabrique le temoin, donc la preuve ne depend pas de la chance.
   */
  ambiguites(role: Role, instance: I): I[];

  /**
   * Le RESIDU : jusqu'a `plafond` instances distinctes, celle-ci comprise,
   * dont la vue pour `role` est identique au caractere pres.
   *
   * `ambiguites` repond « il en existe au moins deux » ; ce n'est pas la meme
   * question. Personne ne joue au hasard : la menace n'est pas la victoire
   * fortuite, c'est le joueur qui deduit. Ce qui compte est donc COMBIEN de
   * mondes lui restent une fois sa vue epuisee, et si les essayer un par un
   * coute plus cher que de parler a son partenaire.
   *
   * Deux proprietes du contrat :
   *
   * - la liste est bornee par `plafond` — un residu de plusieurs milliers ne
   *   s'enumere pas, et un plancher ne demande qu'un « au moins N » ;
   * - elle peut ne decrire qu'une PARTIE de la classe d'equivalence. Un module
   *   fait varier ce qu'il sait faire varier ; il n'est jamais tenu d'exhiber
   *   tout ce que le role ignore. Le compte est donc une minoration, ce qui
   *   est le bon sens de l'erreur pour un plancher.
   *
   * Le harnais ne fait pas confiance a ce qui sort d'ici : il verifie que
   * chaque instance rendue a bien la meme vue, qu'elles sont deux a deux
   * distinctes, et que chacune est resoluble. Un module ne peut donc pas
   * gonfler son residu en fabriquant des objets qui ne tiennent pas debout.
   */
  candidats(role: Role, instance: I, plafond: number): I[];
}
