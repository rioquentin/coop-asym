import type {
  Action,
  Glyphe,
  PuzzleMetrics,
  Role,
  Tour,
  View,
} from "@coop/shared";
import type { PuzzleDefinition } from "../../content/types";
import { reprendreLeLexique } from "../lexique";
import { melanger, rngDepuis } from "../rng";
import type {
  ActionOutcome,
  Feedback,
  PlannedAction,
  PuzzleModule,
} from "../types";

/**
 * Primitive SIMULTANEITE (docs/puzzle-spec.md section 2, salle 4).
 *
 * Un mecanisme reclame une suite de signes. A chaque tour, les DEUX preposes
 * doivent designer le meme signe — A par sa signification, B par sa forme —
 * sans voir ce que l'autre a engage.
 *
 * « Zero vocabulaire neuf. Toute la difficulte est dans l'obligation de tout
 * planifier d'avance. » Le mecanisme engage masque la suite chez A : ce qui
 * n'a pas ete memorise avant est perdu jusqu'a ce qu'on relache. Relacher est
 * gratuit et ne fait rien perdre — le prix du defaut de plan est un
 * aller-retour, jamais une punition (C2).
 *
 * Aucune contrainte de temps ni de dexterite (C4). La simultaneite est
 * realisee par un ENGAGEMENT AVEUGLE : chacun s'engage sans voir l'autre, et
 * le tour ne se resout que quand les deux se sont engages. Voir D54.
 */

export interface LitanieInstance {
  /** Les glyphes a emettre, dans l'ordre. Les repetitions sont permises. */
  suite: string[];
  /** Ordre du clavier de A : des significations. Tire du seed. */
  clavierA: string[];
  /** Ordre du clavier de B : des identifiants de glyphes. Tire du seed. */
  clavierB: string[];
  /** Le mecanisme tourne : la suite est masquee chez A. */
  engage: boolean;
  /** Tours reussis. Ne redescend jamais, meme en relachant (C2). */
  progres: number;
  /** Engagements du tour en cours. Chacun ignore celui de l'autre. */
  engagementA: number | null;
  engagementB: number | null;
  dernierTour: Tour | null;
}

interface LitanieContent {
  /** Nom de fichier de la salle dont on reprend le lexique. */
  lexiqueDe: string;
  /** Nombre de tours. C'est le levier de difficulte : la longueur a retenir. */
  longueur: number;
}

function lireContenu(definition: PuzzleDefinition): LitanieContent {
  const brut = (definition.content ?? {}) as Partial<LitanieContent>;
  const echec = (raison: string): never => {
    throw new Error(`Definition "${definition.id}" invalide : ${raison}`);
  };

  if (typeof brut.lexiqueDe !== "string" || brut.lexiqueDe.length === 0) {
    return echec("content.lexiqueDe doit nommer la salle qui fournit le lexique");
  }
  if (
    typeof brut.longueur !== "number" ||
    !Number.isInteger(brut.longueur) ||
    brut.longueur < 2
  ) {
    return echec("content.longueur doit valoir au moins 2");
  }

  return brut as LitanieContent;
}

function refus(hint: string): Feedback {
  return { kind: "rejected", hint };
}

const ACCEPTE: Feedback = { kind: "accepted" };

export function creerModuleLitanie(
  definition: PuzzleDefinition,
): PuzzleModule<LitanieInstance> {
  const contenu = lireContenu(definition);
  const lexique = reprendreLeLexique(definition, contenu.lexiqueDe);

  const glyphePar = new Map(lexique.glyphes.map((g) => [g.id, g]));
  const glypheDuSens = new Map(
    [...lexique.sensDe.entries()].map(([glyphe, sens]) => [sens, glyphe]),
  );

  if (lexique.glyphes.length < 2) {
    throw new Error(
      `Definition "${definition.id}" : la salle "${contenu.lexiqueDe}" n'a pas assez de glyphes.`,
    );
  }

  /** L'enigme telle qu'elle a ete posee, quel que soit l'avancement. */
  const neuve = (instance: LitanieInstance): LitanieInstance => ({
    ...instance,
    engage: false,
    progres: 0,
    engagementA: null,
    engagementB: null,
    dernierTour: null,
  });

  /** Le glyphe que designe l'engagement de chaque cote. */
  const designeParA = (instance: LitanieInstance, index: number): string =>
    glypheDuSens.get(instance.clavierA[index] as string) as string;

  const module: PuzzleModule<LitanieInstance> = {
    id: definition.id,

    generate(seed: string): LitanieInstance {
      const rng = rngDepuis(seed);
      const identifiants = lexique.glyphes.map((g) => g.id);

      // Les claviers sont melanges : un engagement designe une POSITION sur
      // son propre clavier, et aucun des deux ne connait celui de l'autre.
      const clavierB = melanger(identifiants, rng);
      const clavierA = melanger(
        identifiants.map((id) => lexique.sensDe.get(id) as string),
        rng,
      );

      // Repetitions permises : c'est ce qui permet d'allonger la suite
      // au-dela du nombre de glyphes, donc de peser sur la memoire.
      const suite = Array.from(
        { length: contenu.longueur },
        () => identifiants[rng.entier(identifiants.length)] as string,
      );

      return {
        suite,
        clavierA,
        clavierB,
        engage: false,
        progres: 0,
        engagementA: null,
        engagementB: null,
        dernierTour: null,
      };
    },

    viewFor(role: Role, instance: LitanieInstance): View {
      const commun = {
        engage: instance.engage,
        progres: instance.progres,
        total: instance.suite.length,
        dernierTour: instance.dernierTour,
      };

      if (role === "A") {
        return {
          kind: "litanie",
          clavier: [...instance.clavierA],
          // La suite disparait des que le mecanisme tourne. C'est la salle.
          suite: instance.engage
            ? null
            : instance.suite.map(
                (glyphe) => lexique.sensDe.get(glyphe) as string,
              ),
          ...commun,
          // Que l'autre se soit engage, jamais ce qu'il a engage.
          partenairePret: instance.engagementB !== null,
          votreEngagement: instance.engagementA,
        };
      }

      return {
        kind: "clavier",
        clavier: instance.clavierB.map(
          (id) => glyphePar.get(id) as Glyphe,
        ),
        ...commun,
        partenairePret: instance.engagementA !== null,
        votreEngagement: instance.engagementB,
      };
    },

    applyAction(
      instance: LitanieInstance,
      role: Role,
      action: Action,
    ): ActionOutcome<LitanieInstance> {
      if (action.type === "engager" || action.type === "relacher") {
        if (role !== "A") {
          return { instance, feedback: refus("Le mecanisme n'est pas le votre.") };
        }
        if (action.type === "engager") {
          if (instance.engage) {
            return { instance, feedback: refus("Le mecanisme tourne deja.") };
          }
          return {
            instance: {
              ...instance,
              engage: true,
              engagementA: null,
              engagementB: null,
              dernierTour: null,
            },
            feedback: ACCEPTE,
          };
        }
        if (!instance.engage) {
          return { instance, feedback: refus("Le mecanisme est deja au repos.") };
        }
        // Relacher ne coute rien et ne fait rien perdre : le prix d'un defaut
        // de plan est un aller-retour, pas une punition (C2).
        return {
          instance: {
            ...instance,
            engage: false,
            engagementA: null,
            engagementB: null,
          },
          feedback: ACCEPTE,
        };
      }

      if (action.type !== "presser") {
        return { instance, feedback: refus("Cette commande n'est pas d'ici.") };
      }

      if (!instance.engage) {
        return { instance, feedback: refus("Le mecanisme n'est pas arme.") };
      }
      if (instance.progres >= instance.suite.length) {
        return { instance, feedback: refus("La litanie est complete.") };
      }

      const clavier = role === "A" ? instance.clavierA : instance.clavierB;
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= clavier.length) {
        return { instance, feedback: refus("Cette touche n'existe pas.") };
      }

      const deja = role === "A" ? instance.engagementA : instance.engagementB;
      if (deja !== null) {
        return { instance, feedback: refus("Vous vous etes deja engage sur ce tour.") };
      }

      const engage: LitanieInstance = {
        ...instance,
        ...(role === "A" ? { engagementA: index } : { engagementB: index }),
      };

      // Un seul cote engage : on attend l'autre, sans rien lui dire.
      if (engage.engagementA === null || engage.engagementB === null) {
        return { instance: engage, feedback: ACCEPTE };
      }

      const cote = designeParA(engage, engage.engagementA);
      const face = engage.clavierB[engage.engagementB] as string;
      const attendu = engage.suite[engage.progres] as string;
      const vide = { engagementA: null, engagementB: null };

      if (cote === face && face === attendu) {
        return {
          instance: {
            ...engage,
            ...vide,
            progres: engage.progres + 1,
            dernierTour: "reussi",
          },
          feedback: ACCEPTE,
        };
      }

      // C2 : l'echec apprend quelque chose. On distingue « nous ne sommes pas
      // d'accord » de « nous sommes d'accord mais pas au bon rang » — sans
      // jamais dire ce qui etait attendu.
      return {
        instance: { ...engage, ...vide, dernierTour: "manque" },
        feedback: refus(
          cote === face
            ? "Vos deux cotes s'accordent, mais pas sur ce rang."
            : "Vos deux cotes ne designent pas la meme chose.",
        ),
      };
    },

    isSolved(instance: LitanieInstance): boolean {
      return instance.progres >= instance.suite.length;
    },

    solve(instance: LitanieInstance): PlannedAction[] {
      const plan: PlannedAction[] = [];

      // On repart d'un mecanisme propre : un engagement en suspens ferait
      // echouer le premier tour.
      if (instance.engage) plan.push({ role: "A", action: { type: "relacher" } });
      plan.push({ role: "A", action: { type: "engager" } });

      for (let i = instance.progres; i < instance.suite.length; i++) {
        const glyphe = instance.suite[i] as string;
        const sens = lexique.sensDe.get(glyphe) as string;
        plan.push({
          role: "A",
          action: { type: "presser", index: instance.clavierA.indexOf(sens) },
        });
        plan.push({
          role: "B",
          action: { type: "presser", index: instance.clavierB.indexOf(glyphe) },
        });
      }

      return plan;
    },

    actionsPossibles(instance: LitanieInstance): PlannedAction[] {
      const actions: PlannedAction[] = [
        {
          role: "A",
          action: { type: instance.engage ? "relacher" : "engager" },
        },
      ];

      for (let index = 0; index < instance.clavierA.length; index++) {
        actions.push({ role: "A", action: { type: "presser", index } });
      }
      for (let index = 0; index < instance.clavierB.length; index++) {
        actions.push({ role: "B", action: { type: "presser", index } });
      }
      return actions;
    },

    metrics(instance: LitanieInstance): PuzzleMetrics {
      const depart = neuve(instance);

      // Une unite par signification dictee. Rien d'autre ne passe de bouche a
      // oreille : il n'y a ni plan ni position a decrire.
      const discreteElements = depart.suite.length;

      let etat = depart;
      let branches = 0;
      const plan = module.solve(depart);
      for (const etape of plan) {
        branches += module.actionsPossibles(etat).length;
        etat = module.applyAction(etat, etape.role, etape.action).instance;
      }

      return {
        discreteElements,
        exchanges: discreteElements + 3,
        solutionDepth: plan.length,
        branchingFactor: Number((branches / plan.length).toFixed(2)),
        estimatedMinutes: definition.budget.targetMinutes,
      };
    },

    /**
     * Pour A : meme suite, meme clavier de significations, mais le clavier de
     * B est decale. A ne voit pas celui de l'autre — sa vue est identique et
     * les touches a annoncer ne le sont plus.
     * Pour B : meme clavier de formes, mais une autre suite. B ne voit jamais
     * la suite ; sa vue ne bouge pas et la solution change.
     */
    ambiguites(role: Role, instance: LitanieInstance): LitanieInstance[] {
      const reference = JSON.stringify(module.solve(instance));

      if (role === "A") {
        if (instance.clavierB.length < 2) return [];
        const clavierB = [
          ...instance.clavierB.slice(1),
          instance.clavierB[0] as string,
        ];
        const voisine = { ...instance, clavierB };
        return JSON.stringify(module.solve(voisine)) !== reference
          ? [voisine]
          : [];
      }

      const premier = instance.suite[0] as string;
      const autre = lexique.glyphes.find((g) => g.id !== premier)?.id;
      if (!autre) return [];
      const voisine = {
        ...instance,
        suite: [autre, ...instance.suite.slice(1)],
      };
      return JSON.stringify(module.solve(voisine)) !== reference
        ? [voisine]
        : [];
    },
  };

  return module;
}
