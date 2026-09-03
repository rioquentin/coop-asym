import { describe, expect, it } from "vitest";
import type { Role } from "@coop/shared";
import { CHAINE_DES_SALLES } from "../content/chaine";
import { chargerDefinition } from "../content/loader";
import {
  PLAFOND_C1,
  seedsDeVerification,
  stable,
  verifierObligations,
} from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { rngDepuis } from "../puzzles/rng";
import type { PlannedAction } from "../puzzles/types";

/**
 * Les quatre obligations de verification. CLAUDE.md section 4.
 *
 * Le coeur du controle vit dans src/puzzles/obligations.ts, partage avec
 * l'outil qui verifie le contenu de production : le contenu reel doit passer
 * exactement les memes controles que la fixture, et un controle qui existe en
 * deux exemplaires finit par diverger.
 *
 * Regle absolue de ce fichier : un echec n'imprime que l'identifiant de
 * l'assertion et le seed. Jamais une disposition, jamais une legende, jamais
 * une solution — le proprietaire du depot joue a ce jeu.
 */

const definition = chargerDefinition(CHAINE_DES_SALLES[0]);
const enigme = chargerModule(definition);

const SEEDS = seedsDeVerification(500);
const ROLES: Role[] = ["A", "B"];

const resultat = verifierObligations(enigme, definition, SEEDS);

function echec(assertion: string, seed: string): never {
  throw new Error(`[${assertion}] seed=${seed}`);
}

describe("moteur d'enigmes", () => {
  it("genere la meme instance pour le meme seed", () => {
    for (const seed of SEEDS) {
      if (stable(enigme.generate(seed)) !== stable(enigme.generate(seed))) {
        echec("determinisme", seed);
      }
    }
  });

  it("ne genere pas la meme instance pour tous les seeds", () => {
    const distinctes = new Set(SEEDS.map((s) => stable(enigme.generate(s))));
    expect(distinctes.size).toBeGreaterThan(1);
  });
});

describe("les quatre obligations", () => {
  it("n'a releve aucune assertion en echec", () => {
    expect(resultat.echecs).toEqual([]);
  });

  it("obligation 1 — solvabilite sur 500 seeds", () => {
    expect(resultat.solvabilite).toBe(true);
    expect(resultat.seedsTestes).toBe(500);
  });

  it("obligation 2 — aucun etat gagnant en dehors du bon", () => {
    expect(resultat.rejet).toBe(true);
    // Un compteur, pas une valeur de solution : il dit combien de marches au
    // hasard ont abouti, ce qui est une information de design. Voir D22.
    console.log(
      `[rejet] ${resultat.victoiresFortuites} victoires fortuites sur ` +
        `${resultat.seedsTestes * resultat.tiragesParSeed} marches`,
    );
  });

  it("obligation 3 — asymetrie", () => {
    expect(resultat.asymetrie).toBe(true);
  });

  it("obligation 4 — budget de communication", () => {
    expect(resultat.budget).toBe(true);
    expect(resultat.metriques.discreteElementsP95).toBeLessThanOrEqual(
      PLAFOND_C1,
    );
    expect(resultat.metriques.discreteElementsP95).toBeLessThanOrEqual(
      definition.budget.maxDiscreteElements,
    );
  });
});

describe("asymetrie — deuxieme angle", () => {
  it("l'ambiguite se constate aussi sans temoin fabrique", () => {
    // Independant du module : on regroupe 500 instances par vue et on verifie
    // qu'une meme vue recouvre plusieurs solutions.
    for (const role of ROLES) {
      const parVue = new Map<string, Set<string>>();
      for (const seed of SEEDS) {
        const instance = enigme.generate(seed);
        const vue = stable(enigme.viewFor(role, instance));
        const solutions = parVue.get(vue) ?? new Set<string>();
        solutions.add(stable(enigme.solve(instance)));
        parVue.set(vue, solutions);
      }
      const ambigue = [...parVue.values()].some((s) => s.size > 1);
      expect(ambigue, `asymetrie-par-echantillon/${role}`).toBe(true);
    }
  });

  it("aucune vue ne porte les cles de l'autre", () => {
    for (const seed of SEEDS) {
      const instance = enigme.generate(seed);

      const vueA = stable(enigme.viewFor("A", instance));
      if (vueA.includes("legend") || vueA.includes("target")) {
        echec("asymetrie/vue-A-trop-riche", seed);
      }

      const vueB = stable(enigme.viewFor("B", instance));
      if (vueB.includes("tray")) {
        echec("asymetrie/vue-B-trop-riche", seed);
      }
    }
  });
});

describe("solveur", () => {
  it("marche aussi depuis un etat deja entame", () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const depart = enigme.generate(seed);
      const rng = rngDepuis(`entame-${seed}`);
      let instance: unknown = depart;

      // Trois coups au hasard, puis on demande au module de rattraper.
      for (let pas = 0; pas < 3; pas++) {
        const possibles = enigme.actionsPossibles(instance);
        const choix = possibles[rng.entier(possibles.length)] as PlannedAction;
        instance = enigme.applyAction(instance, choix.role, choix.action)
          .instance;
      }
      for (const etape of enigme.solve(instance)) {
        instance = enigme.applyAction(instance, etape.role, etape.action)
          .instance;
      }
      if (!enigme.isSolved(instance)) echec("solvabilite/reprise", seed);
    }
  });
});

describe("metriques", () => {
  it("sont exploitables", () => {
    const metriques = enigme.metrics(enigme.generate(SEEDS[0] as string));

    expect(metriques.discreteElements).toBeGreaterThan(0);
    expect(metriques.exchanges).toBeGreaterThan(0);
    expect(metriques.solutionDepth).toBeGreaterThan(0);
    expect(metriques.branchingFactor).toBeGreaterThan(1);
    expect(metriques.estimatedMinutes).toEqual(definition.budget.targetMinutes);
  });

  it("ne dependent pas de l'avancement", () => {
    const depart = enigme.generate(SEEDS[0] as string);
    const premiere = enigme.actionsPossibles(depart)[0] as PlannedAction;
    const entame = enigme.applyAction(
      depart,
      premiere.role,
      premiere.action,
    ).instance;

    expect(stable(enigme.metrics(entame))).toBe(stable(enigme.metrics(depart)));
  });
});
