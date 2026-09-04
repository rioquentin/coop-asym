import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  chiffrer,
  cleContenu,
  oublierDefinitions,
  validerDefinition,
} from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { chargerEnv, RACINE } from "./env";
import { rapportDEchec, rapportSansSpoil } from "./rapport";

/**
 * Ecrit la salle 4 chiffree dans content/prod.
 *
 *   pnpm --filter @coop/server content:salle-04
 *
 * Rien a tirer ici non plus : la suite et les deux claviers sont construits a
 * chaque partie depuis le seed. Le lexique est REPRIS de la salle 1 — zero
 * vocabulaire neuf, comme l'exige docs/puzzle-spec.md section 3.
 *
 * Cahier des charges : SIMULTANEITE seule, 8 a 12 elements a transmettre,
 * 4 a 7 minutes.
 */

const NOM = "room-04";
const DOSSIER_PROD = join(RACINE, "content/prod");

const definition: PuzzleDefinition = {
  id: "salle-04",
  room: 4,
  primitives: ["SIMULTANEITE"],
  module: "src/puzzles/litanie/index.ts",
  reusesLexiconFrom: ["salle-01"],
  roles: {
    A: { component: "LitaniePanel", canAct: true, sees: ["suite", "clavierA"] },
    B: { component: "ClavierPanel", canAct: true, sees: ["clavierB"] },
  },
  budget: {
    maxDiscreteElements: 12,
    targetExchanges: 12,
    targetMinutes: [4, 7],
  },
  failure: { costSeconds: 0.5, resetsPuzzle: false, feedback: "informative" },
  content: {
    lexiqueDe: "room-01",
    // La longueur est le seul levier de difficulte de cette salle : c'est ce
    // qu'il faut retenir avant d'armer le mecanisme. Les repetitions la font
    // depasser le nombre de glyphes disponibles.
    longueur: 9,
  },
};

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

// Cette salle reprend le lexique d'une autre : elle doit le resoudre dans le
// meme monde que celui ou elle sera jouee. Voir D53.
process.env["NODE_ENV"] = "production";
oublierDefinitions();

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
