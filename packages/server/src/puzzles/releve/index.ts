import {
  DIRECTIONS,
  type Action,
  type Direction,
  type Glyphe,
  type PuzzleMetrics,
  type Role,
  type View,
} from "@coop/shared";
import { chargerDefinition } from "../../content/loader";
import type { PuzzleDefinition } from "../../content/types";
import { tracerGlyphe, type CompositionGlyphe } from "../lexicon/glyphes";
import { cheminVers, creuser, enCoordonnees, voisin } from "../plan";
import { melanger, rngDepuis } from "../rng";
import type {
  ActionOutcome,
  Feedback,
  PlannedAction,
  PuzzleModule,
} from "../types";

/**
 * LEXIQUE + TOPOLOGIE (docs/puzzle-spec.md section 3, salle 3).
 *
 * Des glyphes sont graves au sol d'un lieu. A voit le plan, sait OU sont les
 * gravures et dans quel ordre les significations doivent etre relevees — mais
 * pas laquelle porte quoi, ni ou est son partenaire. B arpente, voit la forme
 * sous ses pieds, et ignore le plan comme l'ordre.
 *
 * Le pont entre les deux n'est sur aucun des deux ecrans : c'est la
 * correspondance apprise en salle 1. A dit une signification, B reconnait une
 * forme. « Le duo doit sentir qu'il applique au lieu de redecouvrir. »
 *
 * Les glyphes sont ceux de la salle 1, sens compris — la regle de continuite
 * l'exige, et le contraire reviendrait a redecouvrir.
 */

export interface ReleveInstance {
  largeur: number;
  hauteur: number;
  murs: Direction[][];
  /** Glyphe grave sur chaque case, ou null. */
  graves: (string | null)[];
  /** Les glyphes a relever, dans l'ordre. Sous-ensemble des graves. */
  ordre: string[];
  /** Case de depart, figee. Sert a mesurer l'enigme, pas a la jouer. */
  depart: number;
  position: number;
  /** Combien de releves sont consignes. Ne redescend jamais (C2). */
  progres: number;
  scelle: boolean;
}

interface ReleveContent {
  /** Nom de fichier de la salle dont on reprend le lexique. */
  lexiqueDe: string;
  largeur: number;
  hauteur: number;
  boucles: number;
  /** Combien de cases portent une gravure. */
  marques: number;
  /** Combien de gravures il faut relever, dans l'ordre. */
  releves: number;
  elementsMin: number;
  elementsMax: number;
}

interface Lexique {
  glyphes: Glyphe[];
  sensDe: Map<string, string>;
}

function lireContenu(definition: PuzzleDefinition): ReleveContent {
  const brut = (definition.content ?? {}) as Partial<ReleveContent>;
  const echec = (raison: string): never => {
    throw new Error(`Definition "${definition.id}" invalide : ${raison}`);
  };

  const entiers = [
    "largeur",
    "hauteur",
    "boucles",
    "marques",
    "releves",
    "elementsMin",
    "elementsMax",
  ] as const;
  for (const nom of entiers) {
    const valeur = brut[nom];
    if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 0) {
      return echec(`content.${nom} doit etre un entier positif ou nul`);
    }
  }
  if (typeof brut.lexiqueDe !== "string" || brut.lexiqueDe.length === 0) {
    return echec("content.lexiqueDe doit nommer la salle qui fournit le lexique");
  }
  if (brut.releves! < 2) {
    return echec("content.releves vaut au moins 2 : un seul releve n'a pas d'ordre");
  }
  if (brut.releves! >= brut.marques!) {
    return echec(
      "content.releves doit rester sous content.marques : des gravures inutiles sont ce qui rend le lexique necessaire",
    );
  }
  if (brut.marques! >= brut.largeur! * brut.hauteur!) {
    return echec("content.marques ne laisse aucune case libre");
  }
  if (brut.elementsMin! > brut.elementsMax!) {
    return echec("content.elementsMin depasse content.elementsMax");
  }

  return brut as ReleveContent;
}

/**
 * Reprend le lexique d'une autre salle : memes identifiants, memes traces,
 * memes significations.
 *
 * C'est la regle de continuite de docs/puzzle-spec.md section 3. Le champ
 * `reusesLexiconFrom` de la definition la declare ; c'est ici qu'elle
 * s'applique.
 */
function reprendreLeLexique(
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

function refus(hint: string): Feedback {
  return { kind: "rejected", hint };
}

const ACCEPTE: Feedback = { kind: "accepted" };

export function creerModuleReleve(
  definition: PuzzleDefinition,
): PuzzleModule<ReleveInstance> {
  const contenu = lireContenu(definition);
  const lexique = reprendreLeLexique(definition, contenu.lexiqueDe);
  const total = contenu.largeur * contenu.hauteur;

  if (contenu.marques > lexique.glyphes.length) {
    throw new Error(
      `Definition "${definition.id}" : la salle "${contenu.lexiqueDe}" n'a pas assez de glyphes.`,
    );
  }

  const glyphePar = new Map(lexique.glyphes.map((g) => [g.id, g]));

  const neuve = (instance: ReleveInstance): ReleveInstance => ({
    ...instance,
    position: instance.depart,
    progres: 0,
    scelle: false,
  });

  /** La case qui porte ce glyphe. Les gravures sont uniques. */
  const caseDe = (instance: ReleveInstance, glyphe: string): number =>
    instance.graves.indexOf(glyphe);

  /** Somme des pas a faire pour relever la suite depuis l'etat courant. */
  const pasRestants = (instance: ReleveInstance): number => {
    let position = instance.position;
    let pas = 0;
    for (let i = instance.progres; i < instance.ordre.length; i++) {
      const cible = caseDe(instance, instance.ordre[i] as string);
      pas += cheminVers(instance, position, cible).length;
      position = cible;
    }
    return pas;
  };

  const module: PuzzleModule<ReleveInstance> = {
    id: definition.id,

    generate(seed: string): ReleveInstance {
      const rng = rngDepuis(seed);

      for (let essai = 0; essai < 300; essai++) {
        const murs = creuser(
          contenu.largeur,
          contenu.hauteur,
          contenu.boucles,
          rng,
        );

        const cases = melanger(
          Array.from({ length: total }, (_, i) => i),
          rng,
        );
        const graves: (string | null)[] = new Array(total).fill(null);
        const glyphesTires = melanger(
          lexique.glyphes.map((g) => g.id),
          rng,
        ).slice(0, contenu.marques);

        glyphesTires.forEach((glyphe, i) => {
          graves[cases[i] as number] = glyphe;
        });

        // Le depart n'est jamais sur une gravure : la premiere case decrite
        // par B doit etre neutre, sinon la salle commence par un cadeau.
        const depart = cases[contenu.marques] as number;
        const ordre = melanger(glyphesTires, rng).slice(0, contenu.releves);

        const candidate: ReleveInstance = {
          largeur: contenu.largeur,
          hauteur: contenu.hauteur,
          murs,
          graves,
          ordre,
          depart,
          position: depart,
          progres: 0,
          scelle: false,
        };

        const elements = ordre.length + pasRestants(candidate);
        if (elements < contenu.elementsMin || elements > contenu.elementsMax) {
          continue;
        }
        return candidate;
      }

      throw new Error(
        `Definition "${definition.id}" : aucun lieu ne tient le budget demande.`,
      );
    },

    viewFor(role: Role, instance: ReleveInstance): View {
      if (role === "A") {
        // Ou sont les gravures, jamais lesquelles. Ni B.
        const marques: { x: number; y: number }[] = [];
        instance.graves.forEach((glyphe, case_) => {
          if (glyphe !== null) marques.push(enCoordonnees(instance, case_));
        });

        return {
          kind: "releve",
          largeur: instance.largeur,
          hauteur: instance.hauteur,
          murs: instance.murs.map((cotes) => [...cotes]),
          marques,
          attendus: instance.ordre.map(
            (glyphe) => lexique.sensDe.get(glyphe) as string,
          ),
          progres: instance.progres,
        };
      }

      // La forme sous les pieds, jamais son sens. Ni le plan, ni l'ordre.
      const fermes = instance.murs[instance.position] ?? [];
      const grave = instance.graves[instance.position];
      return {
        kind: "arpent",
        ouvertures: DIRECTIONS.filter((d) => !fermes.includes(d)),
        grave: grave ? (glyphePar.get(grave) as Glyphe) : null,
        progres: instance.progres,
      };
    },

    applyAction(
      instance: ReleveInstance,
      role: Role,
      action: Action,
    ): ActionOutcome<ReleveInstance> {
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
        return {
          instance: { ...instance, position: suivant },
          feedback: ACCEPTE,
        };
      }

      if (action.type === "relever") {
        if (role !== "B") {
          return { instance, feedback: refus("Vous ne relevez pas, vous tenez le registre.") };
        }
        if (instance.progres >= instance.ordre.length) {
          return { instance, feedback: refus("Le releve est complet.") };
        }
        const grave = instance.graves[instance.position];
        if (!grave) {
          return { instance, feedback: refus("Rien n'est grave ici.") };
        }
        if (grave !== instance.ordre[instance.progres]) {
          // C2 : on dit que ce n'est pas le tour de cette gravure, jamais
          // laquelle est attendue.
          return {
            instance,
            feedback: refus("Ce n'est pas ce que le registre attend a ce rang."),
          };
        }
        // Un releve acquis ne se perd pas : il n'y a pas de retour a zero.
        return {
          instance: { ...instance, progres: instance.progres + 1 },
          feedback: ACCEPTE,
        };
      }

      if (action.type === "sceller") {
        if (role !== "A") {
          return { instance, feedback: refus("Le registre n'est pas le votre.") };
        }
        if (instance.progres < instance.ordre.length) {
          return { instance, feedback: refus("Le releve n'est pas complet.") };
        }
        return { instance: { ...instance, scelle: true }, feedback: ACCEPTE };
      }

      return { instance, feedback: refus("Cette commande n'est pas d'ici.") };
    },

    isSolved(instance: ReleveInstance): boolean {
      return instance.scelle && instance.progres >= instance.ordre.length;
    },

    solve(instance: ReleveInstance): PlannedAction[] {
      const plan: PlannedAction[] = [];
      let position = instance.position;

      for (let i = instance.progres; i < instance.ordre.length; i++) {
        const cible = caseDe(instance, instance.ordre[i] as string);
        for (const direction of cheminVers(instance, position, cible)) {
          plan.push({ role: "B", action: { type: "avancer", direction } });
        }
        plan.push({ role: "B", action: { type: "relever" } });
        position = cible;
      }

      plan.push({ role: "A", action: { type: "sceller" } });
      return plan;
    },

    actionsPossibles(instance: ReleveInstance): PlannedAction[] {
      const actions: PlannedAction[] = [];
      const fermes = instance.murs[instance.position] ?? [];
      for (const direction of DIRECTIONS) {
        if (fermes.includes(direction)) continue;
        actions.push({ role: "B", action: { type: "avancer", direction } });
      }
      actions.push({ role: "B", action: { type: "relever" } });
      actions.push({ role: "A", action: { type: "sceller" } });
      return actions;
    },

    metrics(instance: ReleveInstance): PuzzleMetrics {
      const depart = neuve(instance);

      // Une unite par signification annoncee, une par direction dictee.
      const discreteElements = depart.ordre.length + pasRestants(depart);

      let etat = depart;
      let branches = 0;
      const plan = module.solve(depart);
      for (const etape of plan) {
        branches += module.actionsPossibles(etat).length;
        etat = module.applyAction(etat, etape.role, etape.action).instance;
      }

      return {
        discreteElements,
        exchanges: discreteElements + 2,
        solutionDepth: plan.length,
        branchingFactor: Number((branches / plan.length).toFixed(2)),
        estimatedMinutes: definition.budget.targetMinutes,
      };
    },

    /**
     * Pour A : memes gravures aux memes endroits, mais pas les memes formes.
     * A voit ou l'on a grave, jamais quoi — sa vue ne bouge pas, la tournee
     * a dicter change entierement.
     * Pour B : meme lieu, meme forme sous les pieds, mais un autre ordre.
     * B ne voit pas le registre ; sa vue est identique et la solution non.
     */
    ambiguites(role: Role, instance: ReleveInstance): ReleveInstance[] {
      const reference = JSON.stringify(module.solve(instance));

      if (role === "A") {
        const occupees = instance.graves
          .map((glyphe, case_) => (glyphe === null ? -1 : case_))
          .filter((case_) => case_ >= 0);
        if (occupees.length < 2) return [];

        const graves = [...instance.graves];
        for (let i = 0; i < occupees.length; i++) {
          const source = occupees[i] as number;
          const cible = occupees[(i + 1) % occupees.length] as number;
          graves[cible] = instance.graves[source] as string;
        }
        const voisine = { ...instance, graves };
        return JSON.stringify(module.solve(voisine)) !== reference
          ? [voisine]
          : [];
      }

      if (instance.ordre.length < 2) return [];
      const ordre = [...instance.ordre.slice(1), instance.ordre[0] as string];
      const voisine = { ...instance, ordre };
      return JSON.stringify(module.solve(voisine)) !== reference
        ? [voisine]
        : [];
    },
  };

  return module;
}
