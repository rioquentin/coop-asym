import type { Glyphe } from "@coop/shared";
import { chargerDefinition } from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import { tracerGlyphe, type CompositionGlyphe } from "./lexicon/glyphes";

/**
 * La regle de continuite du lexique. docs/puzzle-spec.md section 3.
 *
 * « Tout element de lexique introduit en salle 1 doit reapparaitre au moins
 * une fois plus tard. » Les salles qui reprennent un lexique le reprennent
 * ENTIER — memes identifiants, memes traces, memes significations. Lui donner
 * un sens neuf reviendrait a redecouvrir, pas a appliquer. Voir D47.
 *
 * Le champ `reusesLexiconFrom` de la definition declare l'emprunt ; c'est ici
 * qu'il s'applique.
 */

export interface Lexique {
  glyphes: Glyphe[];
  /** Glyphe -> signification. */
  sensDe: Map<string, string>;
}

export function reprendreLeLexique(
  definition: PuzzleDefinition,
  nomDeLaSalle: string,
): Lexique {
  const source = chargerDefinition(nomDeLaSalle);
  const contenu = (source.content ?? {}) as {
    glyphs?: string[];
    legend?: Record<string, string>;
    traces?: Record<string, CompositionGlyphe>;
  };

  if (!Array.isArray(contenu.glyphs) || !contenu.legend) {
    throw new Error(
      `Definition "${definition.id}" : la salle "${nomDeLaSalle}" ne porte pas de lexique.`,
    );
  }

  const glyphes = contenu.glyphs.map((id) => {
    const composition = contenu.traces?.[id];
    return composition ? { id, d: tracerGlyphe(composition) } : { id };
  });

  return {
    glyphes,
    sensDe: new Map(contenu.glyphs.map((id) => [id, contenu.legend?.[id] ?? id])),
  };
}
