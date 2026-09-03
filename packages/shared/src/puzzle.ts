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
 * Un glyphe tel que le client le recoit.
 *
 * `id` est opaque et n'est JAMAIS affiche quand un trace existe : la world
 * bible interdit de legender un glyphe, le duo doit inventer ses propres noms.
 * `d` est un trace SVG dans une boite 0 0 100 100.
 */
export interface Glyphe {
  id: string;
  d?: string;
}

/**
 * Vue de A : les glyphes tels qu'il les voit, et les cases a remplir.
 *
 * `tray` est l'ordre d'AFFICHAGE, tire du seed. B ne le connait pas — c'est
 * exactement ce qui empeche B de produire seul la suite d'actions.
 */
export interface GridView {
  kind: "grid";
  /** Glyphes dans l'ordre ou A les voit. */
  tray: Glyphe[];
  /** Glyphe pose dans chaque case, ou null. */
  slots: (Glyphe | null)[];
}

/**
 * Vue de B : le sens des glyphes et la suite a reconstituer.
 *
 * Ne contient PAS `tray` : B ignore dans quel ordre A voit ses glyphes.
 */
export interface LegendView {
  kind: "legend";
  /** Paires glyphe -> signification, triees par identifiant de glyphe. */
  legend: [Glyphe, string][];
  /** Suite de significations a obtenir, dans l'ordre des cases. */
  target: string[];
  /** Glyphe pose dans chaque case, ou null. B suit l'avancement. */
  slots: (Glyphe | null)[];
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

// ---------------------------------------------------------------------------
// Primitive TOPOLOGIE
// ---------------------------------------------------------------------------

export type Direction = "nord" | "est" | "sud" | "ouest";

export const DIRECTIONS: readonly Direction[] = [
  "nord",
  "est",
  "sud",
  "ouest",
];

/**
 * Vue de A : le plan complet, et pas B.
 *
 * A voit chaque mur et sait ou est le depot. Il ne sait PAS ou se trouve son
 * partenaire — c'est exactement ce qui l'empeche de dicter un chemin sans
 * avoir d'abord compris ce que l'autre lui decrit.
 */
export interface PlanView {
  kind: "plan";
  largeur: number;
  hauteur: number;
  /** Pour chaque case (index y * largeur + x), les cotes fermes. */
  murs: Direction[][];
  /** La case a atteindre. */
  depot: { x: number; y: number };
  /** Le jalon pose par A, s'il en a pose un. */
  jalon: { x: number; y: number } | null;
}

/**
 * Vue de B : ce qu'on percoit d'une case, et rien de plus.
 *
 * Ne contient ni plan, ni coordonnees. B sait quand il est arrive, jamais ou
 * il se trouve.
 */
export interface PosteView {
  kind: "poste";
  /** Les cotes par lesquels on peut sortir de la case courante. */
  ouvertures: Direction[];
  surLeDepot: boolean;
  surLeJalon: boolean;
}

export type TopologieView = PlanView | PosteView;

/**
 * Intentions de la topologie.
 * `avancer` est a B, `jalonner` et `sceller` sont a A.
 */
export type TopologieAction =
  | { type: "avancer"; direction: Direction }
  | { type: "jalonner"; x: number; y: number }
  | { type: "sceller" };

// ---------------------------------------------------------------------------

/** Vue et action du jeu, toutes primitives confondues. */
export type View = LexiconView | TopologieView;
export type Action = LexiconAction | TopologieAction;
