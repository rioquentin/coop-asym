import { DIRECTIONS, type Direction } from "@coop/shared";
import type { Rng } from "./rng";

/**
 * Le vocabulaire des lieux : creuser un plan, s'y reperer, y trouver son
 * chemin. Partage par toutes les enigmes qui portent la primitive TOPOLOGIE.
 *
 * Rien ici n'est du contenu : ce sont des lieux vides, sans marque et sans
 * depot. Ce qu'on y pose vit dans les modules.
 */

/** Un lieu : ses dimensions et, pour chaque case, ses cotes fermes. */
export interface Plan {
  largeur: number;
  hauteur: number;
  murs: Direction[][];
}

export const OPPOSE: Record<Direction, Direction> = {
  nord: "sud",
  est: "ouest",
  sud: "nord",
  ouest: "est",
};

/** y croit vers le bas : le nord retire une ligne. */
export const DELTA: Record<Direction, readonly [number, number]> = {
  nord: [0, -1],
  est: [1, 0],
  sud: [0, 1],
  ouest: [-1, 0],
};

export function voisin(
  plan: Pick<Plan, "largeur" | "hauteur">,
  case_: number,
  direction: Direction,
): number | null {
  const x = (case_ % plan.largeur) + (DELTA[direction][0] as number);
  const y = Math.floor(case_ / plan.largeur) + (DELTA[direction][1] as number);
  if (x < 0 || y < 0 || x >= plan.largeur || y >= plan.hauteur) return null;
  return y * plan.largeur + x;
}

export function enCoordonnees(
  plan: Pick<Plan, "largeur">,
  case_: number,
): { x: number; y: number } {
  return { x: case_ % plan.largeur, y: Math.floor(case_ / plan.largeur) };
}

/** Trie les cotes dans l'ordre canonique, pour que deux vues egales le soient. */
export function ordonner(cotes: Iterable<Direction>): Direction[] {
  const presents = new Set(cotes);
  return DIRECTIONS.filter((d) => presents.has(d));
}

/**
 * Creuse un labyrinthe par parcours en profondeur, puis abat quelques murs en
 * plus. Les boucles sont ce qui rend deux endroits indiscernables — donc ce
 * qui force le duo a se decrire l'espace au lieu de deviner.
 */
export function creuser(
  largeur: number,
  hauteur: number,
  boucles: number,
  rng: Rng,
): Direction[][] {
  const total = largeur * hauteur;
  const bornes = { largeur, hauteur };
  const murs = Array.from(
    { length: total },
    () => new Set<Direction>(DIRECTIONS),
  );

  const vus = new Set<number>();
  const depart = rng.entier(total);
  const pile = [depart];
  vus.add(depart);

  while (pile.length > 0) {
    const courant = pile[pile.length - 1] as number;
    const candidats = DIRECTIONS.filter((d) => {
      const v = voisin(bornes, courant, d);
      return v !== null && !vus.has(v);
    });

    if (candidats.length === 0) {
      pile.pop();
      continue;
    }

    const direction = candidats[rng.entier(candidats.length)] as Direction;
    const suivant = voisin(bornes, courant, direction) as number;

    murs[courant]?.delete(direction);
    murs[suivant]?.delete(OPPOSE[direction]);
    vus.add(suivant);
    pile.push(suivant);
  }

  for (let pose = 0, essai = 0; pose < boucles && essai < 200; essai++) {
    const case_ = rng.entier(total);
    const direction = DIRECTIONS[rng.entier(DIRECTIONS.length)] as Direction;
    const autre = voisin(bornes, case_, direction);
    if (autre === null || !murs[case_]?.has(direction)) continue;
    murs[case_]?.delete(direction);
    murs[autre]?.delete(OPPOSE[direction]);
    pose++;
  }

  return murs.map((cotes) => ordonner(cotes));
}

/** Distance en nombre de pas depuis `source`, ou -1 si inatteignable. */
export function distancesDepuis(plan: Plan, source: number): number[] {
  const distances = new Array<number>(plan.largeur * plan.hauteur).fill(-1);
  distances[source] = 0;
  const file = [source];

  for (let tete = 0; tete < file.length; tete++) {
    const courant = file[tete] as number;
    for (const direction of DIRECTIONS) {
      if (plan.murs[courant]?.includes(direction)) continue;
      const suivant = voisin(plan, courant, direction);
      if (suivant === null || distances[suivant] !== -1) continue;
      distances[suivant] = (distances[courant] as number) + 1;
      file.push(suivant);
    }
  }
  return distances;
}

/**
 * Le plus court chemin, en directions. Deterministe : les cotes sont toujours
 * essayes dans l'ordre canonique, donc deux appels rendent la meme suite.
 */
export function cheminVers(
  plan: Plan,
  depart: number,
  arrivee: number,
): Direction[] {
  const distances = distancesDepuis(plan, arrivee);
  const suite: Direction[] = [];
  let courant = depart;

  while (courant !== arrivee) {
    const restant = distances[courant] as number;
    if (restant <= 0) return suite;
    const pas = DIRECTIONS.find((direction) => {
      if (plan.murs[courant]?.includes(direction)) return false;
      const suivant = voisin(plan, courant, direction);
      return suivant !== null && distances[suivant] === restant - 1;
    });
    if (!pas) return suite;
    suite.push(pas);
    courant = voisin(plan, courant, pas) as number;
  }
  return suite;
}
