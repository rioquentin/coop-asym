import type { Action, Glyphe, PuzzleMetrics, Role, View } from "@coop/shared";
import type { PuzzleDefinition } from "../../content/types";
import { classeDeVue, permutations } from "../combinatoire";
import { decaler, melanger, rngDepuis } from "../rng";
import {
  MARQUES_MAX,
  tracerGlyphe,
  tropProches,
  type CompositionGlyphe,
} from "./glyphes";
import type {
  ActionOutcome,
  Feedback,
  PlannedAction,
  PuzzleModule,
} from "../types";

/**
 * Primitive LEXIQUE (docs/puzzle-spec.md section 2).
 *
 * A voit des glyphes sans signification et des cases a remplir.
 * B possede leur sens et la suite a reconstituer, mais ne voit pas dans quel
 * ordre A a ses glyphes sous les yeux — et ne peut pas agir.
 *
 * L'asymetrie tient a un detail : une intention designe un glyphe par sa
 * POSITION dans le plateau de A. B connait la reponse mais pas les positions,
 * A connait les positions mais pas la reponse.
 */

/**
 * Etat serveur d'une partie de lexique.
 *
 * `slots` contient des index dans `tray`, jamais des noms de glyphes : c'est
 * ce qui rend un voisin ambigu constructible pour B (voir ambiguites).
 */
export interface LexiconInstance {
  /** Glyphes dans l'ordre ou A les voit. Tire du seed. */
  tray: string[];
  /** Paires glyphe -> signification, triees par glyphe. */
  legend: [string, string][];
  /** Suite de glyphes attendue, case par case. Tiree du seed. */
  target: string[];
  /** Index dans `tray` pose dans chaque case, ou null. */
  slots: (number | null)[];
  /** B a valide une disposition correcte. */
  validated: boolean;
}

interface LexiconContent {
  glyphs: string[];
  legend: Record<string, string>;
  slots: number;
  targetOrder: string[];
  /**
   * Composition de chaque glyphe. Absente du contenu de developpement, ou
   * les identifiants sont lisibles et servent eux-memes d'affichage.
   */
  traces?: Record<string, CompositionGlyphe>;
}

/**
 * Verifie le bloc `content` d'une definition avant d'en faire un module.
 * Une definition bancale doit echouer au chargement, pas au milieu d'une
 * partie.
 */
function lireContenu(definition: PuzzleDefinition): LexiconContent {
  const brut = (definition.content ?? {}) as Partial<LexiconContent>;

  const echec = (raison: string): never => {
    throw new Error(`Definition "${definition.id}" invalide : ${raison}`);
  };

  const glyphs = brut.glyphs;
  const legend = brut.legend;
  const slots = brut.slots;
  const targetOrder = brut.targetOrder;

  if (!Array.isArray(glyphs) || glyphs.length === 0) {
    return echec("content.glyphs doit etre un tableau non vide");
  }
  if (new Set(glyphs).size !== glyphs.length) {
    return echec("content.glyphs contient un doublon");
  }
  if (!legend || typeof legend !== "object") {
    return echec("content.legend est absent");
  }
  for (const glyphe of glyphs) {
    if (typeof legend[glyphe] !== "string") {
      return echec("content.legend n'a pas d'entree pour un glyphe declare");
    }
  }

  // Deux glyphes de meme sens rendraient la disposition gagnante ambigue,
  // et l'obligation de rejet (CLAUDE.md section 4) n'aurait plus de sens.
  const sens = glyphs.map((glyphe) => legend[glyphe] as string);
  if (new Set(sens).size !== sens.length) {
    return echec("content.legend attribue le meme sens a deux glyphes");
  }

  if (!Array.isArray(targetOrder) || targetOrder.length === 0) {
    return echec("content.targetOrder doit etre un tableau non vide");
  }
  if (new Set(targetOrder).size !== targetOrder.length) {
    return echec("content.targetOrder contient un doublon");
  }
  for (const glyphe of targetOrder) {
    if (!glyphs.includes(glyphe)) {
      return echec("content.targetOrder reference un glyphe inconnu");
    }
  }
  if (slots !== targetOrder.length) {
    return echec(
      "content.slots ne correspond pas a la longueur de content.targetOrder",
    );
  }

  const traces = brut.traces;
  if (traces !== undefined) {
    for (const glyphe of glyphs) {
      const composition = traces[glyphe];
      if (!composition) {
        return echec("content.traces ne couvre pas tous les glyphes declares");
      }
      if (composition.marques.length > MARQUES_MAX) {
        return echec(`content.traces : un glyphe porte plus de ${MARQUES_MAX} marques`);
      }
      // Leve si le socle ou une marque n'existe pas.
      tracerGlyphe(composition);
    }

    // Deux glyphes qu'on ne peut pas distinguer a l'oral transforment
    // l'enigme en loterie. docs/puzzle-spec.md section 6.
    for (let i = 0; i < glyphs.length; i++) {
      for (let j = i + 1; j < glyphs.length; j++) {
        const a = traces[glyphs[i] as string] as CompositionGlyphe;
        const b = traces[glyphs[j] as string] as CompositionGlyphe;
        if (tropProches(a, b)) {
          return echec("content.traces : deux glyphes sont indiscernables a l'oral");
        }
      }
    }
  }

  return { glyphs, legend, slots, targetOrder, ...(traces ? { traces } : {}) };
}

function refus(hint: string): Feedback {
  return { kind: "rejected", hint };
}

const ACCEPTE: Feedback = { kind: "accepted" };

export function creerModuleLexique(
  definition: PuzzleDefinition,
): PuzzleModule<LexiconInstance> {
  const contenu = lireContenu(definition);
  const legende: [string, string][] = [...contenu.glyphs]
    .sort()
    .map((glyphe) => [glyphe, contenu.legend[glyphe] as string]);
  const sensDe = new Map(legende);

  /**
   * Le glyphe tel que le client le recoit : un identifiant opaque et, quand
   * le contenu en fournit un, son trace. Jamais de nom.
   */
  const glyphes = new Map<string, Glyphe>(
    contenu.glyphs.map((id) => {
      const composition = contenu.traces?.[id];
      return [id, composition ? { id, d: tracerGlyphe(composition) } : { id }];
    }),
  );
  const glypheDe = (id: string): Glyphe => glyphes.get(id) ?? { id };

  /** Le glyphe pose dans chaque case. Base des deux vues. */
  const casesEnGlyphes = (instance: LexiconInstance): (Glyphe | null)[] =>
    instance.slots.map((index) =>
      index === null ? null : glypheDe(instance.tray[index] as string),
    );

  const disposeCorrectement = (instance: LexiconInstance): boolean =>
    instance.slots.every((index, position) => {
      if (index === null) return false;
      const pose = instance.tray[index] as string;
      const attendu = instance.target[position] as string;
      return sensDe.get(pose) === sensDe.get(attendu);
    });

  return {
    id: definition.id,

    generate(seed: string): LexiconInstance {
      const rng = rngDepuis(seed);
      return {
        tray: melanger(contenu.glyphs, rng),
        legend: legende,
        target: melanger(contenu.targetOrder, rng),
        slots: Array.from({ length: contenu.slots }, () => null),
        validated: false,
      };
    },

    viewFor(role: Role, instance: LexiconInstance): View {
      const slots = casesEnGlyphes(instance);

      if (role === "A") {
        // Ni la legende, ni la cible : A ne sait meme pas ce que veulent dire
        // les glyphes qu'il manipule.
        return { kind: "grid", tray: instance.tray.map(glypheDe), slots };
      }

      // Pas de `tray` : B sait quoi mettre ou, sans savoir ou le prendre.
      return {
        kind: "legend",
        legend: instance.legend.map(
          ([g, s]) => [glypheDe(g), s] as [Glyphe, string],
        ),
        target: instance.target.map((glyphe) => sensDe.get(glyphe) as string),
        slots,
      };
    },

    applyAction(
      instance: LexiconInstance,
      role: Role,
      action: Action,
    ): ActionOutcome<LexiconInstance> {
      const estActionDeA = action.type === "place" || action.type === "clear";
      if (estActionDeA && role !== "A") {
        return { instance, feedback: refus("Le plateau n'est pas le votre.") };
      }
      if (!estActionDeA && role !== "B") {
        return { instance, feedback: refus("Le registre n'est pas le votre.") };
      }

      if (action.type === "place") {
        const { from, to } = action;
        if (
          !Number.isInteger(from) ||
          from < 0 ||
          from >= instance.tray.length
        ) {
          return { instance, feedback: refus("Ce glyphe n'existe pas.") };
        }
        if (!Number.isInteger(to) || to < 0 || to >= instance.slots.length) {
          return { instance, feedback: refus("Cette case n'existe pas.") };
        }
        if (instance.slots[to] !== null) {
          return { instance, feedback: refus("Cette case est deja occupee.") };
        }
        if (instance.slots.includes(from)) {
          return { instance, feedback: refus("Ce glyphe est deja pose.") };
        }
        const slots = [...instance.slots];
        slots[to] = from;
        // Toute modification annule la validation : c'est B qui arrete.
        return {
          instance: { ...instance, slots, validated: false },
          feedback: ACCEPTE,
        };
      }

      if (action.type === "clear") {
        const { slot } = action;
        if (
          !Number.isInteger(slot) ||
          slot < 0 ||
          slot >= instance.slots.length
        ) {
          return { instance, feedback: refus("Cette case n'existe pas.") };
        }
        if (instance.slots[slot] === null) {
          return { instance, feedback: refus("Cette case est deja vide.") };
        }
        const slots = [...instance.slots];
        slots[slot] = null;
        return {
          instance: { ...instance, slots, validated: false },
          feedback: ACCEPTE,
        };
      }

      if (!disposeCorrectement(instance)) {
        // C2 : le refus dit ou en est le releve, jamais ou est l'erreur.
        return {
          instance,
          feedback: refus("Le releve ne correspond pas. Rien n'est consigne."),
        };
      }
      return { instance: { ...instance, validated: true }, feedback: ACCEPTE };
    },

    isSolved(instance: LexiconInstance): boolean {
      return instance.validated && disposeCorrectement(instance);
    },

    /**
     * Une suite d'actions qui amene a la victoire depuis n'importe quel etat :
     * on retire ce qui est mal pose, on complete, B valide.
     */
    solve(instance: LexiconInstance): PlannedAction[] {
      const plan: PlannedAction[] = [];
      const slots = [...instance.slots];

      for (let position = 0; position < slots.length; position++) {
        const index = slots[position];
        if (index === null || index === undefined) continue;
        const pose = instance.tray[index] as string;
        const attendu = instance.target[position] as string;
        if (sensDe.get(pose) !== sensDe.get(attendu)) {
          plan.push({ role: "A", action: { type: "clear", slot: position } });
          slots[position] = null;
        }
      }

      for (let position = 0; position < slots.length; position++) {
        if (slots[position] !== null) continue;
        const attendu = instance.target[position] as string;
        const from = instance.tray.indexOf(attendu);
        plan.push({ role: "A", action: { type: "place", from, to: position } });
        slots[position] = from;
      }

      plan.push({ role: "B", action: { type: "validate" } });
      return plan;
    },

    /**
     * Ce que l'interface propose depuis cet etat, refus compris : poser un
     * glyphe libre dans une case libre, retirer un glyphe pose, valider.
     */
    actionsPossibles(instance: LexiconInstance): PlannedAction[] {
      const actions: PlannedAction[] = [];

      for (let from = 0; from < instance.tray.length; from++) {
        if (instance.slots.includes(from)) continue;
        for (let to = 0; to < instance.slots.length; to++) {
          if (instance.slots[to] !== null) continue;
          actions.push({ role: "A", action: { type: "place", from, to } });
        }
      }

      for (let slot = 0; slot < instance.slots.length; slot++) {
        if (instance.slots[slot] !== null) {
          actions.push({ role: "A", action: { type: "clear", slot } });
        }
      }

      // Toujours proposee : c'est un refus informatif quand c'est faux.
      actions.push({ role: "B", action: { type: "validate" } });
      return actions;
    },

    /**
     * Les metriques decrivent l'ENIGME, pas l'avancement : elles sont
     * mesurees depuis un plateau vide, quel que soit l'etat recu.
     */
    metrics(instance: LexiconInstance): PuzzleMetrics {
      const neuve: LexiconInstance = {
        ...instance,
        slots: instance.slots.map(() => null),
        validated: false,
      };
      const cases = neuve.slots.length;

      // Facteur de branchement mesure le long du chemin optimal, pas estime.
      let etat = neuve;
      let branchesCumulees = 0;
      const plan = this.solve(neuve);
      for (const etape of plan) {
        branchesCumulees += this.actionsPossibles(etat).length;
        etat = this.applyAction(etat, etape.role, etape.action).instance;
      }

      return {
        // Une unite d'information par case : quel glyphe y va. C'est tout ce
        // que le duo a besoin de se transmettre.
        discreteElements: cases,
        exchanges: cases + 1,
        solutionDepth: plan.length,
        branchingFactor: Number((branchesCumulees / plan.length).toFixed(2)),
        estimatedMinutes: definition.budget.targetMinutes,
      };
    },

    /**
     * Le temoin d'ambiguite, construit et non cherche.
     *
     * Pour A : meme plateau, cible decalee. La vue de A est identique au
     * caractere pres, la solution ne l'est pas.
     * Pour B : meme legende, meme cible, memes glyphes poses — mais le plateau
     * de A est decale, donc les positions a annoncer changent. Les index poses
     * sont reindexes pour que la vue de B ne bouge pas d'un iota.
     */
    /**
     * Le residu.
     *
     * A ne voit ni la legende ni la cible : toute permutation de la cible lui
     * laisse exactement le meme ecran. B ne voit pas le plateau : toute
     * permutation du plateau, index poses reindexes, lui laisse le meme. Dans
     * les deux cas la classe compte n! elements ; on n'en rend que le plafond.
     */
    candidats(
      role: Role,
      instance: LexiconInstance,
      plafond: number,
    ): LexiconInstance[] {
      const memeVue = (candidat: LexiconInstance): boolean =>
        JSON.stringify(this.viewFor(role, candidat)) ===
        JSON.stringify(this.viewFor(role, instance));

      if (role === "A") {
        return classeDeVue(
          instance,
          permutations(instance.target, plafond).map((target) => ({
            ...instance,
            target,
          })),
          memeVue,
          plafond,
        );
      }

      return classeDeVue(
        instance,
        permutations(instance.tray, plafond).map((tray) => ({
          ...instance,
          tray,
          slots: instance.slots.map((index) =>
            index === null
              ? null
              : tray.indexOf(instance.tray[index] as string),
          ),
        })),
        memeVue,
        plafond,
      );
    },

    ambiguites(role: Role, instance: LexiconInstance): LexiconInstance[] {
      if (instance.tray.length < 2) return [];

      if (role === "A") {
        return [{ ...instance, target: decaler(instance.target) }];
      }

      const tray = decaler(instance.tray);
      const slots = instance.slots.map((index) =>
        index === null ? null : tray.indexOf(instance.tray[index] as string),
      );
      return [{ ...instance, tray, slots }];
    },
  };
}
