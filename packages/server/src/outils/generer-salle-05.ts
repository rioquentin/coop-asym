import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  chiffrer,
  cleContenu,
  dechiffrer,
  oublierDefinitions,
  validerDefinition,
} from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { chargerEnv, RACINE } from "./env";
import { rapportDEchec, rapportSansSpoil } from "./rapport";

/**
 * Ecrit la salle 5 chiffree dans content/prod.
 *
 *   pnpm --filter @coop/server content:salle-05
 *
 * C'est la seule salle dont la mecanique n'est pas choisie ici : elle est deja
 * ecrite dans la trame narrative, chiffree. Ce programme la LIT et la recopie
 * dans la definition, sans jamais l'afficher. Personne ne l'apprend au passage
 * — ni celui qui lance la commande, ni celui qui a ecrit ce fichier.
 *
 * La regle d'inversion de docs/puzzle-spec.md section 3 exige que le
 * retournement soit mecanique ET narratif, porte par la meme inversion. La
 * trame porte le versant narratif ; ce champ porte le versant mecanique, et
 * c'est le meme choix.
 *
 * Cahier des charges : 10 a 15 elements a transmettre, 5 a 9 minutes.
 */

const NOM = "room-05";
const DOSSIER_PROD = join(RACINE, "content/prod");

/** Les deux retournements que le module sait appliquer. */
const INVERSIONS_IMPLEMENTEES = ["ROLES_ECHANGES", "LEXIQUE_INVERSE"];

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

// Cette salle reprend le lexique de la salle 1 : meme monde que celui ou elle
// sera jouee. Voir D53.
process.env["NODE_ENV"] = "production";
oublierDefinitions();

const cheminTrame = join(DOSSIER_PROD, "trame.enc");
if (!existsSync(cheminTrame)) {
  console.error(
    "content/prod/trame.enc est absent : la salle 5 ne peut pas etre ecrite\n" +
      "sans savoir quel retournement la trame a retenu.",
  );
  process.exit(1);
}

const trame = JSON.parse(
  dechiffrer(readFileSync(cheminTrame), cleContenu()),
) as { inversion?: { mecanique?: string } };

const inversion = trame.inversion?.mecanique;
if (typeof inversion !== "string" || !INVERSIONS_IMPLEMENTEES.includes(inversion)) {
  // On ne cite pas la valeur lue : ce serait dire le retournement.
  console.error(
    "La trame porte un retournement que le module ne sait pas appliquer.\n" +
      `Formes implementees : ${INVERSIONS_IMPLEMENTEES.join(", ")}.`,
  );
  process.exit(1);
}

const definition: PuzzleDefinition = {
  id: "salle-05",
  room: 5,
  primitives: ["ETAT_CROISE"],
  module: "src/puzzles/litanie/index.ts",
  reusesLexiconFrom: ["salle-01"],
  roles: {
    A: { component: "LitaniePanel", canAct: true, sees: ["clavier"] },
    B: { component: "ClavierPanel", canAct: true, sees: ["clavier"] },
  },
  budget: {
    maxDiscreteElements: 15,
    targetExchanges: 13,
    targetMinutes: [5, 9],
  },
  // Le schema note « informative partout sauf salle 5 ». Le raisonnement qui
  // a conduit a garder informatif ici est chiffre avec le reste des decisions
  // de cette salle. Voir CLAUDE.md section 1.
  failure: { costSeconds: 0.5, resetsPuzzle: false, feedback: "informative" },
  content: {
    lexiqueDe: "room-01",
    longueur: 10,
    inversion,
  },
};

const destination = join(DOSSIER_PROD, `${NOM}.enc`);
if (existsSync(destination) && !process.argv.includes("--remplacer")) {
  console.error(
    `${destination} existe deja. Ajoute --remplacer si c'est voulu.\n` +
      "Un remplacement efface l'habillage deja pose sur cette salle.",
  );
  process.exit(1);
}

validerDefinition(definition, NOM);

const resultat = verifierObligations(
  chargerModule(definition),
  definition,
  seedsDeVerification(500),
);

if (
  !resultat.solvabilite ||
  !resultat.rejet ||
  !resultat.asymetrie ||
  !resultat.budget
) {
  console.error(rapportDEchec(resultat));
  process.exit(1);
}

mkdirSync(DOSSIER_PROD, { recursive: true });
writeFileSync(destination, chiffrer(JSON.stringify(definition), cleContenu()));

console.log(rapportSansSpoil(definition, resultat));
