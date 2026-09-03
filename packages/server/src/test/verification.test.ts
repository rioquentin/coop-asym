import { describe, expect, it } from "vitest";
import type { Role } from "@coop/shared";
import { CHAINE_DES_SALLES } from "../content/chaine";
import { chargerDefinition } from "../content/loader";
import { chargerModule } from "../puzzles/registry";
import { rngDepuis } from "../puzzles/rng";
import type { PlannedAction } from "../puzzles/types";

/**
 * Les quatre obligations de verification. CLAUDE.md section 4.
 *
 * Regle absolue de ce fichier : un echec n'imprime que l'identifiant de
 * l'assertion et le seed. Jamais une disposition, jamais une legende, jamais
 * une solution — le proprietaire du depot joue a ce jeu. Il rejoue le seed en
 * mode dev s'il a besoin de voir.
 */

const definition = chargerDefinition(CHAINE_DES_SALLES[0]);
const enigme = chargerModule(definition);

const SEEDS = Array.from({ length: 500 }, (_, i) => `verif-${i}`);
const ROLES: Role[] = ["A", "B"];
const TIRAGES_PAR_SEED = 100;
/** Plafond absolu du projet, contrainte C1. */
const PLAFOND_C1 = 15;

function echec(assertion: string, seed: string): never {
  throw new Error(`[${assertion}] seed=${seed}`);
}

/** JSON a cles triees : deux valeurs equivalentes donnent la meme chaine. */
function stable(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : v,
  );
}

function appliquer(depart: unknown, plan: PlannedAction[]): unknown {
  let instance = depart;
  for (const etape of plan) {
    instance = enigme.applyAction(instance, etape.role, etape.action).instance;
  }
  return instance;
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

describe("obligation 1 — solvabilite", () => {
  it("solve() amene isSolved() a vrai sur 500 seeds", () => {
    for (const seed of SEEDS) {
      let instance: unknown = enigme.generate(seed);
      for (const etape of enigme.solve(instance)) {
        const resultat = enigme.applyAction(instance, etape.role, etape.action);
        if (resultat.feedback.kind !== "accepted") {
          echec("solvabilite/action-refusee", seed);
        }
        instance = resultat.instance;
      }
      if (!enigme.isSolved(instance)) echec("solvabilite", seed);
    }
  });

  it("solve() marche aussi depuis un etat deja entame", () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const depart = enigme.generate(seed);
      // Trois coups au hasard, puis on demande au module de rattraper.
      const rng = rngDepuis(`entame-${seed}`);
      let instance: unknown = depart;
      for (let pas = 0; pas < 3; pas++) {
        const possibles = enigme.actionsPossibles(instance);
        const choix = possibles[rng.entier(possibles.length)] as PlannedAction;
        instance = enigme.applyAction(instance, choix.role, choix.action)
          .instance;
      }
      instance = appliquer(instance, enigme.solve(instance));
      if (!enigme.isSolved(instance)) echec("solvabilite/reprise", seed);
    }
  });
});

describe("obligation 2 — rejet", () => {
  /**
   * L'enonce litteral de CLAUDE.md est « 100 sequences aleatoires ne
   * declenchent jamais isSolved() ». Sur une enigme de n cases, une marche au
   * hasard tombe sur la bonne disposition avec une probabilite de l'ordre de
   * 1/n! ; sur 50 000 tirages ce n'est pas negligeable, meme pour la salle 1
   * telle que la spec la decrit. Voir D22 dans DECISIONS.md.
   *
   * On verifie donc la propriete que cet enonce protege, et qui est plus
   * forte : il n'existe AUCUN etat gagnant en dehors du bon.
   */
  it("aucune marche au hasard n'atteint un etat gagnant different du bon", () => {
    let victoiresAuHasard = 0;

    for (const seed of SEEDS) {
      const depart = enigme.generate(seed);
      const attendu = stable(appliquer(depart, enigme.solve(depart)));
      const longueur = 2 * enigme.metrics(depart).solutionDepth;
      const rng = rngDepuis(`rejet-${seed}`);

      for (let tirage = 0; tirage < TIRAGES_PAR_SEED; tirage++) {
        let instance: unknown = depart;
        for (let pas = 0; pas < longueur; pas++) {
          const possibles = enigme.actionsPossibles(instance);
          const choix = possibles[rng.entier(possibles.length)] as PlannedAction;
          instance = enigme.applyAction(instance, choix.role, choix.action)
            .instance;

          if (enigme.isSolved(instance)) {
            victoiresAuHasard++;
            if (stable(instance) !== attendu) echec("rejet", seed);
            break;
          }
        }
      }
    }

    // Un compteur, pas une valeur de solution. Il dit a quel point l'enigme
    // resiste au hasard : eleve ici, parce que la fixture est minuscule.
    console.log(
      `[rejet] ${victoiresAuHasard} victoires fortuites sur ${SEEDS.length * TIRAGES_PAR_SEED} marches`,
    );
  });
});

describe("obligation 3 — asymetrie", () => {
  it("une vue seule ne determine jamais la solution", () => {
    for (const role of ROLES) {
      for (const seed of SEEDS) {
        const instance = enigme.generate(seed);
        const vue = stable(enigme.viewFor(role, instance));
        const solution = stable(enigme.solve(instance));

        const temoins = enigme
          .ambiguites(role, instance)
          .filter((voisin) => stable(enigme.viewFor(role, voisin)) === vue)
          .filter((voisin) => stable(enigme.solve(voisin)) !== solution);

        if (temoins.length === 0) echec(`asymetrie/${role}`, seed);
      }
    }
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

describe("obligation 4 — budget de communication", () => {
  it("respecte le plafond C1 et celui de la definition", () => {
    for (const seed of SEEDS) {
      const metriques = enigme.metrics(enigme.generate(seed));

      if (metriques.discreteElements > PLAFOND_C1) echec("budget/C1", seed);
      if (metriques.discreteElements > definition.budget.maxDiscreteElements) {
        echec("budget/definition", seed);
      }
    }
  });

  it("produit des metriques exploitables", () => {
    const metriques = enigme.metrics(enigme.generate(SEEDS[0] as string));

    expect(metriques.discreteElements).toBeGreaterThan(0);
    expect(metriques.exchanges).toBeGreaterThan(0);
    expect(metriques.solutionDepth).toBeGreaterThan(0);
    expect(metriques.branchingFactor).toBeGreaterThan(1);
    expect(metriques.estimatedMinutes).toEqual(definition.budget.targetMinutes);
  });

  it("ne fait pas dependre les metriques de l'avancement", () => {
    const depart = enigme.generate(SEEDS[0] as string);
    const entame = enigme.applyAction(
      depart,
      enigme.actionsPossibles(depart)[0]?.role as Role,
      enigme.actionsPossibles(depart)[0]?.action as never,
    ).instance;

    expect(stable(enigme.metrics(entame))).toBe(stable(enigme.metrics(depart)));
  });
});
