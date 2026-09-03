import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiffrer, cleContenu, validerDefinition } from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { chargerEnv, RACINE } from "./env";
import { rapportDEchec, rapportSansSpoil } from "./rapport";

/**
 * Ecrit la salle 2 chiffree dans content/prod.
 *
 *   pnpm --filter @coop/server content:salle-02
 *
 * Contrairement a la salle 1, il n'y a rien a tirer ici : le plan est
 * construit a chaque partie depuis le seed, pas fige dans le contenu. Une
 * partie rejouee donne un autre labyrinthe, et personne ne peut apprendre
 * celui-la par coeur — pas meme celui qui a ecrit le generateur.
 *
 * Ce que ce fichier fixe est le cahier des charges de docs/puzzle-spec.md :
 * TOPOLOGIE seule, aucun glyphe, 6 a 9 elements a transmettre, 3 a 5 minutes.
 */

const NOM = "room-02";
const DOSSIER_PROD = join(RACINE, "content/prod");

/**
 * Le plan fait 4x4 avec deux murs abattus en plus de l'arbre couvrant.
 *
 * Les boucles sont ce qui cree les symetries trompeuses : sans elles, la
 * topologie se devine trop vite. Les distances bornent le budget — chaque pas
 * dicte est une unite d'information, et il en faut deux de plus pour la
 * description de depart et l'annonce d'arrivee.
 */
const definition: PuzzleDefinition = {
  id: "salle-02",
  room: 2,
  primitives: ["TOPOLOGIE"],
  module: "src/puzzles/topologie/index.ts",
  roles: {
    A: {
      component: "PlanPanel",
      canAct: true,
      sees: ["largeur", "hauteur", "murs", "depot", "jalon"],
    },
    B: {
      component: "PostePanel",
      canAct: true,
      sees: ["ouvertures", "surLeDepot", "surLeJalon"],
    },
  },
  budget: {
    maxDiscreteElements: 9,
    targetExchanges: 10,
    targetMinutes: [3, 5],
  },
  failure: { costSeconds: 0.5, resetsPuzzle: false, feedback: "informative" },
  content: {
    largeur: 4,
    hauteur: 4,
    boucles: 2,
    distanceMin: 4,
    distanceMax: 7,
  },
};

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

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
