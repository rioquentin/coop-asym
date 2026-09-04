import { describe, expect, it } from "vitest";
import type { Action, Role, View } from "@coop/shared";
import type { PuzzleDefinition } from "../content/types";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import type { OpaquePuzzleModule } from "../puzzles/registry";

/**
 * Le plancher de residu a-t-il des dents ?
 *
 * Une obligation que tout le monde passe ne vaut rien, et on ne peut pas s'en
 * assurer avec les vraies salles : elles la passent, c'est bien le but. On
 * fabrique donc deux enigmes jumelles, aussi minces que possible, qui ne
 * different que par une chose — l'une laisse a A un oracle, l'autre non — et
 * on verifie que le harnais les separe.
 *
 * Sans ce controle, il suffirait qu'une erreur rende `sondesAbordables`
 * toujours nul pour que l'obligation 5 devienne decorative sans que rien ne
 * vire au rouge. Voir D70.
 */

const MONDES = 6;

interface CoffreInstance {
  secret: number;
  annonce: number | null;
  ouvert: boolean;
}

interface Retour {
  instance: CoffreInstance;
  feedback: { kind: "accepted" | "rejected"; hint?: string };
}

/**
 * Un coffre a `MONDES` combinaisons. Personne ne voit le secret : la classe
 * de residu vaut MONDES des deux cotes, et aucun role ne gagne seul — A
 * annonce une combinaison, B seul peut ouvrir.
 *
 * `avecOracle` decide si l'annonce est commentee. Quand elle l'est, A n'a plus
 * besoin de son coequipier pour savoir : il annonce les combinaisons une par
 * une jusqu'a ce que le coffre lui dise laquelle. La salle se gagne alors sans
 * qu'une seule information ait traverse le duo.
 */
function coffre(avecOracle: boolean): OpaquePuzzleModule {
  const vueMuette = { kind: "grid", tray: [], slots: [] } as unknown as View;
  const annoncer = (index: number): Action =>
    ({ type: "place", from: index, to: 0 }) as Action;
  const ouvrir = { type: "validate" } as Action;

  const module = {
    id: avecOracle ? "coffre-bavard" : "coffre-muet",

    generate(seed: string): CoffreInstance {
      const rang = Number(seed.split("-").at(-1) ?? 0);
      return { secret: rang % MONDES, annonce: null, ouvert: false };
    },

    viewFor(): View {
      return vueMuette;
    },

    applyAction(instance: CoffreInstance, role: Role, action: Action): Retour {
      if (role === "A" && action.type === "place") {
        const annonce = { ...instance, annonce: action.from };
        if (!avecOracle) return { instance: annonce, feedback: { kind: "accepted" } };
        // La seule difference entre les deux jumelles.
        return {
          instance: annonce,
          feedback:
            action.from === instance.secret
              ? { kind: "accepted", hint: "le pene bouge" }
              : { kind: "rejected", hint: "rien ne bouge" },
        };
      }

      if (role === "B" && action.type === "validate") {
        if (instance.annonce !== instance.secret) {
          return { instance, feedback: { kind: "rejected", hint: "ferme" } };
        }
        return { instance: { ...instance, ouvert: true }, feedback: { kind: "accepted" } };
      }

      return { instance, feedback: { kind: "rejected", hint: "pas a vous" } };
    },

    isSolved(instance: CoffreInstance): boolean {
      return instance.ouvert;
    },

    solve(instance: CoffreInstance) {
      return [
        { role: "A" as Role, action: annoncer(instance.secret) },
        { role: "B" as Role, action: ouvrir },
      ];
    },

    actionsPossibles() {
      return [
        ...Array.from({ length: MONDES }, (_, index) => ({
          role: "A" as Role,
          action: annoncer(index),
        })),
        { role: "B" as Role, action: ouvrir },
      ];
    },

    metrics() {
      return {
        discreteElements: 1,
        exchanges: 1,
        solutionDepth: 2,
        branchingFactor: MONDES,
        estimatedMinutes: [1, 1] as [number, number],
      };
    },

    ambiguites(_role: Role, instance: CoffreInstance): CoffreInstance[] {
      return [{ ...instance, secret: (instance.secret + 1) % MONDES }];
    },

    candidats(
      _role: Role,
      instance: CoffreInstance,
      plafond: number,
    ): CoffreInstance[] {
      const sorties = [instance];
      for (let d = 1; d < MONDES && sorties.length < plafond; d++) {
        sorties.push({ ...instance, secret: (instance.secret + d) % MONDES });
      }
      return sorties;
    },
  };

  return module as unknown as OpaquePuzzleModule;
}

const definition = {
  id: "coffre",
  room: 0,
  primitives: [],
  module: "coffre",
  roles: {},
  budget: { maxDiscreteElements: 15, targetExchanges: 1, targetMinutes: [1, 1] },
  failure: { costSeconds: 0, resetsPuzzle: false, feedback: "informative" },
} as unknown as PuzzleDefinition;

const SEEDS = seedsDeVerification(12, "plancher");

describe("le plancher de residu a des dents", () => {
  it("refuse une salle ou un role peut forcer seul", () => {
    const resultat = verifierObligations(coffre(true), definition, SEEDS, 5);

    expect(resultat.residu).toBe(false);
    expect(resultat.rolesQuiSondent).toContain("A");
    expect(resultat.echecs.some((l) => l.startsWith("[residu/A]"))).toBe(true);
  });

  it("accepte la meme salle des que l'oracle se tait", () => {
    const resultat = verifierObligations(coffre(false), definition, SEEDS, 5);

    // Meme nombre de mondes, meme budget, meme profondeur, meme solution :
    // seule la reponse a l'annonce a change. C'est bien l'oracle que
    // l'obligation mesure, et pas la taille de la classe.
    expect(resultat.residu).toBe(true);
    expect(resultat.rolesQuiSondent).not.toContain("A");
  });
});
