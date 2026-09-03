import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  chiffrer,
  cleContenu,
  dechiffrer,
  validerDefinition,
} from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { effacerFichier } from "./coffre";
import { chargerEnv, RACINE } from "./env";
import { rapportDEchec, rapportSansSpoil } from "./rapport";

/**
 * Pose l'habillage narratif sur une salle deja chiffree.
 *
 *   pnpm --filter @coop/server content:habiller <nom> <dressing.json>
 *
 * La salle est dechiffree EN MEMOIRE, on ne lui ajoute que la cle `dressing`,
 * et elle est rechiffree. Celui qui ecrit l'habillage n'a donc jamais besoin
 * de voir la mecanique de la salle : les glyphes et leur sens restent inconnus
 * de tout le monde, y compris de l'auteur de la prose.
 *
 * L'habillage doit tenir les contraintes de docs/world-bible.md section 5 :
 * 40 mots maximum par ecran d'ambiance, et aucun indice de resolution.
 */

const DOSSIER_PROD = join(RACINE, "content/prod");
const MOTS_MAX = 40;
const LABEL_MAX = 40;
const TEXTE_MAX = 280;

interface Habillage {
  roomLabel?: string;
  ambientText?: string;
}

const nom = process.argv[2];
const source = process.argv[3];

if (!nom || !source) {
  console.error("Usage : content:habiller <nom> <dressing.json>");
  process.exit(1);
}

chargerEnv();
if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

if (source.startsWith(RACINE)) {
  console.error("La source doit etre ecrite hors du depot.");
  process.exit(1);
}

const chemin = join(DOSSIER_PROD, `${nom}.enc`);
if (!existsSync(chemin) || !existsSync(source)) {
  console.error("Salle chiffree ou fichier d'habillage introuvable.");
  process.exit(1);
}

const cle = cleContenu();
const definition = JSON.parse(
  dechiffrer(readFileSync(chemin), cle),
) as PuzzleDefinition;

const habillage = JSON.parse(readFileSync(source, "utf8")) as Habillage;

// Verifications de forme. Les messages ne citent jamais le texte lui-meme.
if (habillage.roomLabel !== undefined) {
  if (habillage.roomLabel.length > LABEL_MAX) {
    console.error(`roomLabel depasse ${LABEL_MAX} caracteres.`);
    process.exit(1);
  }
}
if (habillage.ambientText !== undefined) {
  const mots = habillage.ambientText.trim().split(/\s+/).length;
  if (mots > MOTS_MAX) {
    console.error(
      `ambientText fait ${mots} mots, le maximum est ${MOTS_MAX}.\n` +
        "docs/world-bible.md section 5 : les joueurs se parlent, ils ne lisent pas.",
    );
    process.exit(1);
  }
  if (habillage.ambientText.length > TEXTE_MAX) {
    console.error(`ambientText depasse ${TEXTE_MAX} caracteres.`);
    process.exit(1);
  }
}

definition.dressing = {
  ...(habillage.roomLabel !== undefined
    ? { roomLabel: habillage.roomLabel }
    : {}),
  ...(habillage.ambientText !== undefined
    ? { ambientText: habillage.ambientText }
    : {}),
};

validerDefinition(definition, nom);

// L'habillage ne touche pas la mecanique, mais on ne rechiffre rien qui
// n'ait pas repasse ses obligations.
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

writeFileSync(chemin, chiffrer(JSON.stringify(definition), cle));
effacerFichier(source);

console.log(rapportSansSpoil(definition, resultat));
console.log("Habillage pose. Source effacee.");
