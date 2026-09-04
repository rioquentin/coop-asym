import {
  DIRECTIONS,
  type Action,
  type Direction,
  type PuzzleMetrics,
  type Role,
  type View,
} from "@coop/shared";
import type { PuzzleDefinition } from "../../content/types";
import { classeDeVue } from "../combinatoire";
import {
  cheminVers,
  creuser,
  distancesDepuis,
  enCoordonnees,
  voisin,
} from "../plan";
import { rngDepuis } from "../rng";
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
  /**
   * A a deja tente de sceller sans que B ait bouge depuis.
   *
   * C'est ce qui interdit le scellement-sonde : une premiere tentative
   * renseigne, les suivantes ne renseignent plus rien tant que le lieu n'a pas
   * change. Sonder coute donc un deplacement du partenaire — c'est-a-dire de
   * la cooperation. Voir D71.
   */
  sceauTente: boolean;
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

/** Empreinte courte d'un plan, pour semer un tirage de facon deterministe. */
function stableCourt(murs: Direction[][]): string {
  return murs.map((cotes) => cotes.join("")).join("|");
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

  /** L'enigme telle qu'elle a ete posee, quel que soit l'avancement. */
  const neuve = (instance: TopologieInstance): TopologieInstance => ({
    ...instance,
    position: instance.depart,
    jalon: null,
    scelle: false,
    sceauTente: false,
  });

  const module: PuzzleModule<TopologieInstance> = {
    id: definition.id,

    generate(seed: string): TopologieInstance {
      const rng = rngDepuis(seed);

      for (let essai = 0; essai < 200; essai++) {
        const murs = creuser(contenu.largeur, contenu.hauteur, contenu.boucles, rng);
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
          sceauTente: false,
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
          depot: enCoordonnees(instance, instance.depot),
          jalon: instance.jalon === null ? null : enCoordonnees(instance, instance.jalon),
        };
      }

      // Ni plan, ni coordonnees, et PLUS d'annonce d'arrivee : B ne sait
      // jamais ou il se trouve, pas meme quand il y est. Le sol du depot ne se
      // distingue de rien ; c'est A qui reconnait le lieu a ce que B lui en
      // decrit, et le jalon est le seul mot qu'ils ont pour se le confirmer.
      // Voir D71.
      const fermes = instance.murs[instance.position] ?? [];
      return {
        kind: "poste",
        ouvertures: DIRECTIONS.filter((d) => !fermes.includes(d)),
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
        const suivant = voisin(instance, instance.position, direction);
        if (suivant === null) {
          return { instance, feedback: refus("Le passage est ferme de ce cote.") };
        }
        // Bouger annule le scellement : c'est A qui arrete, sur une position sue.
        return {
          instance: {
            ...instance,
            position: suivant,
            scelle: false,
            sceauTente: false,
          },
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
          // C2 : le refus dit ce qui manque, pas ou est le partenaire. Mais un
          // refus qu'on peut rejouer a volonte n'est plus un refus, c'est un
          // oracle : A le martelerait pendant que B erre, et la salle se
          // gagnerait sans un mot. La premiere tentative renseigne ; les
          // suivantes ne disent plus rien tant que B n'a pas bouge.
          if (instance.sceauTente) {
            return {
              instance,
              feedback: refus("Le registre ne repond plus. Faites bouger le lieu."),
            };
          }
          return {
            instance: { ...instance, sceauTente: true },
            feedback: refus("Le depot est vide."),
          };
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
        const { x, y } = enCoordonnees(contenu, case_);
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
    /**
     * Le residu.
     *
     * Pour A : B peut etre n'importe ou. La classe compte donc une instance
     * par case du plan, et rien de plus — A voit tout le reste.
     * Pour B : il ignore et ou il est, et ou est le depot. On fait varier le
     * couple dans le meme plan et on ne garde que ce qui lui rend exactement
     * les memes ouvertures. C'est une minoration franche : B ne connait pas
     * non plus le plan, et cette part-la n'est pas enumeree ici.
     */
    candidats(
      role: Role,
      instance: TopologieInstance,
      plafond: number,
    ): TopologieInstance[] {
      const reference = JSON.stringify(module.viewFor(role, instance));
      const memeVue = (candidat: TopologieInstance): boolean =>
        JSON.stringify(module.viewFor(role, candidat)) === reference;

      const propositions: TopologieInstance[] = [];

      if (role === "A") {
        for (let case_ = 0; case_ < total; case_++) {
          propositions.push({ ...instance, depart: case_, position: case_ });
        }
      } else {
        for (let ici = 0; ici < total; ici++) {
          for (let depot = 0; depot < total; depot++) {
            propositions.push({
              ...instance,
              depart: ici,
              position: ici,
              depot,
            });
          }
        }

        // B n'a JAMAIS vu le plan, et son ignorance est totale : ce n'est pas
        // un mur qu'il ignore, c'est le lieu entier. N'enumerer qu'une
        // variante a un mur pres reviendrait a mesurer l'incertitude de
        // quelqu'un qui connaitrait deja le plan par coeur, a un detail pres.
        //
        // On tire donc des plans entiers, deterministes a partir de l'instance,
        // et on ne garde que ceux ou B percoit exactement la meme chose. Le
        // resultat reste une minoration — il y en a bien plus — mais elle
        // n'est plus artificiellement petite.
        const dessin = rngDepuis(
          `residu/${stableCourt(instance.murs)}/${instance.position}`,
        );
        for (let essai = 0; essai < plafond * 4; essai++) {
          const murs = creuser(
            instance.largeur,
            instance.hauteur,
            contenu.boucles,
            dessin,
          );
          const variante = { ...instance, murs };
          // Un plan coupe en deux n'est pas un plan : le depot doit rester
          // atteignable, sinon le candidat ne tient pas debout.
          const distances = distancesDepuis(variante, variante.position);
          if ((distances[variante.depot] as number) < 0) continue;
          propositions.push(variante);
        }
      }

      return classeDeVue(instance, propositions, memeVue, plafond);
    },

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
