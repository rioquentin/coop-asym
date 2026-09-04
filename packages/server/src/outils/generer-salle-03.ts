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
 * Ecrit la salle 3 chiffree dans content/prod.
 *
 *   pnpm --filter @coop/server content:salle-03
 *
 * Comme la salle 2, il n'y a rien a tirer : le lieu est construit a chaque
 * partie depuis le seed. Le lexique, lui, n'est pas tire du tout — il est
 * REPRIS de la salle 1, glyphes et sens compris. C'est la regle de continuite
 * de docs/puzzle-spec.md section 3, et le module la fait respecter en
 * chargeant la salle 1 lui-meme.
 *
 * Ce que ce fichier fixe est le cahier des charges : LEXIQUE + TOPOLOGIE,
 * 9 a 13 elements a transmettre, 5 a 8 minutes.
 */

const NOM = "room-03";
const DOSSIER_PROD = join(RACINE, "content/prod");

const definition: PuzzleDefinition = {
  id: "salle-03",
  room: 3,
  primitives: ["LEXIQUE", "TOPOLOGIE"],
  module: "src/puzzles/releve/index.ts",
  reusesLexiconFrom: ["salle-01"],
  roles: {
    A: {
      component: "RelevePanel",
      canAct: true,
      sees: ["largeur", "hauteur", "murs", "marques", "attendus"],
    },
    B: {
      component: "ArpentPanel",
      canAct: true,
      sees: ["ouvertures", "grave"],
    },
  },
  budget: {
    maxDiscreteElements: 13,
    targetExchanges: 13,
    targetMinutes: [5, 8],
  },
  failure: { costSeconds: 0.5, resetsPuzzle: false, feedback: "informative" },
  content: {
    lexiqueDe: "room-01",
    largeur: 4,
    hauteur: 4,
    boucles: 2,
    // Plus de gravures que de releves : les gravures inutiles sont ce qui
    // rend le lexique necessaire plutot que decoratif.
    marques: 5,
    releves: 3,
    elementsMin: 9,
    elementsMax: 13,
  },
};

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

// Cette salle reprend le lexique d'une autre : elle doit donc le resoudre
// dans le MEME mode que celui ou elle sera jouee. En developpement le module
// reprendrait la fixture, et la salle ecrite ne correspondrait a rien.
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
