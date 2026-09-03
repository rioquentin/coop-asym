import type { Primitive } from "@coop/shared";

/**
 * Definition d'une enigme, telle que decrite par schema/puzzle.schema.json.
 * Ce type et ce schema doivent rester d'accord : le loader valide chaque
 * definition contre le schema avant de la rendre.
 */

export interface RoleView {
  component: string;
  /** Toujours vrai : les deux joueurs doivent avoir des decisions a prendre. */
  canAct: true;
  /** Cles du bloc content visibles par ce role. */
  sees?: string[];
}

export interface PuzzleBudget {
  /** Contrainte dure C1. Plafond absolu du projet : 15. */
  maxDiscreteElements: number;
  targetExchanges?: number;
  targetMinutes: [number, number];
}

export interface PuzzleDefinition {
  id: string;
  room: number;
  primitives: Primitive[];
  /** Chemin du module qui l'implemente. Resolu par le registre. */
  module: string;
  roles: { A: RoleView; B: RoleView };
  budget: PuzzleBudget;
  reusesLexiconFrom?: string[];
  failure?: {
    costSeconds?: number;
    resetsPuzzle?: false;
    feedback?: "informative" | "binary";
  };
  dressing?: { ambientText?: string; roomLabel?: string };
  content?: Record<string, unknown>;
}
