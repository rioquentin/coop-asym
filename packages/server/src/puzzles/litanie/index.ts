import type {
  Action,
  Glyphe,
  PuzzleMetrics,
  Role,
  Touche,
  Tour,
  View,
} from "@coop/shared";
import type { PuzzleDefinition } from "../../content/types";
import { classeDeVue, permutations } from "../combinatoire";
import { reprendreLeLexique } from "../lexique";
import { melanger, rngDepuis } from "../rng";
import type {
  ActionOutcome,
  Feedback,
  PlannedAction,
  PuzzleModule,
} from "../types";

/**
 * Primitive ETAT_CROISE (docs/puzzle-spec.md section 2), et son retournement.
 *
 * Un mecanisme reclame une suite de signes. A chaque tour, les DEUX preposes
 * doivent designer le meme signe — l'un par sa signification, l'autre par sa
 * forme — sans voir ce que l'autre a engage.
 *
 * Aucune planche ne tient en place : les deux claviers sont remelanges a
 * chaque tour, donc aucun des deux n'a de vue stable et il n'y a rien a
 * memoriser. Ce qui reste est de nommer ce qu'on veut par ce que c'est —
 * la competence de la salle 1, appliquee sous un sol qui bouge.
 *
 * Cette salle s'est longtemps appelee SIMULTANEITE. Elle ne l'a jamais ete :
 * rien dans le jeu n'atteint le vocal des joueurs, et l'engagement aveugle
 * ne survit pas a « je mets celui-la ». Voir D73.
 *
 * Aucune contrainte de temps ni de dexterite (C4). Voir D54 et D72.
 *
 * Le champ `inversion` du contenu paramètre la salle 5. Ce qu'il fait
 * exactement n'est decrit nulle part dans le depot en clair : en salle 5, la
 * mecanique est couverte par le mur au meme titre que le contenu.
 * Voir CLAUDE.md section 1.
 */

/** Paramètre de salle. Voir CLAUDE.md section 1 avant d'en documenter l'effet. */
export type Inversion = "AUCUNE" | "ROLES_ECHANGES" | "LEXIQUE_INVERSE";

export const INVERSIONS: Inversion[] = [
  "AUCUNE",
  "ROLES_ECHANGES",
  "LEXIQUE_INVERSE",
];

export interface LitanieInstance {
  /** Les glyphes a emettre, dans l'ordre. Les repetitions sont permises. */
  suite: string[];
  /**
   * Les deux claviers, TOUR PAR TOUR. Aucun des deux ne tient en place d'un
   * tour a l'autre : on ne peut ni memoriser sa propre planche, ni s'en
   * fabriquer un raccourci avec son coequipier. Il faut la relire, et donc
   * redesigner ce qu'on veut par ce que c'est. Voir D72.
   */
  clavierSensParTour: string[][];
  clavierFormesParTour: string[][];
  /** Le mecanisme tourne : la suite est masquee. */
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
  /** Nombre de tours. Le levier de difficulte : la longueur a retenir. */
  longueur: number;
  /** Retournement applique. Absent vaut "AUCUNE". */
  inversion?: Inversion;
}

function lireContenu(definition: PuzzleDefinition): Required<LitanieContent> {
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
  const inversion = brut.inversion ?? "AUCUNE";
  if (!INVERSIONS.includes(inversion)) {
    // On ne cite pas la valeur : sur content/prod ce serait dire le
    // retournement de la salle 5.
    return echec("content.inversion n'est pas une inversion connue");
  }

  return { lexiqueDe: brut.lexiqueDe, longueur: brut.longueur, inversion };
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

  if (lexique.glyphes.length < 2) {
    throw new Error(
      `Definition "${definition.id}" : la salle "${contenu.lexiqueDe}" n'a pas assez de glyphes.`,
    );
  }

  const glyphePar = new Map(lexique.glyphes.map((g) => [g.id, g]));
  const glypheDuSens = new Map(
    [...lexique.sensDe.entries()].map(([glyphe, sens]) => [sens, glyphe]),
  );

  /** Qui tient la suite et arme le mecanisme. */
  const posteDeLaLitanie: Role =
    contenu.inversion === "ROLES_ECHANGES" ? "B" : "A";

  /** En quelle monnaie ce poste s'exprime. */
  const monnaieDuPoste = (role: Role): "sens" | "forme" => {
    const tientLaLitanie = role === posteDeLaLitanie;
    const inverse = contenu.inversion === "LEXIQUE_INVERSE";
    return tientLaLitanie === !inverse ? "sens" : "forme";
  };

  /** Le rang de clavier en vigueur. Le dernier tour garde le sien. */
  const tourCourant = (instance: LitanieInstance): number =>
    Math.min(instance.progres, instance.clavierFormesParTour.length - 1);

  const formesDuTour = (instance: LitanieInstance): string[] =>
    instance.clavierFormesParTour[tourCourant(instance)] as string[];

  const sensDuTour = (instance: LitanieInstance): string[] =>
    instance.clavierSensParTour[tourCourant(instance)] as string[];

  /** Le clavier d'un role, en identifiants de glyphes. */
  const clavierDe = (instance: LitanieInstance, role: Role): string[] =>
    monnaieDuPoste(role) === "forme"
      ? formesDuTour(instance)
      : sensDuTour(instance).map((sens) => glypheDuSens.get(sens) as string);

  /** Le clavier d'un role, tel que le client le rend. */
  const touchesDe = (instance: LitanieInstance, role: Role): Touche[] =>
    monnaieDuPoste(role) === "forme"
      ? formesDuTour(instance).map((id) => ({
          genre: "forme" as const,
          forme: glyphePar.get(id) as Glyphe,
        }))
      : sensDuTour(instance).map((sens) => ({ genre: "sens" as const, sens }));

  const toucheDuGlyphe = (glyphe: string, role: Role): Touche =>
    monnaieDuPoste(role) === "forme"
      ? { genre: "forme", forme: glyphePar.get(glyphe) as Glyphe }
      : { genre: "sens", sens: lexique.sensDe.get(glyphe) as string };

  const engagementDe = (
    instance: LitanieInstance,
    role: Role,
  ): number | null => (role === "A" ? instance.engagementA : instance.engagementB);

  /** L'enigme telle qu'elle a ete posee, quel que soit l'avancement. */
  const neuve = (instance: LitanieInstance): LitanieInstance => ({
    ...instance,
    engage: false,
    progres: 0,
    engagementA: null,
    engagementB: null,
    dernierTour: null,
  });

  const module: PuzzleModule<LitanieInstance> = {
    id: definition.id,

    generate(seed: string): LitanieInstance {
      const rng = rngDepuis(seed);
      const identifiants = lexique.glyphes.map((g) => g.id);

      // Les deux claviers sont melanges separement — un engagement designe une
      // POSITION sur son propre clavier, et aucun des deux ne connait l'ordre
      // de l'autre (D57) — et ils sont remelanges A CHAQUE TOUR (D72). Aucune
      // planche ne tient en place : il n'y a rien a memoriser, il n'y a qu'a
      // relire et a nommer.
      const sens = identifiants.map((id) => lexique.sensDe.get(id) as string);
      const clavierFormesParTour = Array.from(
        { length: contenu.longueur },
        () => melanger(identifiants, rng),
      );
      const clavierSensParTour = Array.from({ length: contenu.longueur }, () =>
        melanger(sens, rng),
      );

      // Repetitions permises : c'est ce qui permet d'allonger la suite au-dela
      // du nombre de glyphes, donc de peser sur la memoire.
      const suite = Array.from(
        { length: contenu.longueur },
        () => identifiants[rng.entier(identifiants.length)] as string,
      );

      return {
        suite,
        clavierSensParTour,
        clavierFormesParTour,
        engage: false,
        progres: 0,
        engagementA: null,
        engagementB: null,
        dernierTour: null,
      };
    },

    viewFor(role: Role, instance: LitanieInstance): View {
      const autre: Role = role === "A" ? "B" : "A";
      const commun = {
        engage: instance.engage,
        progres: instance.progres,
        total: instance.suite.length,
        dernierTour: instance.dernierTour,
        // Que l'autre se soit engage, jamais ce qu'il a engage.
        partenairePret: engagementDe(instance, autre) !== null,
        votreEngagement: engagementDe(instance, role),
      };

      if (role === posteDeLaLitanie) {
        return {
          kind: "litanie",
          clavier: touchesDe(instance, role),
          // La suite disparait des que le mecanisme tourne. C'est la salle.
          suite: instance.engage
            ? null
            : instance.suite.map((glyphe) => toucheDuGlyphe(glyphe, role)),
          ...commun,
        };
      }

      return {
        kind: "clavier",
        clavier: touchesDe(instance, role),
        ...commun,
      };
    },

    applyAction(
      instance: LitanieInstance,
      role: Role,
      action: Action,
    ): ActionOutcome<LitanieInstance> {
      if (action.type === "engager" || action.type === "relacher") {
        if (role !== posteDeLaLitanie) {
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

      const clavier = clavierDe(instance, role);
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= clavier.length) {
        return { instance, feedback: refus("Cette touche n'existe pas.") };
      }
      if (engagementDe(instance, role) !== null) {
        return {
          instance,
          feedback: refus("Vous vous etes deja engage sur ce tour."),
        };
      }

      const engage: LitanieInstance = {
        ...instance,
        ...(role === "A" ? { engagementA: index } : { engagementB: index }),
      };

      // Un seul cote engage : on attend l'autre, sans rien lui dire.
      if (engage.engagementA === null || engage.engagementB === null) {
        return { instance: engage, feedback: ACCEPTE };
      }

      const cote = clavierDe(engage, "A")[engage.engagementA] as string;
      const face = clavierDe(engage, "B")[engage.engagementB] as string;
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
      // jamais dire ce qui etait attendu. Voir D56.
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
      const autre: Role = posteDeLaLitanie === "A" ? "B" : "A";

      // On repart d'un mecanisme propre : un engagement en suspens ferait
      // echouer le premier tour.
      if (instance.engage) {
        plan.push({ role: posteDeLaLitanie, action: { type: "relacher" } });
      }
      plan.push({ role: posteDeLaLitanie, action: { type: "engager" } });

      // Les planches ne tiennent pas en place : l'index a presser se relit au
      // rang du tour, pas une fois pour toutes. C'est litteralement ce que la
      // salle demande aux joueurs. Voir D72.
      for (let i = instance.progres; i < instance.suite.length; i++) {
        const glyphe = instance.suite[i] as string;
        const auTour = { ...instance, progres: i };
        plan.push({
          role: posteDeLaLitanie,
          action: {
            type: "presser",
            index: clavierDe(auTour, posteDeLaLitanie).indexOf(glyphe),
          },
        });
        plan.push({
          role: autre,
          action: {
            type: "presser",
            index: clavierDe(auTour, autre).indexOf(glyphe),
          },
        });
      }

      return plan;
    },

    actionsPossibles(instance: LitanieInstance): PlannedAction[] {
      const actions: PlannedAction[] = [
        {
          role: posteDeLaLitanie,
          action: { type: instance.engage ? "relacher" : "engager" },
        },
      ];

      for (const role of ["A", "B"] as Role[]) {
        const taille = clavierDe(instance, role).length;
        for (let index = 0; index < taille; index++) {
          actions.push({ role, action: { type: "presser", index } });
        }
      }
      return actions;
    },

    metrics(instance: LitanieInstance): PuzzleMetrics {
      const depart = neuve(instance);

      // Une unite par signe dicte. Rien d'autre ne passe de bouche a oreille :
      // il n'y a ni plan ni position a decrire.
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
     * Pour le poste qui tient la suite : meme suite, meme clavier, mais celui
     * de l'autre est decale. Sa vue est identique et les touches a annoncer ne
     * le sont plus.
     * Pour l'autre : meme clavier, mais une autre suite. Il ne voit jamais la
     * suite ; sa vue ne bouge pas et la solution change.
     */
    /**
     * Le residu. Chaque poste ignore une chose et une seule ; on fait varier
     * cette chose-la et on ne garde que ce qui lui rend un ecran identique.
     * Le detail de ce qui varie de quel cote est une propriete de la salle,
     * donc tu du meme mur qu'elle (CLAUDE.md section 1).
     */
    candidats(
      role: Role,
      instance: LitanieInstance,
      plafond: number,
    ): LitanieInstance[] {
      const reference = JSON.stringify(module.viewFor(role, instance));
      const memeVue = (candidat: LitanieInstance): boolean =>
        JSON.stringify(module.viewFor(role, candidat)) === reference;

      const propositions: LitanieInstance[] = [];

      if (role === posteDeLaLitanie) {
        // Une correspondance est une bijection : elle se permute, elle ne se
        // retouche pas case par case. C'est la planche du tour en cours qui
        // varie — les autres ne sont pas encore a l'ecran.
        const rangDuTour = tourCourant(instance);
        if (monnaieDuPoste(role) === "sens") {
          for (const planche of permutations(
            formesDuTour(instance),
            plafond * 4,
          )) {
            const clavierFormesParTour = [...instance.clavierFormesParTour];
            clavierFormesParTour[rangDuTour] = planche;
            propositions.push({ ...instance, clavierFormesParTour });
          }
        } else {
          for (const planche of permutations(
            sensDuTour(instance),
            plafond * 4,
          )) {
            const clavierSensParTour = [...instance.clavierSensParTour];
            clavierSensParTour[rangDuTour] = planche;
            propositions.push({ ...instance, clavierSensParTour });
          }
        }
      } else {
        // Ici la liste peut repeter un element : une permutation ne garantit
        // plus la distinction. On substitue rang par rang, ce qui la garantit.
        const alphabet = lexique.glyphes.map((g) => g.id);
        for (let rang = 0; rang < instance.suite.length; rang++) {
          for (const autre of alphabet) {
            if (autre === instance.suite[rang]) continue;
            const suite = [...instance.suite];
            suite[rang] = autre;
            propositions.push({ ...instance, suite });
          }
        }
      }

      return classeDeVue(instance, propositions, memeVue, plafond);
    },

    ambiguites(role: Role, instance: LitanieInstance): LitanieInstance[] {
      const reference = JSON.stringify(module.solve(instance));

      const decale = (liste: string[]): string[] => [
        ...liste.slice(1),
        liste[0] as string,
      ];

      if (role === posteDeLaLitanie) {
        if (formesDuTour(instance).length < 2) return [];
        const rangDuTour = tourCourant(instance);
        const voisine = { ...instance };
        if (monnaieDuPoste(role) === "sens") {
          const planches = [...instance.clavierFormesParTour];
          planches[rangDuTour] = decale(formesDuTour(instance));
          voisine.clavierFormesParTour = planches;
        } else {
          const planches = [...instance.clavierSensParTour];
          planches[rangDuTour] = decale(sensDuTour(instance));
          voisine.clavierSensParTour = planches;
        }
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
