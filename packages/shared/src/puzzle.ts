/**
 * Ce que le CLIENT connait d'une enigme : sa vue et ses intentions.
 *
 * Le contrat complet du module (generate, solve, metrics...) vit cote serveur,
 * dans packages/server/src/puzzles/types.ts. Il ne doit jamais devenir
 * importable d'ici : `solve` dans le bundle client, c'est le jeu perdu.
 */

/** Les quatre primitives de docs/puzzle-spec.md section 2. */
export type Primitive =
  | "LEXIQUE"
  | "TOPOLOGIE"
  | "SIMULTANEITE"
  | "ETAT_CROISE";

/** Metriques exigees par docs/puzzle-spec.md section 5. */
export interface PuzzleMetrics {
  /** Unites d'information a transmettre d'une bouche a une oreille (C1). */
  discreteElements: number;
  /** Allers-retours de communication estimes. */
  exchanges: number;
  /** Longueur de la solution optimale. */
  solutionDepth: number;
  /** Actions legales par etape, en moyenne, le long de la solution. */
  branchingFactor: number;
  estimatedMinutes: [number, number];
}

// ---------------------------------------------------------------------------
// Primitive LEXIQUE
// ---------------------------------------------------------------------------

/**
 * Vue de A : les glyphes tels qu'il les voit, et les cases a remplir.
 *
 * `tray` est l'ordre d'AFFICHAGE, tire du seed. B ne le connait pas — c'est
 * exactement ce qui empeche B de produire seul la suite d'actions.
 */
export interface GridView {
  kind: "grid";
  /** Glyphes dans l'ordre ou A les voit. */
  tray: string[];
  /** Glyphe pose dans chaque case, ou null. */
  slots: (string | null)[];
}

/**
 * Vue de B : le sens des glyphes et la suite a reconstituer.
 *
 * Ne contient PAS `tray` : B ignore dans quel ordre A voit ses glyphes.
 */
export interface LegendView {
  kind: "legend";
  /** Paires glyphe -> signification, triees par glyphe. */
  legend: [string, string][];
  /** Suite de significations a obtenir, dans l'ordre des cases. */
  target: string[];
  /** Glyphe pose dans chaque case, ou null. B suit l'avancement. */
  slots: (string | null)[];
}

export type LexiconView = GridView | LegendView;

/**
 * Intentions du lexique.
 *
 * `place` designe le glyphe par sa position dans `tray`, pas par son nom :
 * une intention n'a de sens que depuis la vue de celui qui l'emet.
 */
export type LexiconAction =
  | { type: "place"; from: number; to: number }
  | { type: "clear"; slot: number }
  | { type: "validate" };

/**
 * Vue et action du jeu. Deviendront des unions quand une deuxieme primitive
 * arrivera (docs/puzzle-spec.md section 2).
 */
export type View = LexiconView;
export type Action = LexiconAction;
