import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiffrer, cleContenu } from "../content/loader";
import { effacerFichier } from "./coffre";
import { chargerEnv, RACINE } from "./env";

/**
 * Chiffre un document JSON dans content/prod et efface la source.
 *
 *   pnpm --filter @coop/server content:chiffrer <source.json> <nom>
 *
 * Sert aux documents qui ne sont pas des definitions d'enigme — la trame
 * narrative, par exemple — et qui n'ont donc pas de schema a respecter.
 *
 * La source DOIT etre ecrite hors du depot. Elle est effacee ici, mais un
 * clair pose dans content/ le temps d'un commit serait un clair de trop.
 *
 * Rien de ce que ce programme affiche ne decrit ce qu'il a chiffre.
 */

const DOSSIER_PROD = join(RACINE, "content/prod");

const source = process.argv[2];
const nom = process.argv[3];

if (!source || !nom) {
  console.error("Usage : content:chiffrer <source.json> <nom>");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(nom)) {
  console.error("Le nom doit etre en minuscules, chiffres et tirets.");
  process.exit(1);
}

chargerEnv();
if (!process.env["CONTENT_KEY"]) {
  console.error(
    "CONTENT_KEY absente. Lance d'abord :\n" +
      "  pnpm --filter @coop/server content:cle",
  );
  process.exit(1);
}

if (source.startsWith(RACINE)) {
  console.error(
    "La source doit etre ecrite hors du depot : un clair dans content/ risque\n" +
      "d'etre commite avant d'etre efface.",
  );
  process.exit(1);
}

if (!existsSync(source)) {
  console.error(`Source introuvable : ${source}`);
  process.exit(1);
}

const destination = join(DOSSIER_PROD, `${nom}.enc`);
if (existsSync(destination) && !process.argv.includes("--remplacer")) {
  console.error(
    `${destination} existe deja. Ajoute --remplacer si c'est voulu.\n` +
      "Sans la cle d'origine, un contenu remplace est definitivement perdu.",
  );
  process.exit(1);
}

const clair = readFileSync(source, "utf8");
try {
  JSON.parse(clair);
} catch {
  // On ne montre pas ce qui n'a pas pu etre lu.
  console.error("La source n'est pas du JSON valide. Rien n'a ete ecrit.");
  process.exit(1);
}

mkdirSync(DOSSIER_PROD, { recursive: true });
const paquet = chiffrer(clair, cleContenu());
writeFileSync(destination, paquet);
effacerFichier(source);

console.log(
  `content/prod/${nom}.enc ecrit (${paquet.length} octets chiffres).\n` +
    "Source effacee.",
);
