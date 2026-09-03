import type { Role } from "@coop/shared";
import type { PuzzleDefinition } from "../content/types";
import type { OpaquePuzzleModule } from "./registry";
import { rngDepuis } from "./rng";
import type { PlannedAction } from "./types";

/**
 * Les quatre obligations de verification. CLAUDE.md section 4.
 *
 * Ce module est partage par la suite de tests et par l'outil en ligne de
 * commande qui verifie le contenu de production. C'est volontaire : le
 * contenu reel doit passer EXACTEMENT les memes controles que la fixture,
 * sans qu'aucun de ces controles n'ait besoin d'afficher ce qu'il a lu.
 *
 * Regle absolue : rien de ce qui sort d'ici ne cite une valeur. Un echec est
 * un identifiant d'assertion et un seed, point.
 */

const ROLES: readonly Role[] = ["A", "B"];
/** Plafond absolu du projet, contrainte C1. */
export const PLAFOND_C1 = 15;

export interface ResultatObligations {
  solvabilite: boolean;
  rejet: boolean;
  asymetrie: boolean;
  budget: boolean;
  seedsTestes: number;
  tiragesParSeed: number;
  /**
   * Marches au hasard ayant atteint la victoire. Un compteur, pas une valeur :
   * il dit a quel point l'enigme resiste au hasard. Voir D22.
   */
  victoiresFortuites: number;
  /** « [assertion] seed=... ». Jamais autre chose. */
  echecs: string[];
  metriques: {
    discreteElementsMediane: number;
    discreteElementsP95: number;
    exchanges: number;
    solutionDepth: number;
    branchingFactor: number;
    minutes: [number, number];
  };
}

/** JSON a cles triees : deux valeurs equivalentes donnent la meme chaine. */
export function stable(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : v,
  );
}

/** Jeu de seeds reproductible. */
export function seedsDeVerification(nombre: number, prefixe = "verif"): string[] {
  return Array.from({ length: nombre }, (_, i) => `${prefixe}-${i}`);
}

function centile(valeurs: number[], fraction: number): number {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(
    triees.length - 1,
    Math.max(0, Math.ceil(fraction * triees.length) - 1),
  );
  return triees[rang] as number;
}

function appliquer(
  enigme: OpaquePuzzleModule,
  depart: unknown,
  plan: PlannedAction[],
): unknown {
  let instance = depart;
  for (const etape of plan) {
    instance = enigme.applyAction(instance, etape.role, etape.action).instance;
  }
  return instance;
}

export function verifierObligations(
  enigme: OpaquePuzzleModule,
  definition: PuzzleDefinition,
  seeds: string[],
  tiragesParSeed = 100,
): ResultatObligations {
  const echecs: string[] = [];
  const note = (assertion: string, seed: string): void => {
    const ligne = `[${assertion}] seed=${seed}`;
    if (!echecs.includes(ligne)) echecs.push(ligne);
  };

  let solvabilite = true;
  let rejet = true;
  let asymetrie = true;
  let budget = true;
  let victoiresFortuites = 0;
  const elements: number[] = [];

  for (const seed of seeds) {
    const depart = enigme.generate(seed);

    // Determinisme : le socle de tout le reste.
    if (stable(enigme.generate(seed)) !== stable(depart)) {
      note("determinisme", seed);
      solvabilite = false;
    }

    // --- Obligation 1 : solvabilite -------------------------------------
    let instance: unknown = depart;
    for (const etape of enigme.solve(depart)) {
      const resultat = enigme.applyAction(instance, etape.role, etape.action);
      if (resultat.feedback.kind !== "accepted") {
        note("solvabilite/action-refusee", seed);
        solvabilite = false;
      }
      instance = resultat.instance;
    }
    if (!enigme.isSolved(instance)) {
      note("solvabilite", seed);
      solvabilite = false;
    }

    const metriques = enigme.metrics(depart);
    elements.push(metriques.discreteElements);

    // --- Obligation 2 : rejet -------------------------------------------
    // On verifie la propriete que l'enonce protege, et qui est plus forte :
    // il n'existe aucun etat gagnant en dehors du bon. Voir D22.
    //
    // « Le bon » se mesure sur les seuls champs que la solution modifie. Une
    // instance peut porter de l'etat incident — un jalon pose en chemin, par
    // exemple — qui ne conditionne pas la victoire ; l'exiger identique
    // reviendrait a refuser des parties gagnantes parfaitement legitimes.
    const canonique = appliquer(enigme, depart, enigme.solve(depart));
    const clesQuiComptent = Object.keys(
      canonique as Record<string, unknown>,
    ).filter(
      (cle) =>
        stable((canonique as Record<string, unknown>)[cle]) !==
        stable((depart as Record<string, unknown>)[cle]),
    );

    if (clesQuiComptent.length === 0) {
      // Une solution qui ne change rien ne prouve rien.
      note("rejet/solution-sans-effet", seed);
      rejet = false;
    }

    const empreinte = (etat: unknown): string =>
      stable(
        Object.fromEntries(
          clesQuiComptent.map((cle) => [
            cle,
            (etat as Record<string, unknown>)[cle],
          ]),
        ),
      );

    const attendu = empreinte(canonique);
    const longueur = 2 * metriques.solutionDepth;
    const rng = rngDepuis(`rejet-${seed}`);

    for (let tirage = 0; tirage < tiragesParSeed; tirage++) {
      let marche: unknown = depart;
      for (let pas = 0; pas < longueur; pas++) {
        const possibles = enigme.actionsPossibles(marche);
        const choix = possibles[rng.entier(possibles.length)] as PlannedAction;
        marche = enigme.applyAction(marche, choix.role, choix.action).instance;

        if (enigme.isSolved(marche)) {
          victoiresFortuites++;
          if (empreinte(marche) !== attendu) {
            note("rejet", seed);
            rejet = false;
          }
          break;
        }
      }
    }

    // --- Obligation 3 : asymetrie ---------------------------------------
    for (const role of ROLES) {
      const vue = stable(enigme.viewFor(role, depart));
      const solution = stable(enigme.solve(depart));

      const temoins = enigme
        .ambiguites(role, depart)
        .filter((voisin: unknown) => stable(enigme.viewFor(role, voisin)) === vue)
        .filter((voisin: unknown) => stable(enigme.solve(voisin)) !== solution);

      if (temoins.length === 0) {
        note(`asymetrie/${role}`, seed);
        asymetrie = false;
      }
    }

    // --- Obligation 4 : budget ------------------------------------------
    if (metriques.discreteElements > PLAFOND_C1) {
      note("budget/C1", seed);
      budget = false;
    }
    if (metriques.discreteElements > definition.budget.maxDiscreteElements) {
      note("budget/definition", seed);
      budget = false;
    }
  }

  const reference = enigme.metrics(enigme.generate(seeds[0] as string));

  return {
    solvabilite,
    rejet,
    asymetrie,
    budget,
    seedsTestes: seeds.length,
    tiragesParSeed,
    victoiresFortuites,
    echecs,
    metriques: {
      discreteElementsMediane: centile(elements, 0.5),
      discreteElementsP95: centile(elements, 0.95),
      exchanges: reference.exchanges,
      solutionDepth: reference.solutionDepth,
      branchingFactor: reference.branchingFactor,
      minutes: reference.estimatedMinutes,
    },
  };
}
