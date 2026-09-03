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
 * Les quatre obligations de verification, sur TOUTE la chaine des salles.
 * CLAUDE.md section 4.
 *
 * Le coeur du controle vit dans src/puzzles/obligations.ts, partage avec
 * l'outil qui verifie le contenu de production : le contenu reel doit passer
 * exactement les memes controles que les fixtures, et un controle qui existe
 * en deux exemplaires finit par diverger.
 *
 * Regle absolue de ce fichier : un echec n'imprime que l'identifiant de
 * l'assertion et le seed. Jamais une disposition, jamais un plan, jamais une
 * solution — le proprietaire du depot joue a ce jeu.
 */

const SEEDS = seedsDeVerification(500);
const ROLES: Role[] = ["A", "B"];

/**
 * Les cles que chaque vue a le droit de porter, par module.
 *
 * Une vue qui gagne un champ le gagne ici aussi, volontairement : c'est le
 * moment ou l'on se demande si ce champ ne donne pas a un role ce qui
 * appartient a l'autre.
 */
const CLES_DE_VUE: Record<string, Record<Role, string[]>> = {
  "src/puzzles/lexicon/index.ts": {
    A: ["kind", "slots", "tray"],
    B: ["kind", "legend", "slots", "target"],
  },
  "src/puzzles/topologie/index.ts": {
    A: ["depot", "hauteur", "jalon", "kind", "largeur", "murs"],
    B: ["kind", "ouvertures", "surLeDepot", "surLeJalon"],
  },
};

function echec(assertion: string, seed: string): never {
  throw new Error(`[${assertion}] seed=${seed}`);
}

for (const salle of CHAINE_DES_SALLES) {
  const definition = chargerDefinition(salle);
  const enigme = chargerModule(definition);
  const resultat = verifierObligations(enigme, definition, SEEDS);

  describe(`salle ${definition.room}`, () => {
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

    it("n'a releve aucune assertion en echec", () => {
      expect(resultat.echecs).toEqual([]);
    });

    it("obligation 1 — solvabilite sur 500 seeds", () => {
      expect(resultat.solvabilite).toBe(true);
      expect(resultat.seedsTestes).toBe(500);
    });

    it("obligation 2 — aucun etat gagnant en dehors du bon", () => {
      expect(resultat.rejet).toBe(true);
      // Un compteur, pas une valeur de solution. Voir D22.
      console.log(
        `[rejet] salle ${definition.room} : ${resultat.victoiresFortuites} ` +
          `victoires fortuites sur ${resultat.seedsTestes * resultat.tiragesParSeed} marches`,
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

    it("l'ambiguite se constate aussi sans temoin fabrique", () => {
      // Deuxieme angle, independant du module : on regroupe 500 instances par
      // vue et on verifie qu'une meme vue recouvre plusieurs solutions.
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

    it("aucune vue ne porte un champ de trop", () => {
      const attendues = CLES_DE_VUE[definition.module];
      expect(attendues, `cles de vue non declarees : ${definition.module}`)
        .toBeDefined();

      for (const seed of SEEDS) {
        for (const role of ROLES) {
          const cles = Object.keys(enigme.viewFor(role, enigme.generate(seed)))
            .sort()
            .join(",");
          if (cles !== attendues?.[role].join(",")) {
            echec(`vue-${role}/champs-inattendus`, seed);
          }
        }
      }
    });

    it("le solveur marche depuis un etat deja entame", () => {
      for (const seed of SEEDS.slice(0, 100)) {
        const rng = rngDepuis(`entame-${seed}`);
        let instance: unknown = enigme.generate(seed);

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

    it("les metriques sont exploitables et independantes de l'avancement", () => {
      const depart = enigme.generate(SEEDS[0] as string);
      const metriques = enigme.metrics(depart);

      expect(metriques.discreteElements).toBeGreaterThan(0);
      expect(metriques.exchanges).toBeGreaterThan(0);
      expect(metriques.solutionDepth).toBeGreaterThan(0);
      expect(metriques.branchingFactor).toBeGreaterThan(1);
      expect(metriques.estimatedMinutes).toEqual(
        definition.budget.targetMinutes,
      );

      const premiere = enigme.actionsPossibles(depart)[0] as PlannedAction;
      const entame = enigme.applyAction(
        depart,
        premiere.role,
        premiere.action,
      ).instance;
      expect(stable(enigme.metrics(entame))).toBe(
        stable(enigme.metrics(depart)),
      );
    });
  });
}

describe("chaine des salles", () => {
  it("suit l'echelle de docs/puzzle-spec.md section 3", () => {
    const definitions = CHAINE_DES_SALLES.map((s) => chargerDefinition(s));

    definitions.forEach((definition, index) => {
      expect(definition.room, "les salles se suivent").toBe(index + 1);
    });

    // Salle 1 : LEXIQUE seul. Salle 2 : TOPOLOGIE seule, aucun glyphe.
    expect(definitions[0]?.primitives).toEqual(["LEXIQUE"]);
    expect(definitions[1]?.primitives).toEqual(["TOPOLOGIE"]);
  });
});
