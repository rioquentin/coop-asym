import {
  DIRECTIONS,
  type Action,
  type Direction,
  type PuzzleMetrics,
  type Role,
  type View,
} from "@coop/shared";
import type { PuzzleDefinition } from "../../content/types";
import { rngDepuis, type Rng } from "../rng";
import type {
  ActionOutcome,
  Feedback,
  PlannedAction,
  PuzzleModule,
} from "../types";

/**
 * Primitive TOPOLOGIE (docs/puzzle-spec.md section 2).
 *
 * A voit le plan. B s'y deplace a l'aveugle.
 *
 * L'asymetrie tient a une seule chose : A ne sait pas ou est B. Il connait
 * chaque mur et l'emplacement du depot, mais tant que B ne lui a pas decrit ce
 * qu'il a autour de lui, il ne peut dicter aucun chemin. B, lui, sait avancer
 * mais ne sait jamais ou il se trouve — seulement quand il est arrive.
 *
 * Salle 2 de l'echelle : « apprendre a decrire l'espace. Aucun glyphe, on ne
 * melange pas encore. »
 */

const OPPOSE: Record<Direction, Direction> = {
  nord: "sud",
  est: "ouest",
  sud: "nord",
  ouest: "est",
};

/** y croit vers le bas : le nord retire une ligne. */
const DELTA: Record<Direction, readonly [number, number]> = {
  nord: [0, -1],
  est: [1, 0],
  sud: [0, 1],
  ouest: [-1, 0],
};

/**
 * Etat serveur d'une partie de topologie.
 *
 * `murs` est symetrique par construction : si une case est fermee a l'est, sa
 * voisine l'est a l'ouest. Sans ca, A et B ne decriraient pas le meme lieu.
 */
export interface TopologieInstance {
  largeur: number;
  hauteur: number;
  /** Pour chaque case, les cotes fermes. Ordre canonique de DIRECTIONS. */
  murs: Direction[][];
  /** Case a atteindre. */
  depot: number;
  /** Case de depart, figee. Sert a mesurer l'enigme, pas a la jouer. */
  depart: number;
  /** Ou se trouve B. */
  position: number;
  /** Jalon pose par A, s'il en a pose un. */
  jalon: number | null;
  /** A a scelle alors que B etait sur le depot. */
  scelle: boolean;
}

interface TopologieContent {
  largeur: number;
  hauteur: number;
  /** Murs abattus en plus de l'arbre couvrant. Cree des boucles, donc des ambiguites. */
  boucles: number;
  distanceMin: number;
  distanceMax: number;
}

function lireContenu(definition: PuzzleDefinition): TopologieContent {
  const brut = (definition.content ?? {}) as Partial<TopologieContent>;
  const echec = (raison: string): never => {
    throw new Error(`Definition "${definition.id}" invalide : ${raison}`);
  };

  const { largeur, hauteur, boucles, distanceMin, distanceMax } = brut;

  for (const [nom, valeur] of [
    ["largeur", largeur],
    ["hauteur", hauteur],
    ["distanceMin", distanceMin],
    ["distanceMax", distanceMax],
  ] as const) {
    if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1) {
      return echec(`content.${nom} doit etre un entier positif`);
    }
  }
  if (largeur! < 2 || hauteur! < 2) {
    return echec("content.largeur et content.hauteur valent au moins 2");
  }
  if (typeof boucles !== "number" || boucles < 0) {
    return echec("content.boucles doit etre un entier positif ou nul");
  }
  if (distanceMin! > distanceMax!) {
    return echec("content.distanceMin depasse content.distanceMax");
  }
  if (distanceMax! >= largeur! * hauteur!) {
    return echec("content.distanceMax est hors d'atteinte sur ce plan");
  }

  return {
    largeur: largeur!,
    hauteur: hauteur!,
    boucles,
    distanceMin: distanceMin!,
    distanceMax: distanceMax!,
  };
}

function voisin(
  case_: number,
  direction: Direction,
  largeur: number,
  hauteur: number,
): number | null {
  const x = (case_ % largeur) + (DELTA[direction][0] as number);
  const y = Math.floor(case_ / largeur) + (DELTA[direction][1] as number);
  if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return null;
  return y * largeur + x;
}

/** Trie les cotes dans l'ordre canonique, pour que deux vues egales le soient. */
function ordonner(cotes: Iterable<Direction>): Direction[] {
  const presents = new Set(cotes);
  return DIRECTIONS.filter((d) => presents.has(d));
}

/**
 * Creuse un labyrinthe par parcours en profondeur, puis abat quelques murs en
 * plus. Les boucles sont ce qui rend deux endroits indiscernables — donc ce
 * qui force le duo a se decrire l'espace au lieu de deviner.
 */
function creuser(contenu: TopologieContent, rng: Rng): Direction[][] {
  const total = contenu.largeur * contenu.hauteur;
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
      const v = voisin(courant, d, contenu.largeur, contenu.hauteur);
      return v !== null && !vus.has(v);
    });

    if (candidats.length === 0) {
      pile.pop();
      continue;
    }

    const direction = candidats[rng.entier(candidats.length)] as Direction;
    const suivant = voisin(
      courant,
      direction,
      contenu.largeur,
      contenu.hauteur,
    ) as number;

    murs[courant]?.delete(direction);
    murs[suivant]?.delete(OPPOSE[direction]);
    vus.add(suivant);
    pile.push(suivant);
  }

  for (let pose = 0, essai = 0; pose < contenu.boucles && essai < 200; essai++) {
    const case_ = rng.entier(total);
    const direction = DIRECTIONS[rng.entier(DIRECTIONS.length)] as Direction;
    const autre = voisin(case_, direction, contenu.largeur, contenu.hauteur);
    if (autre === null || !murs[case_]?.has(direction)) continue;
    murs[case_]?.delete(direction);
    murs[autre]?.delete(OPPOSE[direction]);
    pose++;
  }

  return murs.map((cotes) => ordonner(cotes));
}

/** Distance en nombre de pas depuis `source`, ou -1 si inatteignable. */
function distancesDepuis(instance: TopologieInstance, source: number): number[] {
  const distances = new Array<number>(
    instance.largeur * instance.hauteur,
  ).fill(-1);
  distances[source] = 0;
  const file = [source];

  for (let tete = 0; tete < file.length; tete++) {
    const courant = file[tete] as number;
    for (const direction of DIRECTIONS) {
      if (instance.murs[courant]?.includes(direction)) continue;
      const suivant = voisin(
        courant,
        direction,
        instance.largeur,
        instance.hauteur,
      );
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
function cheminVers(
  instance: TopologieInstance,
  depart: number,
  arrivee: number,
): Direction[] {
  const distances = distancesDepuis(instance, arrivee);
  const suite: Direction[] = [];
  let courant = depart;

  while (courant !== arrivee) {
    const restant = distances[courant] as number;
    if (restant <= 0) return suite;
    const pas = DIRECTIONS.find((direction) => {
      if (instance.murs[courant]?.includes(direction)) return false;
      const suivant = voisin(
        courant,
        direction,
        instance.largeur,
        instance.hauteur,
      );
      return suivant !== null && distances[suivant] === restant - 1;
    });
    if (!pas) return suite;
    suite.push(pas);
    courant = voisin(courant, pas, instance.largeur, instance.hauteur) as number;
  }
  return suite;
}

function refus(hint: string): Feedback {
  return { kind: "rejected", hint };
}

const ACCEPTE: Feedback = { kind: "accepted" };

export function creerModuleTopologie(
  definition: PuzzleDefinition,
): PuzzleModule<TopologieInstance> {
  const contenu = lireContenu(definition);
  const total = contenu.largeur * contenu.hauteur;

  const enCoordonnees = (case_: number): { x: number; y: number } => ({
    x: case_ % contenu.largeur,
    y: Math.floor(case_ / contenu.largeur),
  });

  /** L'enigme telle qu'elle a ete posee, quel que soit l'avancement. */
  const neuve = (instance: TopologieInstance): TopologieInstance => ({
    ...instance,
    position: instance.depart,
    jalon: null,
    scelle: false,
  });

  const module: PuzzleModule<TopologieInstance> = {
    id: definition.id,

    generate(seed: string): TopologieInstance {
      const rng = rngDepuis(seed);

      for (let essai = 0; essai < 200; essai++) {
        const murs = creuser(contenu, rng);
        const depot = rng.entier(total);
        const provisoire: TopologieInstance = {
          largeur: contenu.largeur,
          hauteur: contenu.hauteur,
          murs,
          depot,
          depart: depot,
          position: depot,
          jalon: null,
          scelle: false,
        };

        const distances = distancesDepuis(provisoire, depot);
        const candidats: number[] = [];
        for (let case_ = 0; case_ < total; case_++) {
          const d = distances[case_] as number;
          if (d >= contenu.distanceMin && d <= contenu.distanceMax) {
            candidats.push(case_);
          }
        }
        if (candidats.length === 0) continue;

        const depart = candidats[rng.entier(candidats.length)] as number;
        return { ...provisoire, depart, position: depart };
      }

      throw new Error(
        `Definition "${definition.id}" : aucun plan ne tient les distances demandees.`,
      );
    },

    viewFor(role: Role, instance: TopologieInstance): View {
      if (role === "A") {
        // Le plan entier, et pas B. C'est tout le probleme.
        return {
          kind: "plan",
          largeur: instance.largeur,
          hauteur: instance.hauteur,
          murs: instance.murs.map((cotes) => [...cotes]),
          depot: enCoordonnees(instance.depot),
          jalon: instance.jalon === null ? null : enCoordonnees(instance.jalon),
        };
      }

      // Ni plan, ni coordonnees. B sait quand il est arrive, jamais ou il est.
      const fermes = instance.murs[instance.position] ?? [];
      return {
        kind: "poste",
        ouvertures: DIRECTIONS.filter((d) => !fermes.includes(d)),
        surLeDepot: instance.position === instance.depot,
        surLeJalon: instance.jalon === instance.position,
      };
    },

    applyAction(
      instance: TopologieInstance,
      role: Role,
      action: Action,
    ): ActionOutcome<TopologieInstance> {
      if (action.type === "avancer") {
        if (role !== "B") {
          return { instance, feedback: refus("Vous ne marchez pas, vous lisez.") };
        }
        const { direction } = action;
        if (!DIRECTIONS.includes(direction)) {
          return { instance, feedback: refus("Cette direction n'existe pas.") };
        }
        if (instance.murs[instance.position]?.includes(direction)) {
          return { instance, feedback: refus("Le passage est ferme de ce cote.") };
        }
        const suivant = voisin(
          instance.position,
          direction,
          instance.largeur,
          instance.hauteur,
        );
        if (suivant === null) {
          return { instance, feedback: refus("Le passage est ferme de ce cote.") };
        }
        // Bouger annule le scellement : c'est A qui arrete, sur une position sue.
        return {
          instance: { ...instance, position: suivant, scelle: false },
          feedback: ACCEPTE,
        };
      }

      if (action.type === "jalonner") {
        if (role !== "A") {
          return { instance, feedback: refus("Le plan n'est pas le votre.") };
        }
        const { x, y } = action;
        if (
          !Number.isInteger(x) ||
          !Number.isInteger(y) ||
          x < 0 ||
          y < 0 ||
          x >= instance.largeur ||
          y >= instance.hauteur
        ) {
          return { instance, feedback: refus("Cette case n'existe pas.") };
        }
        return {
          instance: { ...instance, jalon: y * instance.largeur + x },
          feedback: ACCEPTE,
        };
      }

      if (action.type === "sceller") {
        if (role !== "A") {
          return { instance, feedback: refus("Le plan n'est pas le votre.") };
        }
        if (instance.position !== instance.depot) {
          // C2 : le refus dit ce qui manque, pas ou est le partenaire.
          return { instance, feedback: refus("Le depot est vide.") };
        }
        return { instance: { ...instance, scelle: true }, feedback: ACCEPTE };
      }

      return { instance, feedback: refus("Cette commande n'est pas d'ici.") };
    },

    isSolved(instance: TopologieInstance): boolean {
      return instance.scelle && instance.position === instance.depot;
    },

    solve(instance: TopologieInstance): PlannedAction[] {
      const plan: PlannedAction[] = cheminVers(
        instance,
        instance.position,
        instance.depot,
      ).map((direction) => ({
        role: "B" as Role,
        action: { type: "avancer" as const, direction },
      }));
      plan.push({ role: "A", action: { type: "sceller" } });
      return plan;
    },

    actionsPossibles(instance: TopologieInstance): PlannedAction[] {
      const actions: PlannedAction[] = [];

      const fermes = instance.murs[instance.position] ?? [];
      for (const direction of DIRECTIONS) {
        if (fermes.includes(direction)) continue;
        actions.push({ role: "B", action: { type: "avancer", direction } });
      }

      for (let case_ = 0; case_ < total; case_++) {
        if (case_ === instance.jalon) continue;
        const { x, y } = enCoordonnees(case_);
        actions.push({ role: "A", action: { type: "jalonner", x, y } });
      }

      actions.push({ role: "A", action: { type: "sceller" } });
      return actions;
    },

    metrics(instance: TopologieInstance): PuzzleMetrics {
      const depart = neuve(instance);
      const pas = cheminVers(depart, depart.depart, depart.depot).length;

      // Une unite par direction dictee, plus deux : la description de la case
      // de depart, et l'annonce de l'arrivee.
      const discreteElements = pas + 2;

      let etat = depart;
      let branches = 0;
      const plan = module.solve(depart);
      for (const etape of plan) {
        branches += module.actionsPossibles(etat).length;
        etat = module.applyAction(etat, etape.role, etape.action).instance;
      }

      return {
        discreteElements,
        exchanges: pas + 3,
        solutionDepth: plan.length,
        branchingFactor: Number((branches / plan.length).toFixed(2)),
        estimatedMinutes: definition.budget.targetMinutes,
      };
    },

    /**
     * Les temoins d'ambiguite, construits.
     *
     * Pour A : meme plan, meme depot, B ailleurs. La vue de A ne bouge pas
     * d'un pixel — il ne voit pas B — et le chemin a dicter change.
     * Pour B : meme plan, meme position, depot ailleurs. B percoit exactement
     * les memes ouvertures et n'est toujours pas arrive, mais le but a change.
     */
    ambiguites(role: Role, instance: TopologieInstance): TopologieInstance[] {
      const reference = JSON.stringify(module.solve(instance));

      if (role === "A") {
        for (let case_ = 0; case_ < total; case_++) {
          if (case_ === instance.position || case_ === instance.depot) continue;
          const voisine = { ...instance, depart: case_, position: case_ };
          if (JSON.stringify(module.solve(voisine)) !== reference) {
            return [voisine];
          }
        }
        return [];
      }

      // Deplacer le depot changerait la vue de B s'il etait deja dessus.
      if (instance.position === instance.depot) return [];

      for (let case_ = 0; case_ < total; case_++) {
        if (case_ === instance.depot || case_ === instance.position) continue;
        const voisine = { ...instance, depot: case_ };
        if (JSON.stringify(module.solve(voisine)) !== reference) {
          return [voisine];
        }
      }
      return [];
    },
  };

  return module;
}
