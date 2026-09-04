import type { PuzzleDefinition } from "../content/types";
import { creerModuleLexique } from "./lexicon";
import { creerModuleReleve } from "./releve";
import { creerModuleTopologie } from "./topologie";
import type { PuzzleModule } from "./types";

/**
 * Registre des modules d'enigmes (docs/architecture.md section 1).
 *
 * La cle est le champ `module` de la definition. Le registre est STATIQUE :
 * pas d'import dynamique construit a partir d'une chaine venue d'un fichier
 * de contenu. Une definition qui reference un module inconnu doit echouer au
 * chargement, pas resoudre un chemin arbitraire.
 */

/**
 * Un module dont le type d'instance est efface. La room manipule des
 * instances sans jamais avoir a connaitre leur forme — c'est le module qui
 * sait, et lui seul.
 */
export type OpaquePuzzleModule = PuzzleModule<any>;

type Fabrique = (definition: PuzzleDefinition) => OpaquePuzzleModule;

const REGISTRE: Record<string, Fabrique> = {
  "src/puzzles/lexicon/index.ts": creerModuleLexique,
  "src/puzzles/topologie/index.ts": creerModuleTopologie,
  "src/puzzles/releve/index.ts": creerModuleReleve,
};

/** Les chemins de module acceptes. Sert aux messages d'erreur et aux tests. */
export function modulesConnus(): string[] {
  return Object.keys(REGISTRE);
}

export function chargerModule(
  definition: PuzzleDefinition,
): OpaquePuzzleModule {
  const fabrique = REGISTRE[definition.module];
  if (!fabrique) {
    throw new Error(
      `Definition "${definition.id}" : module inconnu "${definition.module}". ` +
        `Modules enregistres : ${modulesConnus().join(", ")}`,
    );
  }
  return fabrique(definition);
}
