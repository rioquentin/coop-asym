import type { Role } from "@coop/shared";
import type { PuzzleDefinition } from "../content/types";
import type { OpaquePuzzleModule } from "./registry";
import { rngDepuis } from "./rng";
import type { PlannedAction } from "./types";

/**
 * Les quatre obligations de verification. CLAUDE.md section 4.
 *
 * Ce module est partage par la suite de tests et par l'outil en ligne de
 * commande qui verifie le contenu de production. C'est volontaire : le
 * contenu reel doit passer EXACTEMENT les memes controles que la fixture,
 * sans qu'aucun de ces controles n'ait besoin d'afficher ce qu'il a lu.
 *
 * Regle absolue : rien de ce qui sort d'ici ne cite une valeur. Un echec est
 * un identifiant d'assertion et un seed, point.
 */

const ROLES: readonly Role[] = ["A", "B"];
/** Plafond absolu du projet, contrainte C1. */
export const PLAFOND_C1 = 15;

/**
 * Combien de seeds subissent les controles chers.
 *
 * L'exploration exhaustive et la verification du contrat de `candidats`
 * coutent bien plus qu'un tirage. On les paie sur un echantillon en tete de
 * liste, et les controles lineaires tournent sur les 500. Les seeds sont
 * deterministes : cet echantillon est le meme d'une execution a l'autre, donc
 * une regression ne peut pas s'y cacher par chance.
 */
const SEEDS_CONTROLES_CHERS = 25;

/** Au-dela, on renonce a explorer : l'espace d'etats est trop grand. */
const PLAFOND_ETATS = 40_000;

/**
 * Une action jouee coute une seconde a qui la joue.
 *
 * Grossier, et volontairement : ce chiffre ne sert qu'a comparer un cout de
 * force brute a un budget de temps, et l'ordre de grandeur suffit a trancher.
 */
const SECONDES_PAR_ACTION = 1;

/**
 * Le plancher de residu, deduit de la salle et non choisi.
 *
 * Personne ne joue au hasard. La menace n'est pas la victoire fortuite, c'est
 * le joueur qui, plutot que de parler, essaie les mondes compatibles avec son
 * ecran les uns apres les autres. Une salle ne tient que si cette force brute
 * coute PLUS que le temps qu'elle s'accorde a elle-meme.
 *
 * Essayer un candidat, c'est jouer une solution entiere : `solutionDepth`
 * actions. Le plancher tombe donc tout seul —
 *
 *     N × solutionDepth × 1 s  >  maxMinutes × 60 s
 *
 * — et il n'y a rien a arbitrer : le seuil est celui qui rend le contournement
 * plus long que la salle. Une salle qui le rate n'est pas mal reglee, elle est
 * solvable sans coequipier.
 */
export function seuilDeResidu(
  definition: PuzzleDefinition,
  solutionDepth: number,
): number {
  const secondes = definition.budget.targetMinutes[1] * 60;
  const parEssai = Math.max(1, solutionDepth) * SECONDES_PAR_ACTION;
  return Math.floor(secondes / parEssai) + 1;
}

export interface ResultatObligations {
  solvabilite: boolean;
  rejet: boolean;
  asymetrie: boolean;
  budget: boolean;
  /** Cinquieme obligation : le residu tient le plancher, des deux cotes. */
  residu: boolean;
  seedsTestes: number;
  tiragesParSeed: number;
  /**
   * Marches au hasard ayant atteint la victoire. Un compteur, pas une valeur :
   * il dit a quel point l'enigme resiste au hasard. Voir D22.
   */
  victoiresFortuites: number;
  /**
   * Le plancher exige, et le plus petit residu observe de chaque cote.
   *
   * Ces trois nombres NE VONT PAS dans le rapport proprietaire : un residu
   * est une cardinalite, et une cardinalite se remonte au contenu. Ils
   * servent au diagnostic et au rapport d'analyse externe.
   */
  seuilResidu: number;
  residuMinimum: Record<Role, number>;
  /**
   * Seeds dont l'espace d'etats a ete parcouru en entier, et seeds ou le
   * parcours a bute sur PLAFOND_ETATS sans conclure.
   */
  seedsExplores: number;
  seedsTropGrands: number;
  /**
   * Roles qui, sur au moins un seed, tiennent un oracle : une action dont le
   * retour departage leur propre classe de residu. Le plancher ne s'applique
   * qu'a eux — les autres ont beau enumerer, ils n'avancent pas.
   *
   * Un role qui n'apparait pas ici ne peut pas forcer sa moitie de la salle.
   * Un role qui y apparait le peut, et c'est la que le plancher mord. Voir D70.
   */
  rolesQuiSondent: Role[];
  /** « [assertion] seed=... ». Jamais autre chose. */
  echecs: string[];
  metriques: {
    discreteElementsMediane: number;
    discreteElementsP95: number;
    exchanges: number;
    solutionDepth: number;
    branchingFactor: number;
    minutes: [number, number];
  };
}

/** JSON a cles triees : deux valeurs equivalentes donnent la meme chaine. */
export function stable(valeur: unknown): string {
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

/** Jeu de seeds reproductible. */
export function seedsDeVerification(nombre: number, prefixe = "verif"): string[] {
  return Array.from({ length: nombre }, (_, i) => `${prefixe}-${i}`);
}

function centile(valeurs: number[], fraction: number): number {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(
    triees.length - 1,
    Math.max(0, Math.ceil(fraction * triees.length) - 1),
  );
  return triees[rang] as number;
}

/**
 * Ce role peut-il departager sa propre classe de residu en agissant ?
 *
 * On joue chacune de ses actions sur chaque candidat et on regarde ce qui lui
 * revient : le genre du retour, son motif, et son propre ecran apres coup. Si
 * une seule action donne deux reponses differentes sur la classe, ce role
 * tient un oracle — il peut essayer, eliminer, recommencer. Si aucune ne le
 * fait, il a beau enumerer, il n'avance pas.
 */
/** Ce que ce role percoit apres avoir joue ce coup dans ce monde-la. */
function reponse(
  enigme: OpaquePuzzleModule,
  role: Role,
  coup: PlannedAction,
  monde: unknown,
): string {
  const retour = enigme.applyAction(monde, role, coup.action);
  return stable([
    retour.feedback.kind,
    retour.feedback.hint ?? null,
    enigme.viewFor(role, retour.instance),
  ]);
}

function separe(
  enigme: OpaquePuzzleModule,
  role: Role,
  coup: PlannedAction,
  classe: unknown[],
): boolean {
  const reponses = new Set<string>();
  for (const candidat of classe) {
    reponses.add(reponse(enigme, role, coup, candidat));
    if (reponses.size > 1) return true;
  }
  return false;
}

/**
 * Combien de fois ce role peut se payer une sonde.
 *
 * Une sonde est une action dont le retour DEPARTAGE sa propre classe de
 * residu : il la joue, il regarde ce qui revient, il elimine des mondes. Le
 * refus informatif exige par C2 est l'endroit ou ces oracles se cachent, donc
 * le motif du refus compte au meme titre que l'ecran.
 *
 * Enumerer des mondes ne sert a rien si l'on ne peut pas les departager, et
 * departager ne sert a rien si l'on ne peut le faire que trois fois. On ne
 * demande donc pas « existe-t-il un oracle » mais « combien de fois ». On
 * rejoue la sonde sur l'instance vraie et on compte tant qu'elle separe
 * encore : une ressource comptee s'epuise d'elle-meme et le compte s'arrete,
 * un oracle gratuit va jusqu'au plafond. Voir D70.
 */
function sondesAbordables(
  enigme: OpaquePuzzleModule,
  role: Role,
  instance: unknown,
  classe: unknown[],
  plafond: number,
): number {
  if (classe.length < 2) return 0;

  const separatrice = enigme
    .actionsPossibles(instance)
    .find((coup) => coup.role === role && separe(enigme, role, coup, classe));
  if (!separatrice) return 0;

  // On simule un joueur qui sonde et qui TIENT COMPTE de ce qu'il a vu : il
  // joue, il regarde ce qui revient dans le monde vrai, il jette les mondes
  // qui auraient repondu autre chose, et il recommence. Sans cet elagage on
  // compterait des sondes qui ne servent a rien — la meme question reposee
  // indefiniment — et toute ressource comptee semblerait inepuisable.
  let etat = instance;
  let mondes = classe;
  let comptees = 0;

  while (comptees < plafond && mondes.length > 1) {
    const encore = enigme
      .actionsPossibles(etat)
      .find((coup) => coup.role === role && separe(enigme, role, coup, mondes));
    if (!encore) break;

    comptees++;
    const vue = reponse(enigme, role, encore, etat);
    mondes = mondes
      .filter((monde) => reponse(enigme, role, encore, monde) === vue)
      .map((monde) => enigme.applyAction(monde, role, encore.action).instance);
    etat = enigme.applyAction(etat, role, encore.action).instance;
  }

  return comptees;
}

function appliquer(
  enigme: OpaquePuzzleModule,
  depart: unknown,
  plan: PlannedAction[],
): unknown {
  let instance = depart;
  for (const etape of plan) {
    instance = enigme.applyAction(instance, etape.role, etape.action).instance;
  }
  return instance;
}

export function verifierObligations(
  enigme: OpaquePuzzleModule,
  definition: PuzzleDefinition,
  seeds: string[],
  tiragesParSeed = 100,
): ResultatObligations {
  const echecs: string[] = [];
  const note = (assertion: string, seed: string): void => {
    const ligne = `[${assertion}] seed=${seed}`;
    if (!echecs.includes(ligne)) echecs.push(ligne);
  };

  let solvabilite = true;
  let rejet = true;
  let asymetrie = true;
  let budget = true;
  let residu = true;
  let victoiresFortuites = 0;
  let seuilResidu = 0;
  let seedsExplores = 0;
  let seedsTropGrands = 0;
  const rolesQuiSondent = new Set<Role>();
  const residuMinimum: Record<Role, number> = {
    A: Number.POSITIVE_INFINITY,
    B: Number.POSITIVE_INFINITY,
  };
  const elements: number[] = [];

  let rang = -1;
  for (const seed of seeds) {
    rang++;
    const depart = enigme.generate(seed);

    // Determinisme : le socle de tout le reste.
    if (stable(enigme.generate(seed)) !== stable(depart)) {
      note("determinisme", seed);
      solvabilite = false;
    }

    // --- Obligation 1 : solvabilite -------------------------------------
    let instance: unknown = depart;
    for (const etape of enigme.solve(depart)) {
      const resultat = enigme.applyAction(instance, etape.role, etape.action);
      if (resultat.feedback.kind !== "accepted") {
        note("solvabilite/action-refusee", seed);
        solvabilite = false;
      }
      instance = resultat.instance;
    }
    if (!enigme.isSolved(instance)) {
      note("solvabilite", seed);
      solvabilite = false;
    }

    const metriques = enigme.metrics(depart);
    elements.push(metriques.discreteElements);

    // --- Obligation 2 : rejet -------------------------------------------
    // On verifie la propriete que l'enonce protege, et qui est plus forte :
    // il n'existe aucun etat gagnant en dehors du bon. Voir D22.
    //
    // « Le bon » se mesure sur les seuls champs DECISIFS, et on les trouve
    // par perturbation : un champ est decisif si le remettre a sa valeur de
    // depart casse la victoire. Tout le reste est incident — un jalon pose en
    // chemin, la case ou l'on se trouve une fois le releve complet — et
    // l'exiger identique reviendrait a refuser des parties gagnantes
    // parfaitement legitimes. Voir D43 et D47.
    //
    // La perturbation champ par champ a un angle mort, et il est structurel :
    // elle GELE ce qu'elle juge incident, donc elle ne regarde jamais la
    // region ou ces champs varient. Deux champs anodins pris separement
    // peuvent decider ensemble. On regarde donc aussi les PAIRES, et on
    // n'ajoute une paire que si aucun de ses deux membres ne decidait seul :
    // ajouter un champ deja couvert reviendrait a exiger une partie gagnante
    // identique a la partie canonique, ce que la salle n'a jamais demande.
    const canonique = appliquer(enigme, depart, enigme.solve(depart));
    const avant = (cle: string): unknown =>
      (depart as Record<string, unknown>)[cle];
    const restaure = (cles: string[]): Record<string, unknown> => {
      const perturbee = { ...(canonique as Record<string, unknown>) };
      for (const cle of cles) perturbee[cle] = avant(cle);
      return perturbee;
    };

    const touches = Object.keys(canonique as Record<string, unknown>).filter(
      (cle) =>
        stable(avant(cle)) !==
        stable((canonique as Record<string, unknown>)[cle]),
    );

    const decideSeul = new Set(
      touches.filter((cle) => !enigme.isSolved(restaure([cle]))),
    );
    const clesQuiComptent = [...decideSeul];

    for (let i = 0; i < touches.length; i++) {
      for (let j = i + 1; j < touches.length; j++) {
        const gauche = touches[i] as string;
        const droite = touches[j] as string;
        if (decideSeul.has(gauche) || decideSeul.has(droite)) continue;
        if (enigme.isSolved(restaure([gauche, droite]))) continue;
        if (!clesQuiComptent.includes(gauche)) clesQuiComptent.push(gauche);
        if (!clesQuiComptent.includes(droite)) clesQuiComptent.push(droite);
      }
    }

    if (clesQuiComptent.length === 0) {
      // Une solution qui ne change rien ne prouve rien.
      note("rejet/solution-sans-effet", seed);
      rejet = false;
    }

    const empreinte = (etat: unknown): string =>
      stable(
        Object.fromEntries(
          clesQuiComptent.map((cle) => [
            cle,
            (etat as Record<string, unknown>)[cle],
          ]),
        ),
      );

    const attendu = empreinte(canonique);
    const longueur = 2 * metriques.solutionDepth;
    const rng = rngDepuis(`rejet-${seed}`);

    for (let tirage = 0; tirage < tiragesParSeed; tirage++) {
      let marche: unknown = depart;
      for (let pas = 0; pas < longueur; pas++) {
        const possibles = enigme.actionsPossibles(marche);
        const choix = possibles[rng.entier(possibles.length)] as PlannedAction;
        marche = enigme.applyAction(marche, choix.role, choix.action).instance;

        if (enigme.isSolved(marche)) {
          victoiresFortuites++;
          if (empreinte(marche) !== attendu) {
            note("rejet", seed);
            rejet = false;
          }
          break;
        }
      }
    }

    // Le tirage au hasard ne visite qu'un couloir de l'espace d'etats, et il
    // le visite d'autant moins qu'il est long. Sur un echantillon de seeds on
    // le parcourt EN ENTIER : la question « existe-t-il un etat gagnant en
    // dehors du bon » cesse alors d'etre sondee pour etre tranchee.
    if (rang < SEEDS_CONTROLES_CHERS) {
      const vus = new Set<string>([stable(depart)]);
      const file: unknown[] = [depart];
      let borne = false;

      while (file.length > 0 && !borne) {
        const etat = file.shift();
        if (enigme.isSolved(etat) && empreinte(etat) !== attendu) {
          note("rejet/exhaustif", seed);
          rejet = false;
          break;
        }
        for (const coup of enigme.actionsPossibles(etat)) {
          const suivant = enigme.applyAction(
            etat,
            coup.role,
            coup.action,
          ).instance;
          const cle = stable(suivant);
          if (vus.has(cle)) continue;
          if (vus.size >= PLAFOND_ETATS) {
            borne = true;
            break;
          }
          vus.add(cle);
          file.push(suivant);
        }
      }

      if (borne) seedsTropGrands++;
      else seedsExplores++;
    }

    // --- Obligation 5 : residu depuis une seule vue ----------------------
    // Combien de mondes restent a qui n'a que son ecran. Voir seuilDeResidu.
    const seuil = seuilDeResidu(definition, metriques.solutionDepth);

    for (const role of ROLES) {
      const classe = enigme.candidats(role, depart, seuil);
      const vue = stable(enigme.viewFor(role, depart));
      const vus = new Set<string>();
      let conforme = classe.length > 0 && stable(classe[0]) === stable(depart);

      for (const candidat of classe) {
        if (!conforme) break;
        const empreinteC = stable(candidat);
        if (vus.has(empreinteC)) conforme = false;
        vus.add(empreinteC);
        if (stable(enigme.viewFor(role, candidat)) !== vue) conforme = false;
        // Un candidat qui ne tient pas debout ne compte pas : sans ce
        // controle, un module gonflerait son residu avec n'importe quoi.
        if (
          conforme &&
          rang < SEEDS_CONTROLES_CHERS &&
          !enigme.isSolved(appliquer(enigme, candidat, enigme.solve(candidat)))
        ) {
          conforme = false;
        }
      }

      // Le plancher ne s'applique qu'a proportion de ce que le role peut
      // sonder. Voir sondesAbordables.
      const sondes = conforme
        ? sondesAbordables(enigme, role, depart, classe, seuil)
        : 0;
      if (sondes > 0) rolesQuiSondent.add(role);

      if (!conforme) {
        note(`residu/contrat/${role}`, seed);
        residu = false;
      } else if (sondes === 0) {
        // Aucun oracle : ce role ne peut pas forcer sa moitie, quel que soit
        // son residu. Lui demander un gros residu deformerait la salle pour
        // satisfaire une mesure qui ne mesure rien chez lui.
      } else if (sondes >= seuil) {
        // Oracle gratuit : il peut essayer autant de fois qu'il a de temps.
        if (classe.length < seuil) {
          note(`residu/${role}`, seed);
          residu = false;
        }
      } else if (classe.length <= sondes + 1) {
        // Oracle compte : k sondes departagent k+1 mondes — le dernier se
        // reconnait par elimination, sans etre essaye.
        note(`residu/${role}`, seed);
        residu = false;
      }

      residuMinimum[role] = Math.min(residuMinimum[role], classe.length);
    }
    seuilResidu = Math.max(seuilResidu, seuil);

    // --- Obligation 3 : asymetrie ---------------------------------------
    for (const role of ROLES) {
      const vue = stable(enigme.viewFor(role, depart));
      const solution = stable(enigme.solve(depart));

      const temoins = enigme
        .ambiguites(role, depart)
        .filter((voisin: unknown) => stable(enigme.viewFor(role, voisin)) === vue)
        .filter((voisin: unknown) => stable(enigme.solve(voisin)) !== solution)
        // Un temoin fabrique ne prouve rien s'il ne tient pas debout. On exige
        // qu'il soit lui-meme resoluble : sinon un module pourrait rendre
        // n'importe quel objet et passer l'obligation la plus importante du
        // projet. Voir D48.
        .filter((voisin: unknown) =>
          enigme.isSolved(appliquer(enigme, voisin, enigme.solve(voisin))),
        );

      if (temoins.length === 0) {
        note(`asymetrie/${role}`, seed);
        asymetrie = false;
      }
    }

    // --- Obligation 4 : budget ------------------------------------------
    if (metriques.discreteElements > PLAFOND_C1) {
      note("budget/C1", seed);
      budget = false;
    }
    if (metriques.discreteElements > definition.budget.maxDiscreteElements) {
      note("budget/definition", seed);
      budget = false;
    }
  }

  const reference = enigme.metrics(enigme.generate(seeds[0] as string));

  return {
    solvabilite,
    rejet,
    asymetrie,
    budget,
    residu,
    seedsTestes: seeds.length,
    tiragesParSeed,
    victoiresFortuites,
    seuilResidu,
    residuMinimum,
    seedsExplores,
    seedsTropGrands,
    rolesQuiSondent: [...rolesQuiSondent],
    echecs,
    metriques: {
      discreteElementsMediane: centile(elements, 0.5),
      discreteElementsP95: centile(elements, 0.95),
      exchanges: reference.exchanges,
      solutionDepth: reference.solutionDepth,
      branchingFactor: reference.branchingFactor,
      minutes: reference.estimatedMinutes,
    },
  };
}
