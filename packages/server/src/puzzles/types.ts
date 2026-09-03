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
}
